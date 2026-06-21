import { supabase } from '@/integrations/supabase/client';
import { normalizeCallId } from './normalizeCallId';
import { LOG_PREFIX, type CampaignEventData } from './types';

/**
 * Campaign Data Store
 * 
 * Stores pending campaign data that arrives BEFORE the actual call.
 * Data is attached to the call record once it's created.
 * 
 * Uses window-level storage to survive Vite HMR module reloads.
 */

const STORE_KEY = '__softphone_campaign_data__';
const TIMEOUT_KEY = '__softphone_campaign_timeouts__';

function getPendingData(): Map<string, CampaignEventData> {
  if (!(window as any)[STORE_KEY]) {
    (window as any)[STORE_KEY] = new Map<string, CampaignEventData>();
  }
  return (window as any)[STORE_KEY];
}

function getTimeouts(): Map<string, NodeJS.Timeout> {
  if (!(window as any)[TIMEOUT_KEY]) {
    (window as any)[TIMEOUT_KEY] = new Map<string, NodeJS.Timeout>();
  }
  return (window as any)[TIMEOUT_KEY];
}

const CLEANUP_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Store campaign data for later attachment when call is created
 */
export function storeCampaignData(campaignData: CampaignEventData): void {
  if (!campaignData.call_id) {
    console.warn(`${LOG_PREFIX} Campaign event missing call_id, skipping`);
    return;
  }
  
  const pendingCampaignData = getPendingData();
  const cleanupTimeouts = getTimeouts();
  
  // Store campaign data by call_id
  pendingCampaignData.set(campaignData.call_id, campaignData);
  console.log(`${LOG_PREFIX} Stored campaign data for call_id:`, campaignData.call_id);
  
  // Also try storing by strategy_call_id as backup
  if (campaignData.strategy_call_id && campaignData.strategy_call_id !== campaignData.call_id) {
    pendingCampaignData.set(campaignData.strategy_call_id, campaignData);
    console.log(`${LOG_PREFIX} Also stored by strategy_call_id:`, campaignData.strategy_call_id);
  }
  
  // Store by phone suffix (last 9 digits) as fallback key
  if (campaignData.client_phone) {
    const phoneSuffix = campaignData.client_phone.replace(/\D/g, '').slice(-9);
    if (phoneSuffix.length >= 7) {
      pendingCampaignData.set(`phone:${phoneSuffix}`, campaignData);
      console.log(`${LOG_PREFIX} Also stored by phone suffix:`, phoneSuffix);
    }
  }
  
  // Clear any existing cleanup timeout
  const existingTimeout = cleanupTimeouts.get(campaignData.call_id);
  if (existingTimeout) {
    clearTimeout(existingTimeout);
  }
  
  // Set cleanup timeout - in case call never happens
  const cleanupTimeout = setTimeout(() => {
    cleanupCampaignData(campaignData.call_id, campaignData.strategy_call_id, campaignData.client_phone);
    console.log(`${LOG_PREFIX} Cleaned up stale campaign data for:`, campaignData.call_id);
  }, CLEANUP_TIMEOUT_MS);
  
  cleanupTimeouts.set(campaignData.call_id, cleanupTimeout);
}

/**
 * Find campaign data by external_call_id
 */
export function findCampaignData(externalCallId: string, phone?: string): CampaignEventData | null {
  const pendingCampaignData = getPendingData();
  const normalizedId = normalizeCallId(externalCallId);
  
  // Try exact matches first
  let campaignData = pendingCampaignData.get(externalCallId) || 
                     pendingCampaignData.get(normalizedId);
  
  // Also try partial matches by call ID
  if (!campaignData) {
    for (const [key, data] of pendingCampaignData.entries()) {
      if (key.startsWith('phone:')) continue; // skip phone keys in partial match
      if (externalCallId.includes(key) || normalizedId.includes(key) ||
          key.includes(externalCallId) || key.includes(normalizedId)) {
        campaignData = data;
        console.log(`${LOG_PREFIX} Found campaign data by partial match:`, key);
        break;
      }
    }
  }
  
  // Fallback: match by phone suffix (last 9 digits)
  if (!campaignData && phone) {
    const phoneSuffix = phone.replace(/\D/g, '').slice(-9);
    if (phoneSuffix.length >= 7) {
      campaignData = pendingCampaignData.get(`phone:${phoneSuffix}`) || null;
      if (campaignData) {
        console.log(`${LOG_PREFIX} Found campaign data by phone suffix:`, phoneSuffix);
      }
    }
  }
  
  return campaignData || null;
}

/**
 * Clean up campaign data after successful attachment
 */
export function cleanupCampaignData(callId: string, strategyCallId?: string, clientPhone?: string): void {
  const pendingCampaignData = getPendingData();
  const cleanupTimeouts = getTimeouts();
  
  pendingCampaignData.delete(callId);
  if (strategyCallId) {
    pendingCampaignData.delete(strategyCallId);
  }
  if (clientPhone) {
    const phoneSuffix = clientPhone.replace(/\D/g, '').slice(-9);
    if (phoneSuffix.length >= 7) {
      pendingCampaignData.delete(`phone:${phoneSuffix}`);
    }
  }
  
  // Clear cleanup timeout
  const timeout = cleanupTimeouts.get(callId);
  if (timeout) {
    clearTimeout(timeout);
    cleanupTimeouts.delete(callId);
  }
}

/**
 * Cleanup all pending data (for hook unmount)
 */
export function cleanupAllCampaignData(): void {
  const cleanupTimeouts = getTimeouts();
  cleanupTimeouts.forEach(timeout => clearTimeout(timeout));
  cleanupTimeouts.clear();
  getPendingData().clear();
}

/**
 * Attach campaign data to call if available
 */
export async function attachCampaignDataToCall(callId: string, externalCallId: string, phone?: string): Promise<void> {
  const campaignData = findCampaignData(externalCallId, phone);
  
  if (!campaignData) {
    console.log(`${LOG_PREFIX} No pending campaign data found for:`, externalCallId, phone ? `(phone: ${phone})` : '');
    return;
  }
  
  console.log(`${LOG_PREFIX} Attaching campaign data to call:`, callId, campaignData);
  
  // First, get existing custom_fields to avoid overwriting
  const { data: currentCall } = await supabase
    .from('calls')
    .select('custom_fields')
    .eq('id', callId)
    .single();
  
  const existingFields = (currentCall?.custom_fields || {}) as Record<string, unknown>;
  const mergedCustomFields = {
    ...existingFields,
    campaign: {
      queue_id: campaignData.queue_id,
      queue_title: campaignData.queue_title,
      selection_id: campaignData.selection_id,
      selection_title: campaignData.selection_title,
      strategy_title: campaignData.strategy_title,
      company_id: campaignData.company_id,
      company_title: campaignData.company_title,
      abonent_id: campaignData.abonent_id,
      client_phone: campaignData.client_phone,
      progressive: campaignData.progressive,
    }
  };
  
  // Update call with merged custom_fields
  const { error } = await supabase
    .from('calls')
    .update({ custom_fields: mergedCustomFields })
    .eq('id', callId);
  
  if (error) {
    console.error(`${LOG_PREFIX} Error attaching campaign data:`, error);
  } else {
    console.log(`${LOG_PREFIX} Successfully attached campaign data to call:`, callId);
    
    // Clean up stored data
    cleanupCampaignData(campaignData.call_id, campaignData.strategy_call_id, campaignData.client_phone);
  }
}
