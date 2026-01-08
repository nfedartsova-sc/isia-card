/// <reference lib="webworker" />

import { SW_POST_MESSAGES } from '@/types/sw-messages';
import { matchPrecache, getCacheKeyForURL } from 'workbox-precaching';
import { cacheNames } from 'workbox-core';
import { criticalResourcesList } from '../constants';
import sendToClients from './sendToClients';

declare const self: ServiceWorkerGlobalScope;

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
        missingResources: criticalResourcesList,
        cachedCount: 0,
        totalCount: criticalResourcesList.length,
      };
    }

    const precacheCache = await caches.open(cacheNames.precache);
    const precacheKeys = await precacheCache.keys();

    // If precache exists but is empty, service worker might still be installing
    if (precacheKeys.length === 0) {
      return {
        allCached: false,
        missingResources: criticalResourcesList,
        cachedCount: 0,
        totalCount: criticalResourcesList.length,
      };
    }

    for (const resource of criticalResourcesList) {
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
    totalCount: criticalResourcesList.length,
  };
};


const sendStatusUpdate = async (
  eventSource: MessagePort | Client | ServiceWorker | null,
  startTime: number
) => {
  const status = await checkPrecacheStatus();
  const elapsed = Date.now() - startTime;
  
  let message: string;
  if (status.allCached) {
    message = `All critical resources cached successfully`;
  } else {
    const remaining = status.totalCount - status.cachedCount;
    // After 30 seconds, change message to indicate it's not [fully] being cached
    if (elapsed > 30000) {
      if (status.cachedCount === 0 && status.missingResources.length === status.totalCount)
        message = `Critical resources not cached - they may need to be requested first`;
      else
        message = `Not all critical resources are cached - they may need to be requested first`;
    } else {
      // If precache doesn't exist or is empty, indicate we're waiting for installation
      if (status.cachedCount === 0 && status.missingResources.length === status.totalCount) {
        message = `Waiting for service worker to cache critical resources...`;
      } else {
        message = `Service worker caching critical resources... ${remaining} remaining`;
      }
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


/**
 * Gets info about precached data
 */
const getPrecacheHealthStatus = async (
  eventSource: MessagePort | Client | ServiceWorker | null
) => {
  const CHECK_INTERVAL_MS = 10000; // 10 seconds
  const MAX_CHECK_DURATION_MS = 60000; // 1 minute
  const startTime = Date.now();

  // Initial check
  const initialStatus = await sendStatusUpdate(eventSource, startTime);

  // If not all cached and within time limit, continue checking
  if (!initialStatus.allCached) {
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

      const status = await sendStatusUpdate(eventSource, startTime);

      // If all cached, stop checking
      if (status.allCached) {
        clearInterval(intervalId);
      }
    }, CHECK_INTERVAL_MS);
  }
};

export default getPrecacheHealthStatus;
