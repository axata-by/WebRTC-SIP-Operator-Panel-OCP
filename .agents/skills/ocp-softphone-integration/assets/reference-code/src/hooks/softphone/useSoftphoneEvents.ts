import { useEffect } from 'react';
import { softphoneEvents, bridgeWindowEvents } from '@/lib/softphone';

/**
 * Hook that bridges window events to the softphone event bus
 * 
 * This hook should be used once at the app level to connect
 * browser window events to the internal event bus.
 * 
 * @returns The softphone event bus instance
 */
export function useSoftphoneEvents() {
  useEffect(() => {
    // Bridge window events to internal event bus
    const cleanup = bridgeWindowEvents();
    return cleanup;
  }, []);

  return softphoneEvents;
}
