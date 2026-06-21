import { LOG_PREFIX } from './types';

/**
 * Notify the softphone that the call card has been closed/saved,
 * transitioning the operator from After-Call-Work (ACW) to Ready status.
 */
export function notifySoftphoneCardClosed(): void {
  try {
    const fn = window.Softphone?.ocpModule?.changeStatusToReady;
    if (typeof fn === 'function') {
      fn();
      console.log(LOG_PREFIX, 'ACW → Ready: changeStatusToReady() called');
    } else {
      console.log(LOG_PREFIX, 'ACW → Ready: ocpModule.changeStatusToReady not available (softphone not loaded or no ocpModule)');
    }
  } catch (err) {
    console.warn(LOG_PREFIX, 'ACW → Ready: error calling changeStatusToReady:', err);
  }
}
