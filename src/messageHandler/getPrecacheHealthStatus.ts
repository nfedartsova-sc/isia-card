/// <reference lib="webworker" />

import { SW_POST_MESSAGES } from '@/types/sw-messages';
import { matchPrecache, getCacheKeyForURL } from 'workbox-precaching';
import { cacheNames } from 'workbox-core';
import {
  HOMEPAGE_HTML_URL,
  FALLBACK_HTML_URL,
  PRECACHED_IMAGES,
  PRECACHED_JS_FILES,
} from '../constants';
import sendToClients from './sendToClients';

declare const self: ServiceWorkerGlobalScope;

/**
 * Gets info about precached data
 */
const getPrecacheHealthStatus = async (eventSource: MessagePort | Client | ServiceWorker | null) => {
  const CHECK_INTERVAL_MS = 10000; // 10 seconds
  const MAX_CHECK_DURATION_MS = 60000; // 1 minute
  const startTime = Date.now();

  // Get list of critical resources that should be precached
  const criticalResources = [
    HOMEPAGE_HTML_URL,
    FALLBACK_HTML_URL,
    ...PRECACHED_IMAGES.map(img => img.url),
    ...PRECACHED_JS_FILES.map(js => js.url),
  ];

  const checkPrecacheStatus = async (): Promise<{
    allCached: boolean;
    missingResources: string[];
    cachedCount: number;
    totalCount: number;
  }> => {
    const missingResources: string[] = [];
    let cachedCount = 0;

    try {
      // Check if precache cache exists, if not, wait a bit for install to complete
      const cacheExists = await caches.has(cacheNames.precache);
      if (!cacheExists) {
        // Precache doesn't exist yet - service worker might still be installing
        // Return all resources as missing but indicate we're waiting
        return {
          allCached: false,
          missingResources: criticalResources,
          cachedCount: 0,
          totalCount: criticalResources.length,
        };
      }

      const precacheCache = await caches.open(cacheNames.precache);
      const precacheKeys = await precacheCache.keys();

      // If precache exists but is empty, service worker might still be installing
      if (precacheKeys.length === 0) {
        return {
          allCached: false,
          missingResources: criticalResources,
          cachedCount: 0,
          totalCount: criticalResources.length,
        };
      }

      for (const resource of criticalResources) {
        let isCached = false;

        // Try multiple methods to check if resource is cached
        try {
          // Method 1: Use matchPrecache
          const precached = await matchPrecache(resource);
          if (precached) {
            isCached = true;
          }
        } catch (e) {
          // Continue to next method
        }

        if (!isCached) {
          try {
            // Method 2: Use getCacheKeyForURL
            const cacheKey = getCacheKeyForURL(resource);
            if (cacheKey) {
              const cached = await precacheCache.match(cacheKey);
              if (cached) {
                isCached = true;
              }
            }
          } catch (e) {
            // Continue to next method
          }
        }

        if (!isCached) {
          // Method 3: Manual search by pathname
          try {
            const resourceUrl = new URL(resource, self.location.href);
            const normalizedPathname = resourceUrl.pathname;

            for (const cachedRequest of precacheKeys) {
              const cachedUrl = new URL(cachedRequest.url);
              if (cachedUrl.pathname === normalizedPathname) {
                const cached = await precacheCache.match(cachedRequest);
                if (cached) {
                  isCached = true;
                  break;
                }
              }
            }
          } catch (e) {
            // Resource not found
          }
        }

        if (isCached) {
          cachedCount++;
        } else {
          missingResources.push(resource);
        }
      }
    } catch (error) {
      console.error('[SW] Error checking precache status:', error);
    }

    return {
      allCached: missingResources.length === 0,
      missingResources,
      cachedCount,
      totalCount: criticalResources.length,
    };
  };

  const sendStatusUpdate = async (checkNumber: number) => {
    const status = await checkPrecacheStatus();
    const elapsed = Date.now() - startTime;
    
    let message: string;
    if (status.allCached) {
      message = `All critical resources cached successfully`;
    } else {
      const remaining = status.totalCount - status.cachedCount;
      // If precache doesn't exist or is empty, indicate we're waiting for installation
      if (status.cachedCount === 0 && status.missingResources.length === status.totalCount) {
        message = `Waiting for service worker to cache critical resources...`;
      } else {
        message = `Service worker caching critical resources... ${remaining} remaining`;
      }
    }

    await sendToClients(eventSource, {
      type: SW_POST_MESSAGES.PRECACHE_STATUS,
      message,
      allCached: status.allCached,
      missingResources: status.missingResources,
      cachedCount: status.cachedCount,
      totalCount: status.totalCount,
    });

    return status;
  };

  // Initial check
  const initialStatus = await sendStatusUpdate(0);

  // If not all cached and within time limit, continue checking
  if (!initialStatus.allCached) {
    let checkNumber = 1;
    const intervalId = setInterval(async () => {
      const elapsed = Date.now() - startTime;
      
      if (elapsed >= MAX_CHECK_DURATION_MS) {
        clearInterval(intervalId);
        const finalStatus = await checkPrecacheStatus();
        await sendToClients(eventSource, {
          type: SW_POST_MESSAGES.PRECACHE_STATUS,
          message: finalStatus.allCached
            ? `All critical resources cached`
            : `Some resources may still be caching (${finalStatus.missingResources.length} remaining)`,
          allCached: finalStatus.allCached,
          missingResources: finalStatus.missingResources,
          cachedCount: finalStatus.cachedCount,
          totalCount: finalStatus.totalCount,
        });
        return;
      }

      const status = await sendStatusUpdate(checkNumber);
      checkNumber++;

      // If all cached, stop checking
      if (status.allCached) {
        clearInterval(intervalId);
      }
    }, CHECK_INTERVAL_MS);
  }
};

export default getPrecacheHealthStatus;
