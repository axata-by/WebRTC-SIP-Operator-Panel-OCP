import { supabase } from '@/integrations/supabase/client';
import { CALL_SELECT_FULL } from '@/lib/calls/queries';
import { normalizeCallId } from './normalizeCallId';
import { findUserByOperatorExt } from './contactLookup';
import { retrySupabaseCall } from './retry';
import { LOG_PREFIX, type CreateCallRecordParams } from './types';
import type { Call } from '@/lib/calls/types';

/**
 * Load full call data with all relations (with retry for race conditions)
 */
export async function loadFullCallData(callId: string, retryCount = 0): Promise<Call | null> {
  console.log(`${LOG_PREFIX} Loading full call data for id:`, callId, retryCount > 0 ? `(retry ${retryCount})` : '');
  
  const { data, error } = await retrySupabaseCall(() =>
    supabase
      .from('calls')
      .select(CALL_SELECT_FULL)
      .eq('id', callId)
      .maybeSingle()
  );

  if (error) {
    console.error(`${LOG_PREFIX} Error loading full call data:`, error);
    return null;
  }

  const call = data as unknown as Call | null;
  
  if (call) {
    const hasContact = !!call.contact;
    const hasCompany = !!call.company;
    const hasUser = !!call.user;
    
    console.log(`${LOG_PREFIX} Full call loaded:`, {
      id: call.id,
      contact_id: call.contact_id,
      company_id: call.company_id,
      user_id: call.user_id,
      hasContact,
      hasCompany,
      hasUser,
    });

    if (retryCount === 0 && (
      (call.contact_id && !hasContact) ||
      (call.company_id && !hasCompany) ||
      (call.user_id && !hasUser)
    )) {
      console.log(`${LOG_PREFIX} Relations missing, retrying in 500ms...`);
      await new Promise(resolve => setTimeout(resolve, 500));
      return loadFullCallData(callId, retryCount + 1);
    }
  }

  return call;
}

/**
 * Find existing call by external_call_id using multiple strategies
 */
async function findExistingCall(normalizedId: string, originalId: string) {
  type ExistingCall = { 
    id: string; 
    line_number: string | null; 
    operator_ext: string | null; 
    external_call_id: string | null;
    call_type: number;
  };
  
  // Strategy 1: Exact match on normalized ID
  const { data: exactMatch } = await retrySupabaseCall(() =>
    supabase
      .from('calls')
      .select('id, line_number, operator_ext, external_call_id, call_type')
      .eq('external_call_id', normalizedId)
      .maybeSingle()
  );
  
  if (exactMatch) {
    console.log(`${LOG_PREFIX} Found existing call by exact match:`, exactMatch.id, `call_type=${exactMatch.call_type}`);
    return exactMatch as ExistingCall;
  }
  
  // Strategy 2: Try to find by original ID
  const { data: originalMatch } = await retrySupabaseCall(() =>
    supabase
      .from('calls')
      .select('id, line_number, operator_ext, external_call_id, call_type')
      .eq('external_call_id', originalId)
      .maybeSingle()
  );
  
  if (originalMatch) {
    console.log(`${LOG_PREFIX} Found existing call by original ID:`, originalMatch.id, `call_type=${originalMatch.call_type}`);
    return originalMatch as ExistingCall;
  }
  
  // Strategy 3: Fuzzy match - existing ID starts with normalizedId
  const { data: fuzzyMatches } = await retrySupabaseCall(() =>
    supabase
      .from('calls')
      .select('id, line_number, operator_ext, external_call_id, call_type')
      .like('external_call_id', `${normalizedId}%`)
      .order('created_at', { ascending: true })
      .limit(5)
  );
  
  console.log(`${LOG_PREFIX} Fuzzy search (prefix match) results:`, fuzzyMatches?.length || 0, 
    fuzzyMatches?.map(c => c.external_call_id));
  
  if (fuzzyMatches && fuzzyMatches.length > 0) {
    const bestMatch = fuzzyMatches.find(c => !c.external_call_id?.includes('rB2-')) || fuzzyMatches[0];
    console.log(`${LOG_PREFIX} Found existing call by fuzzy prefix match:`, bestMatch.id, 
      `(${bestMatch.external_call_id}), call_type=${bestMatch.call_type}`);
    return bestMatch as ExistingCall;
  }
  
  // Strategy 4: Reverse search — look for recent calls where normalizedId starts with stored external_call_id
  // Uses DESC order + 24h window to avoid scanning stale ancient records
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  console.log(`${LOG_PREFIX} Trying reverse search (last 24h, newest first)`);
  
  const { data: reverseMatches } = await retrySupabaseCall(() =>
    supabase
      .from('calls')
      .select('id, line_number, operator_ext, external_call_id, call_type')
      .filter('external_call_id', 'neq', null)
      .gte('started_at', oneDayAgo)
      .order('started_at', { ascending: false })
      .limit(50)
  );
  
  if (reverseMatches) {
    const matchingRecord = reverseMatches.find(c => 
      c.external_call_id && normalizedId.startsWith(c.external_call_id)
    );
    if (matchingRecord) {
      console.log(`${LOG_PREFIX} Found existing call by reverse match:`, matchingRecord.id, 
        `(${matchingRecord.external_call_id}), call_type=${matchingRecord.call_type}`);
      return matchingRecord as ExistingCall;
    }
  }
  
  return null;
}

/**
 * Create or update call record in database and return full data
 */
export async function createCallRecord(
  params: CreateCallRecordParams,
  userId: string | null
): Promise<Call | null> {
  const normalizedId = normalizeCallId(params.externalCallId);
  console.log(`${LOG_PREFIX} Creating/updating call record:`, { 
    originalId: params.externalCallId,
    normalizedId,
    phone: params.phone,
    callType: params.callType,
    lineNumber: params.lineNumber,
    operatorExt: params.operatorExt,
  });

  let resolvedUserId = userId;
  if (params.operatorExt) {
    const operatorUserId = await findUserByOperatorExt(params.operatorExt);
    if (operatorUserId) {
      resolvedUserId = operatorUserId;
      console.log(`${LOG_PREFIX} Resolved user_id by operator_ext:`, resolvedUserId);
    }
  }

  // Resolve deal_id from contact's deals if not explicitly provided
  let resolvedDealId: string | null = params.dealId || null;
  if (params.contactId && !resolvedDealId) {
    const { data: contactDeals } = await supabase
      .from('deal_contacts')
      .select('deal_id')
      .eq('contact_id', params.contactId)
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1);

    if (contactDeals && contactDeals.length > 0) {
      resolvedDealId = contactDeals[0].deal_id;
      console.log(`${LOG_PREFIX} Resolved deal_id from contact deals: ${resolvedDealId}`);
    }
  }

  const existingCall = await findExistingCall(normalizedId, params.externalCallId);

  if (existingCall) {
    const updates: Record<string, string | number | undefined> = {};
    
    if (params.lineNumber && existingCall.line_number !== params.lineNumber) {
      updates.line_number = params.lineNumber;
    }
    
    if (params.operatorExt && !existingCall.operator_ext) {
      updates.operator_ext = params.operatorExt;
    }
    
    if (existingCall.external_call_id !== normalizedId && 
        existingCall.external_call_id?.includes('rB2-')) {
      updates.external_call_id = normalizedId;
    }
    
    if (params.forceCallType && params.callType === 1 && existingCall.call_type !== 1) {
      console.log(`${LOG_PREFIX} FORCING call_type update: ${existingCall.call_type} -> 1 (incoming with queue guarantee)`);
      updates.call_type = 1;
    } else {
      console.log(`${LOG_PREFIX} Preserving existing call_type=${existingCall.call_type}, new callType=${params.callType}, forceCallType=${params.forceCallType}`);
    }
    
    if (Object.keys(updates).length > 0) {
      console.log(`${LOG_PREFIX} Updating existing call with:`, updates);
      await retrySupabaseCall(() =>
        supabase
          .from('calls')
          .update(updates)
          .eq('id', existingCall.id)
      );
    } else {
      console.log(`${LOG_PREFIX} No updates needed for existing call`);
    }
    
    return loadFullCallData(existingCall.id);
  }

  console.log(`${LOG_PREFIX} Creating NEW call record with call_type=${params.callType}`);
  const candidates =
    params.resolutionCandidates && params.resolutionCandidates.length > 1
      ? params.resolutionCandidates
      : null;
  const { data: createdCall, error: createError } = await retrySupabaseCall(() =>
    supabase
      .from('calls')
      .insert({
        external_call_id: normalizedId,
        phone_number: params.phone,
        call_type: params.callType,
        contact_id: params.contactId,
        company_id: params.companyId,
        prospect_id: params.prospectId || null,
        deal_id: resolvedDealId,
        user_id: resolvedUserId,
        operator_ext: params.operatorExt || null,
        status_code: 'active',
        started_at: new Date().toISOString(),
        line_number: params.lineNumber,
        resolution_candidates: candidates as unknown as never,
        screen_pop_opened_at: params.openScreenPop ? new Date().toISOString() : null,
      })
      .select('id')
      .single()
  );

  if (createError) {
    if (createError.code === '23505') {
      console.log(`${LOG_PREFIX} Duplicate key - call already exists, fetching...`);
      const retryCall = await findExistingCall(normalizedId, params.externalCallId);
      if (retryCall) {
        return loadFullCallData(retryCall.id);
      }
    }
    console.error(`${LOG_PREFIX} Error creating call record:`, createError);
    return null;
  }

  console.log(`${LOG_PREFIX} Call record created:`, createdCall.id, 
    `call_type=${params.callType}`,
    params.operatorExt ? `operator_ext=${params.operatorExt}` : '',
    params.lineNumber ? `line_number=${params.lineNumber}` : '');

  return loadFullCallData(createdCall.id);
}
