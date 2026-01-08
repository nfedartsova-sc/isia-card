/// <reference lib="webworker" />

import { SW_RECEIVE_MESSAGES } from '@/types/sw-messages';
import clearAllAppCaches from './clearAllAppCaches';
import getPrecacheHealthStatus from './getPrecacheHealthStatus';
import getApiRuntimeCacheHealthStatus from './getApiRuntimeCacheHealthStatus';
import getImagesRuntimeCacheHealthStatus from './getImagesRuntimeCacheHealthStatus';

declare const self: ServiceWorkerGlobalScope;

/**
 * Sets up the message event listener for the service worker.
 * Handles messages from clients (skip waiting, clear caches, etc.).
 */
export function setupMessageHandler() {
  self.addEventListener('message', (event) => {
    if (!event.data) return;

    console.log('[SW] Received message:', event.data.type);
    
    if (event.data.type === SW_RECEIVE_MESSAGES.SKIP_WAITING) {
      // skipWaiting() forces a new service worker to activate immediately, bypassing the default waiting phase.
      // The Service Worker Lifecycle Without skipWaiting():
      // When a new service worker is detected:
      // - Installing — downloads and installs
      // - Installed/Waiting — waits for all tabs using the old SW to close
      // - Activating — activates after all tabs close
      // - Activated — takes control
      // Without skipWaiting(), users must close all tabs before the new SW activates.
      // What skipWaiting() Does:
      // moves the new service worker from "waiting" directly to "activating", so it takes control immediately
      // without waiting for tabs to close.
      self.skipWaiting();
    }

    // Handle cache clear request
    else if (event.data.type === SW_RECEIVE_MESSAGES.CLEAR_ALL_CACHES) {
      console.log('[SW] Received CLEAR_ALL_CACHES message');
      event.waitUntil(
        clearAllAppCaches(event.source)
      );
    }

    // Handle precache status check request
    else if (event.data.type === SW_RECEIVE_MESSAGES.PRECACHE_STATUS) {
      console.log('[SW] Received PRECACHE_STATUS message');
      event.waitUntil(
        getPrecacheHealthStatus(event.source)
      );
    }

    // Handle API cache status check request
    else if (event.data.type === SW_RECEIVE_MESSAGES.API_RUNTIME_CACHE_STATUS) {
      console.log('[SW] Processing API_RUNTIME_CACHE_STATUS request');
      event.waitUntil(
        getApiRuntimeCacheHealthStatus(event.source)
      );
    }

    // Handle Images runtime cache status check request
    else if (event.data.type === SW_RECEIVE_MESSAGES.IMAGES_RUNTIME_CACHE_STATUS) {
      console.log('[SW] Processing IMAGES_RUNTIME_CACHE_STATUS request');
      event.waitUntil(
        getImagesRuntimeCacheHealthStatus(event.source)
      );
    }
  });
}
