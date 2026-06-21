import { LOG_PREFIX } from './types';
import type { 
  SoftphoneCallData, 
  SoftphoneOCPCallData, 
  CampaignEventData,
  SoftphoneCallEndedData 
} from './types';

/**
 * Softphone Event Bus
 * 
 * Centralized event system for softphone integration.
 * Provides type-safe event subscription and emission.
 */

export type SoftphoneEventType = 
  | 'call:incoming:progress'
  | 'call:outgoing:progress'
  | 'call:incoming:ocp'
  | 'call:incoming:accepted'
  | 'call:incoming:confirmed'
  | 'call:outgoing:accepted'
  | 'call:outgoing:confirmed'
  | 'call:incoming:ended'
  | 'call:outgoing:ended'
  | 'campaign:event';

export interface SoftphoneEventMap {
  'call:incoming:progress': SoftphoneCallData;
  'call:outgoing:progress': SoftphoneCallData;
  'call:incoming:ocp': SoftphoneOCPCallData;
  'call:incoming:accepted': SoftphoneCallData;
  'call:incoming:confirmed': SoftphoneCallData;
  'call:outgoing:accepted': SoftphoneCallData;
  'call:outgoing:confirmed': SoftphoneCallData;
  'call:incoming:ended': SoftphoneCallEndedData;
  'call:outgoing:ended': SoftphoneCallEndedData;
  'campaign:event': CampaignEventData;
}

type EventHandler<T> = (data: T) => void;

class SoftphoneEventBus {
  private handlers = new Map<SoftphoneEventType, Set<EventHandler<any>>>();

  /**
   * Subscribe to an event
   */
  on<E extends SoftphoneEventType>(
    event: E, 
    handler: EventHandler<SoftphoneEventMap[E]>
  ): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);
    
    // Return unsubscribe function
    return () => this.off(event, handler);
  }

  /**
   * Unsubscribe from an event
   */
  off<E extends SoftphoneEventType>(
    event: E, 
    handler: EventHandler<SoftphoneEventMap[E]>
  ): void {
    const eventHandlers = this.handlers.get(event);
    if (eventHandlers) {
      eventHandlers.delete(handler);
    }
  }

  /**
   * Emit an event to all subscribers
   */
  emit<E extends SoftphoneEventType>(
    event: E, 
    data: SoftphoneEventMap[E]
  ): void {
    console.log(`${LOG_PREFIX} EventBus emit:`, event, data);
    const eventHandlers = this.handlers.get(event);
    if (eventHandlers) {
      eventHandlers.forEach(handler => {
        try {
          handler(data);
        } catch (error) {
          console.error(`${LOG_PREFIX} Error in event handler for ${event}:`, error);
        }
      });
    }
  }

  /**
   * Clear all handlers
   */
  clear(): void {
    this.handlers.clear();
  }

  /**
   * Get count of handlers for an event (for debugging)
   */
  handlerCount(event: SoftphoneEventType): number {
    return this.handlers.get(event)?.size || 0;
  }
}

// Singleton instance
export const softphoneEvents = new SoftphoneEventBus();

// ============= Window Event Adapters =============

/**
 * Map window event names to internal event types
 */
const WINDOW_EVENT_MAP: Record<string, SoftphoneEventType> = {
  'incomingCallProgress': 'call:incoming:progress',
  'outgoingCallProgress': 'call:outgoing:progress',
  'OCPincomingCallProgress': 'call:incoming:ocp',
  'incomingCallAccepted': 'call:incoming:accepted',
  'incomingCallConfirmed': 'call:incoming:confirmed',
  'outgoingCallAccepted': 'call:outgoing:accepted',
  'outgoingCallConfirmed': 'call:outgoing:confirmed',
  'incomingCallEnded': 'call:incoming:ended',
  'outgoingCallEnded': 'call:outgoing:ended',
  'campaignEvents': 'campaign:event',
};

// ============= Debug: All possible softphone events =============

const DEBUG_SOFTPHONE_EVENTS = [
  // All events from documentation
  'connected', 'registered', 'unregistered', 'registrationFailed',
  'incomingCallProgress', 'outgoingCallProgress',
  'incomingCallAccepted', 'outgoingCallAccepted',
  'incomingCallConfirmed', 'outgoingCallConfirmed',
  'incomingCallEnded', 'outgoingCallEnded',
  'hold', 'unhold', 'mute', 'unmute',
  // OCP events
  'OCPincomingCallProgress', 'campaignEvents',
  // Alternative names (in case softphone uses different naming)
  'callEnded', 'callTerminated', 'callFinished', 'callHangup',
  'callEnd', 'endCall', 'hangup', 'terminate',
  'incomingEnd', 'outgoingEnd',
  'callDisconnected', 'disconnected',
];

/**
 * Bridge window events to internal event bus
 * Returns cleanup function
 */
export function bridgeWindowEvents(): () => void {
  const handlers: Array<{ event: string; handler: (e: Event) => void }> = [];

  // === DIAGNOSTIC: direct listener for campaignEvents ===
  const campaignDiagHandler = (e: Event) => {
    const detail = (e as CustomEvent).detail;
    console.warn(`${LOG_PREFIX} [DIAG] campaignEvents RAW event received!`, detail);
    console.warn(`${LOG_PREFIX} [DIAG] progressive=${detail?.progressive}, call_id=${detail?.call_id}, client_phone=${detail?.client_phone}`);
  };
  window.addEventListener('campaignEvents', campaignDiagHandler);
  console.warn(`${LOG_PREFIX} [DIAG] Direct campaignEvents listener registered`);

  // Log mapped events subscription
  console.log(`${LOG_PREFIX} EventBus subscribing to mapped events:`, Object.keys(WINDOW_EVENT_MAP));

  // Bridge mapped events
  for (const [windowEvent, internalEvent] of Object.entries(WINDOW_EVENT_MAP)) {
    const handler = (e: Event) => {
      const customEvent = e as CustomEvent;
      console.log(`${LOG_PREFIX} [MAPPED] Window event "${windowEvent}" -> "${internalEvent}":`, customEvent.detail);
      softphoneEvents.emit(internalEvent, customEvent.detail);
    };
    
    window.addEventListener(windowEvent, handler);
    handlers.push({ event: windowEvent, handler });
  }

  // DEBUG: Add listeners for ALL possible softphone events
  const debugHandlers: Array<{ event: string; handler: (e: Event) => void }> = [];
  
  DEBUG_SOFTPHONE_EVENTS.forEach(eventName => {
    // Skip if already mapped (to avoid double logging)
    if (WINDOW_EVENT_MAP[eventName]) return;
    
    const handler = (e: Event) => {
      const customEvent = e as CustomEvent;
      console.log(`${LOG_PREFIX} [DEBUG] Window event "${eventName}":`, customEvent.detail);
    };
    
    window.addEventListener(eventName, handler);
    debugHandlers.push({ event: eventName, handler });
  });

  console.log(`${LOG_PREFIX} EventBus bridged to window events`);
  console.log(`${LOG_PREFIX} Debug listeners added for:`, DEBUG_SOFTPHONE_EVENTS.filter(e => !WINDOW_EVENT_MAP[e]));

  // Return cleanup function
  return () => {
    window.removeEventListener('campaignEvents', campaignDiagHandler);
    handlers.forEach(({ event, handler }) => {
      window.removeEventListener(event, handler);
    });
    debugHandlers.forEach(({ event, handler }) => {
      window.removeEventListener(event, handler);
    });
    console.log(`${LOG_PREFIX} EventBus unbridged from window events`);
  };
}
