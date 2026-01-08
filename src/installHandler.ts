/// <reference lib="webworker" />

import { RUNTIME_ENDPOINTS } from './constants';

declare const self: ServiceWorkerGlobalScope;

const PREVENT_HANGING_SLOW_AND_FAILED_REQUESTS_TIMEOUT_MS = 10000;

/**
 * Sets up the install event listener for the service worker.
 * Handles preloading runtime resources.
 */
export function setupInstallHandler() {
  self.addEventListener('install', (event) => {
    // Don't wait for precache - let it run in parallel
    // We'll preload runtime resources, and if they fail, they'll be cached on first use
    event.waitUntil(
      (async () => {
        console.log('[SW] Install event: Preloading runtime resources...');
        
        // Preload runtime API endpoints to cache them
        // Use Promise.allSettled so failures don't block installation
        const preloadPromises = RUNTIME_ENDPOINTS.map(async (endpoint) => {
          try {
            // Use a timeout to prevent hanging on slow/failed requests
            const controller = new AbortController();
            const timeoutId = setTimeout(
              () => controller.abort(),
              PREVENT_HANGING_SLOW_AND_FAILED_REQUESTS_TIMEOUT_MS);
            
            const response = await fetch(endpoint, {
              method: 'GET',
              // using the browser's default caching behavior:
              // - respect cache headers
              // - use cached responses if valid
              // - revalidate stale responses when needed
              // - cache responses according to headers
              cache: 'default',
              signal: controller.signal,
            });
            
            clearTimeout(timeoutId);
            
            if (response.ok) {
              console.log(`[SW] Successfully preloaded ${endpoint}`);
              // The NetworkFirst strategy will automatically cache this response
              return { endpoint, success: true };
            } else {
              console.warn(`[SW] Failed to preload ${endpoint}: ${response.status}`);
              return { endpoint, success: false };
            }
          } catch (error: any) {
            if (error.name === 'AbortError') {
              console.warn(`[SW] Preload timeout for ${endpoint}`);
            } else {
              console.warn(`[SW] Error preloading ${endpoint}:`, error);
            }
            return { endpoint, success: false, error };
          }
        });
        
        const results = await Promise.allSettled(preloadPromises);
        const successful = results.filter(
          r => r.status === 'fulfilled' && r.value.success
        ).length;
        
        console.log(`[SW] Preloaded ${successful}/${RUNTIME_ENDPOINTS.length} runtime resources during install`);
      })()
    );
  });
};
