/**
 * Softphone Integration Library
 * 
 * Modular utilities for handling softphone events, call management,
 * and screen pop functionality.
 */

// Types
export * from './types';
export type { ClickToCallMode } from './types';

// Core utilities
export { normalizeCallId, extractPhoneFromEvent, extractOperatorExt, isIncomingEvent, getCallTypeFromEvent } from './normalizeCallId';
export { findContactByPhone, findProspectByPhone, findUserByOperatorExt, isLookupError, type ProspectLookupResult, type ContactLookupError, type ContactLookupResult_WithError, type ProspectLookupResult_WithError } from './contactLookup';
export { resolvePhoneForScreenPop, loadPhoneResolutionConfig, clearPhoneResolutionConfigCache, type ResolutionStrategy, type ResolutionConfig, type PhoneResolutionResult } from './phoneResolution';
export { loadConfigForCall } from './configLoader';
export { loadFullCallData, createCallRecord } from './callRecordService';
export { 
  storeCampaignData, 
  findCampaignData, 
  cleanupCampaignData, 
  cleanupAllCampaignData,
  attachCampaignDataToCall 
} from './campaignDataStore';
export { finishCallFromSoftphone } from './callFinishService';

// Event system
export { softphoneEvents, bridgeWindowEvents, type SoftphoneEventType, type SoftphoneEventMap } from './eventBus';
