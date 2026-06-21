import { useEffect, useCallback, useRef } from 'react';
import { useSoftphoneSettings } from './useSoftphoneSettings';
import { useActiveCallActions, useActiveCallState } from '@/components/calls/screen-pop';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { 
  softphoneEvents,
  findProspectByPhone,
  loadConfigForCall,
  createCallRecord,
  attachCampaignDataToCall,
  storeCampaignData,
  cleanupAllCampaignData,
  extractPhoneFromEvent,
  extractOperatorExt,
  getCallTypeFromEvent,
  finishCallFromSoftphone,
  isLookupError,
  resolvePhoneForScreenPop,
  LOG_PREFIX,
  type SoftphoneCallData,
  type SoftphoneOCPCallData,
  type CampaignEventData,
  type SoftphoneCallEndedData,
} from '@/lib/softphone';
import { notifySoftphoneCardClosed } from '@/lib/softphone/acwAutoReady';
import type { Call } from '@/lib/calls/types';
import { useSoftphoneEvents } from './softphone';

/**
 * Softphone Call Handler Hook
 * 
 * Orchestrates softphone events and screen pop functionality.
 * Supports multiple simultaneous calls via addCallTab.
 * Uses per-call promise map for answer/finish coordination.
 */
export function useSoftphoneCallHandler() {
  const { settings } = useSoftphoneSettings();
  const { addCallTab, setConfig, closeTab, updateTabCall } = useActiveCallActions();
  const { tabs } = useActiveCallState();
  const { user } = useAuth();
  
  // Track processed call IDs to prevent duplicate processing
  const processedCallIds = useRef<Set<string>>(new Set());
  
  // Per-call answer tracking: externalCallId -> wasAnswered
  const wasCallAnsweredMap = useRef<Map<string, boolean>>(new Map());

  // Per-call promise map: externalCallId -> Promise
  const processCallPromises = useRef<Map<string, Promise<void>>>(new Map());

  // Map externalCallId -> internalCallId for lookup
  const externalToInternalMap = useRef<Map<string, string>>(new Map());

  // Keep tabs ref current
  const tabsRef = useRef(tabs);
  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);
  
  // Initialize event bus bridge
  useSoftphoneEvents();

  // Check if card should be opened for this event
  const shouldOpenCard = useCallback((eventType: string) => {
    if (!settings?.open_card_events) return false;
    return settings.open_card_events.includes(eventType);
  }, [settings]);

  // Check if card should be closed for this event
  const shouldCloseCard = useCallback((eventType: string) => {
    if (!settings?.close_card_events) return false;
    return settings.close_card_events.includes(eventType);
  }, [settings]);

  // Find internal call ID by external call ID
  const findInternalCallId = useCallback((externalCallId: string): string | null => {
    // First check our map
    const mapped = externalToInternalMap.current.get(externalCallId);
    if (mapped) return mapped;
    // Fallback: search tabs
    const tab = tabsRef.current.find(t => t.call.external_call_id === externalCallId);
    return tab?.id ?? null;
  }, []);

  // Process call and open screen pop
  const processCall = useCallback(async (params: {
    eventType: string;
    callId: string;
    phone: string;
    callType: number;
    queue?: string | null;
    operatorExt?: string;
    forceCallType?: boolean;
  }) => {
    const { eventType, callId, phone, callType, queue, operatorExt, forceCallType } = params;

    const promise = (async () => {
      wasCallAnsweredMap.current.set(callId, false);

      if (processedCallIds.current.has(callId)) {
        console.log(`${LOG_PREFIX} Call ${callId} already being processed, skipping duplicate`);
        return;
      }
      processedCallIds.current.add(callId);
      setTimeout(() => processedCallIds.current.delete(callId), 30000);

      console.log(`${LOG_PREFIX} Processing call:`, { eventType, callId, phone, callType, queue, operatorExt });

      const config = await loadConfigForCall(callType, queue || null);
      if (!config) {
        console.log(`${LOG_PREFIX} No config found, skipping screen pop`);
        return;
      }

      const resolution = phone && phone !== 'unknown'
        ? await resolvePhoneForScreenPop({ phone })
        : { contactId: null, companyId: null, candidates: null, effectiveStrategy: 'legacy' as const };
      const contactId = resolution.contactId;
      const companyId = resolution.companyId;
      const candidates = resolution.candidates;
      console.log(`${LOG_PREFIX} resolved by strategy=${resolution.effectiveStrategy}, contact=${contactId}, company=${companyId}, candidates=${candidates?.length ?? 0}`);

      let prospectId: string | null = null;
      if (!contactId && !candidates && phone && phone !== 'unknown') {
        const foundProspectResult = await findProspectByPhone(phone);
        const foundProspect = foundProspectResult && !isLookupError(foundProspectResult) ? foundProspectResult : null;
        if (isLookupError(foundProspectResult)) {
          console.warn(`${LOG_PREFIX} Prospect lookup RPC error:`, foundProspectResult._lookupError);
        }
        prospectId = foundProspect?.id || null;
      }

      const fullCallData = await createCallRecord({
        externalCallId: callId,
        phone,
        callType,
        contactId,
        companyId,
        prospectId,
        operatorExt,
        lineNumber: queue || undefined,
        forceCallType,
        resolutionCandidates: candidates,
        openScreenPop: true,
      }, user?.id || null);

      if (fullCallData) {
        console.log(`${LOG_PREFIX} Opening screen pop tab:`, { call_id: fullCallData.id });
        await attachCampaignDataToCall(fullCallData.id, callId, phone);
        externalToInternalMap.current.set(callId, fullCallData.id);
        addCallTab(fullCallData, config);
      } else {
        console.warn(`${LOG_PREFIX} Failed to load full call data, using fallback`);
        const fallbackCall: Partial<Call> = {
          id: callId,
          phone_number: phone,
          call_type: callType,
          contact_id: contactId,
          company_id: companyId,
          prospect_id: prospectId,
          user_id: user?.id || null,
          started_at: new Date().toISOString(),
          status_code: 'active',
          external_call_id: callId,
          line_number: queue,
        };
        externalToInternalMap.current.set(callId, callId);
        addCallTab(fallbackCall as Call, config);
      }
    })();

    processCallPromises.current.set(callId, promise);
    await promise;
  }, [user?.id, addCallTab]);

  // Handle standard incoming/outgoing call
  const handleCallEvent = useCallback(async (
    data: SoftphoneCallData, 
    eventType: string
  ) => {
    console.log(`${LOG_PREFIX} Event received:`, eventType, data);

    if (!shouldOpenCard(eventType)) {
      console.log(`${LOG_PREFIX} Event not in open_card_events, skipping`);
      return;
    }

    const { callId, callerId, calledId, queue } = data || {};
    
    if (!callId) {
      console.warn(`${LOG_PREFIX} No callId in event, skipping`);
      return;
    }

    const isIncoming = eventType.toLowerCase().includes('incoming');
    const phone = extractPhoneFromEvent(isIncoming, callerId, calledId);
    const operatorExt = extractOperatorExt(isIncoming, callerId, calledId);
    const callType = getCallTypeFromEvent(eventType);

    await processCall({ eventType, callId, phone, callType, queue, operatorExt });
  }, [shouldOpenCard, processCall]);

  // Handle OCP incoming call
  const handleOCPIncomingCall = useCallback(async (data: SoftphoneOCPCallData) => {
    console.log(`${LOG_PREFIX} OCP Event received:`, data);

    if (!shouldOpenCard('OCPincomingCallProgress')) return;

    const detail = data || {};
    const callId = detail.callId || detail.acallid || detail.main_acallid;
    const callerId = detail.callerId || detail.caller_id;
    const calledId = detail.calledId || detail.called_id;
    const queue = detail.queue;
    
    if (!callId) return;

    await processCall({
      eventType: 'OCPincomingCallProgress',
      callId,
      phone: callerId || 'unknown',
      callType: 1,
      queue,
      operatorExt: calledId,
      forceCallType: !!queue,
    });
  }, [shouldOpenCard, processCall]);

  // Handle call ended
  const handleCallEnded = useCallback(async (
    eventType: string,
    data: SoftphoneCallEndedData
  ) => {
    console.log(`${LOG_PREFIX} Call ended event:`, eventType, data);

    const externalCallId = data?.callId;
    
    // Wait for processCall to finish if it's still running
    if (externalCallId) {
      const pending = processCallPromises.current.get(externalCallId);
      if (pending) await pending;
    }

    const internalCallId = externalCallId ? findInternalCallId(externalCallId) : null;
    
    if (externalCallId || internalCallId) {
      try {
        const wasAnswered = externalCallId ? (wasCallAnsweredMap.current.get(externalCallId) ?? false) : false;
        const result = await finishCallFromSoftphone({
          externalCallId,
          callId: internalCallId,
          answered: wasAnswered,
        });
        console.log(`${LOG_PREFIX} Call finish result:`, result);
      } catch (err) {
        console.error(`${LOG_PREFIX} Error finishing call:`, err);
      }
    }

    // Close the specific tab if configured
    if (shouldCloseCard(eventType) && internalCallId) {
      console.log(`${LOG_PREFIX} ${eventType} - closing tab for call:`, internalCallId);
      closeTab(internalCallId);
    }

    // ACW Auto-Ready on call end
    const acwMode = settings?.acw_auto_ready_mode ?? (settings?.acw_auto_ready ? 'on_card_close' : 'off');
    if (acwMode === 'on_call_end' || acwMode === 'always') {
      setTimeout(() => {
        // Check if the tab was already closed
        const tabStillOpen = internalCallId && tabsRef.current.some(t => t.id === internalCallId);
        if (!tabStillOpen) {
          console.log(`${LOG_PREFIX} ACW on_call_end: tab already closed, sending Ready`);
          notifySoftphoneCardClosed();
        }
      }, 100);
    }

    // Cleanup maps
    if (externalCallId) {
      processCallPromises.current.delete(externalCallId);
      wasCallAnsweredMap.current.delete(externalCallId);
      externalToInternalMap.current.delete(externalCallId);
    }
  }, [shouldCloseCard, closeTab, findInternalCallId, settings?.acw_auto_ready_mode, settings?.acw_auto_ready]);

  // Handle call answered
  const handleCallAnswered = useCallback(async (
    eventType: string,
    data: SoftphoneCallData
  ) => {
    const externalCallId = data?.callId;

    console.log(`${LOG_PREFIX} Call answered event, awaiting processCall...`, { eventType, externalCallId });

    if (externalCallId) {
      const pending = processCallPromises.current.get(externalCallId);
      if (pending) await pending;
    }

    const internalCallId = externalCallId ? findInternalCallId(externalCallId) : null;

    console.log(`${LOG_PREFIX} processCall complete, calling softphone-call-answer:`, { externalCallId, internalCallId });

    if (!externalCallId && !internalCallId) {
      console.warn(`${LOG_PREFIX} No call ID available for answer event`);
      return;
    }

    try {
      const { data: result, error } = await supabase.functions.invoke('softphone-call-answer', {
        body: { 
          external_call_id: externalCallId,
          call_id: internalCallId 
        }
      });

      if (error) {
        const status = (error as any)?.context?.status;
        if (status === 404) {
          console.warn(`${LOG_PREFIX} call-answer 404 after processCall completed`);
        } else {
          console.error(`${LOG_PREFIX} Error in call-answer:`, error);
        }
        return;
      }

      if (result?.success) {
        console.log(`${LOG_PREFIX} Call answered successfully:`, result);
        if (externalCallId) {
          wasCallAnsweredMap.current.set(externalCallId, true);
        }
      }
    } catch (err) {
      console.error(`${LOG_PREFIX} Exception in handleCallAnswered:`, err);
    }
  }, [findInternalCallId]);

  // Handle campaign event
  const handleCampaignEvent = useCallback((data: CampaignEventData) => {
    console.log(`${LOG_PREFIX} Campaign event received:`, data);
    storeCampaignData(data);
  }, []);

  useEffect(() => {
    const unsubscribers = [
      softphoneEvents.on('call:incoming:progress', (data) => 
        handleCallEvent(data, 'incomingCallProgress')
      ),
      softphoneEvents.on('call:outgoing:progress', (data) => 
        handleCallEvent(data, 'outgoingCallProgress')
      ),
      softphoneEvents.on('call:incoming:ocp', handleOCPIncomingCall),
      softphoneEvents.on('call:incoming:accepted', (data) => {
        handleCallEvent(data, 'incomingCallAccepted');
        handleCallAnswered('incomingCallAccepted', data);
      }),
      softphoneEvents.on('call:incoming:confirmed', (data) => {
        handleCallEvent(data, 'incomingCallConfirmed');
        handleCallAnswered('incomingCallConfirmed', data);
      }),
      softphoneEvents.on('call:outgoing:accepted', (data) => {
        handleCallEvent(data, 'outgoingCallAccepted');
        handleCallAnswered('outgoingCallAccepted', data);
      }),
      softphoneEvents.on('call:outgoing:confirmed', (data) => {
        handleCallEvent(data, 'outgoingCallConfirmed');
        handleCallAnswered('outgoingCallConfirmed', data);
      }),
      softphoneEvents.on('call:incoming:ended', (data) => 
        handleCallEnded('incomingCallEnded', data)
      ),
      softphoneEvents.on('call:outgoing:ended', (data) => 
        handleCallEnded('outgoingCallEnded', data)
      ),
      softphoneEvents.on('campaign:event', handleCampaignEvent),
    ];

    return () => {
      unsubscribers.forEach(unsubscribe => unsubscribe());
      cleanupAllCampaignData();
    };
  }, [handleCallEvent, handleOCPIncomingCall, handleCallEnded, handleCallAnswered, handleCampaignEvent]);
}
