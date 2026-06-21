import { LOG_PREFIX } from './types';

/**
 * Normalize external_call_id to unify records from different events
 * 
 * OCP format: rEB-0Hl-xxx-01-SESSIONID
 * WebRTC full format: rB2-0Hm-xxx-01-rEB-0Hl-xxx-01-SESSIONIDrB2-0Hm-suffix
 * 
 * Need to remove BOTH prefix (rB2-xxx-xxx-01-) and suffix (rB2-xxx-xxx)
 */
export function normalizeCallId(callId: string): string {
  if (!callId) return callId;
  
  let normalized = callId;
  
  // Step 1: Remove leading rB2-xxx-xxx-NN- prefix (WebRTC adds this at the start)
  // Pattern: rB2-[segment]-[segment]-[digits]-
  const prefixRemoved = normalized.replace(/^rB2-[A-Za-z0-9]+-[A-Za-z0-9]+-\d+-/, '');
  if (prefixRemoved !== normalized) {
    console.log(`${LOG_PREFIX} Removed prefix: ${normalized} -> ${prefixRemoved}`);
    normalized = prefixRemoved;
  }
  
  // Step 2: Remove trailing rB2-xxx-xxx suffix (WebRTC adds this at the end)
  // Pattern: rB2-[segment]-[segment] at the end
  const suffixRemoved = normalized.replace(/rB2-[A-Za-z0-9]+-[A-Za-z0-9]+$/, '');
  if (suffixRemoved !== normalized) {
    console.log(`${LOG_PREFIX} Removed suffix: ${normalized} -> ${suffixRemoved}`);
    normalized = suffixRemoved;
  }
  
  if (normalized !== callId) {
    console.log(`${LOG_PREFIX} Final normalized call ID: ${callId} -> ${normalized}`);
  }
  
  return normalized;
}

/**
 * Extract phone number from call event based on call direction
 */
export function extractPhoneFromEvent(
  isIncoming: boolean,
  callerId: string | undefined,
  calledId: string | undefined
): string {
  return isIncoming ? (callerId || 'unknown') : (calledId || 'unknown');
}

/**
 * Extract operator extension from call event based on call direction
 */
export function extractOperatorExt(
  isIncoming: boolean,
  callerId: string | undefined,
  calledId: string | undefined
): string | undefined {
  // For incoming calls, calledId is the operator
  // For outgoing calls, callerId might be the operator, but we don't use it
  return isIncoming ? calledId : undefined;
}

/**
 * Determine if event is incoming based on event type name
 */
export function isIncomingEvent(eventType: string): boolean {
  return eventType.toLowerCase().includes('incoming');
}

/**
 * Map event type to call type number
 * 1 = incoming, 2 = outgoing (per CALL_TYPE_NAMES in calls/types.ts)
 */
export function getCallTypeFromEvent(eventType: string): number {
  return isIncomingEvent(eventType) ? 1 : 2;
}
