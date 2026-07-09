/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { registerSW } from 'virtual:pwa-register';

export interface RegistrationConfig {
  onUpdate?: () => void;
  onSuccess?: () => void;
}

let updateSWFn: ((reloadPage?: boolean) => Promise<void>) | null = null;

export function register(config?: RegistrationConfig) {
  updateSWFn = registerSW({
    onRegistered() {
      config?.onSuccess?.();
    },
    onRegisterError(error) {
      console.error('SW registration failed:', error);
    },
    onNeedRefresh() {
      config?.onUpdate?.();
    },
    onOfflineReady() {
      console.log('Content cached for offline use.');
    },
  });
}

export function updateServiceWorker(reloadPage = true) {
  return updateSWFn?.(reloadPage);
}

export function unregister() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready
      .then((registration) => {
        registration.unregister();
      })
      .catch((error) => {
        console.error(error.message);
      });
  }
}
