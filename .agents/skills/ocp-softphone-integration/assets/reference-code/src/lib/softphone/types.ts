/**
 * Softphone Integration Types
 * Centralized type definitions for softphone events and data structures
 */

// ============= Event Types =============

export interface SoftphoneCallData {
  callId: string;
  callerId: string;
  calledId: string;
  queue?: string;
}

export interface SoftphoneOCPCallData {
  // OCP native field names
  acallid?: string;
  main_acallid?: string;
  caller_id?: string;
  called_id?: string;
  event?: string;
  queue?: string;
  
  // Normalized field names (backward compatibility)
  callId?: string;
  callerId?: string;
  calledId?: string;
}

export interface SoftphoneAuthEvent {
  ocpDomain: string;
  ocpAuthToken: string;
}

export interface SoftphoneCallEndedData {
  callId: string;
  callerId: string;
  calledId: string;
}

export interface SoftphoneHoldData {
  callId: string;
}

export interface SoftphoneMuteData {
  audio: boolean;
  video: boolean;
}

export interface CampaignEventData {
  id: string;
  call_id: string;
  queue_id: string;
  abonent_id: string;
  company_id: string;
  queue_title: string;
  selection_id: string;
  is_answered: boolean;
  progressive: boolean;
  client_phone: string;
  company_title: string;
  strategy_title: string;
  selection_title: string;
  strategy_call_id: string;
}

// ============= Settings Types =============

export type AcwAutoReadyMode = 'off' | 'on_card_close' | 'on_call_end' | 'always';
export type PositionAnchor = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
export type ClickToCallMode = 'browser' | 'softphone';

export interface SoftphoneSettings {
  id: string;
  enabled: boolean;
  top_offset: number;
  right_offset: number;
  fixed_to_header: boolean;
  ocp_domain: string;
  ocp_proxy_api_key?: string;
  ocp_proxy_url?: string;
  auto_connect: boolean;
  open_card_events: string[];
  close_card_events: string[];
  position_anchor: PositionAnchor;
  click_to_call_mode: ClickToCallMode;
  acw_auto_ready: boolean;
  acw_auto_ready_mode: AcwAutoReadyMode;
  created_at: string;
  updated_at: string;
}

// Window.Softphone type is declared in src/types/global.d.ts

// ============= Internal Types =============

export interface NormalizedCallParams {
  eventType: string;
  callId: string;
  phone: string;
  callType: number; // 1 = incoming, 2 = outgoing
  queue?: string | null;
  operatorExt?: string;
}

export interface CreateCallRecordParams {
  externalCallId: string;
  phone: string;
  callType: number;
  contactId: string | null;
  companyId: string | null;
  prospectId?: string | null;
  dealId?: string | null;
  lineNumber?: string;
  operatorExt?: string;
  forceCallType?: boolean;
  /** Candidates for manual/hybrid disambiguation (saved when length > 1). */
  resolutionCandidates?: import('@/lib/calls/types').ResolutionCandidate[] | null;
  /** When true, also stamp `screen_pop_opened_at = now()` on insert. */
  openScreenPop?: boolean;
}

export interface ContactLookupResult {
  id: string;
  first_name: string | null;
  last_name: string | null;
  company_id: string | null;
}

// ============= Log Prefix =============
export const LOG_PREFIX = '[Softphone]';

// ============= Window Event Map Extension =============

declare global {
  interface WindowEventMap {
    // Connection events
    'connected': CustomEvent<void>;
    
    // Registration events
    'registered': CustomEvent<void>;
    'unregistered': CustomEvent<void>;
    'registrationFailed': CustomEvent<void>;
    
    // Call progress events
    'incomingCallProgress': CustomEvent<SoftphoneCallData>;
    'outgoingCallProgress': CustomEvent<SoftphoneCallData>;
    'OCPincomingCallProgress': CustomEvent<SoftphoneOCPCallData>;
    
    // Call accepted/confirmed events
    'incomingCallAccepted': CustomEvent<SoftphoneCallData>;
    'incomingCallConfirmed': CustomEvent<SoftphoneCallData>;
    'outgoingCallAccepted': CustomEvent<SoftphoneCallData>;
    'outgoingCallConfirmed': CustomEvent<SoftphoneCallData>;
    
    // Call ended events
    'incomingCallEnded': CustomEvent<SoftphoneCallEndedData>;
    'outgoingCallEnded': CustomEvent<SoftphoneCallEndedData>;
    
    // Hold events
    'hold': CustomEvent<SoftphoneHoldData>;
    'unhold': CustomEvent<SoftphoneHoldData>;
    
    // Mute events
    'mute': CustomEvent<SoftphoneMuteData>;
    'unmute': CustomEvent<SoftphoneMuteData>;
    
    // Queue info event
    'softphone-queue-info': CustomEvent<{ queue: string }>;
    
    // Campaign event for outbound dialing
    'campaignEvents': CustomEvent<CampaignEventData>;
    
    // Authentication event (outgoing)
    'authenticateOCPModule': CustomEvent<SoftphoneAuthEvent>;
  }
}
