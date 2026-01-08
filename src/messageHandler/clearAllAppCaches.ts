/// <reference lib="webworker" />

import { SW_POST_MESSAGES } from '@/types/sw-messages';
import { cacheNames } from 'workbox-core';
import {
  CACHE_VERSION,
  HOMEPAGE_HTML_URL,
  FALLBACK_HTML_URL,
  PRECACHED_IMAGES,
  PRECACHED_JS_FILES,
} from '../constants';
import { runtimeCachesConfig } from '../runtimeCachesConfig';
import sendToClients from './sendToClients';

declare const self: ServiceWorkerGlobalScope;

/**
 * Clear ALL app caches - both runtime and precache
 */
const clearAllAppCaches = async (eventSource: MessagePort | Client | ServiceWorker | null) => {
  try {
    // Get all cache names
    const cacheNamesList = await caches.keys();
    console.log('[SW] Clearing all caches:', cacheNamesList);
    
    if (cacheNamesList.length === 0) {
      console.log('[SW] No caches to clear');
      await sendToClients(eventSource, { type: SW_POST_MESSAGES.CACHES_CLEARED });
      return;
    }

    // Helper function to delete a cache with retry logic
    const deleteCacheWithRetry = async (
      cacheName: string,
      maxAttempts: number = 3,
      retryDelayMs: number = 100
    ): Promise<{ cacheName: string; success: boolean; error?: any }> => {
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
          const deleted = await caches.delete(cacheName);
          if (deleted) {
            console.log(`[SW] Cache "${cacheName}" deleted successfully`);
            return { cacheName, success: true };
          }
          
          // Deletion returned false (cache didn't exist or couldn't be deleted)
          if (attempt < maxAttempts - 1) {
            console.warn(`[SW] Cache "${cacheName}" deletion failed (attempt ${attempt + 1}/${maxAttempts}), retrying...`);
            await new Promise(resolve => setTimeout(resolve, retryDelayMs));
          } else {
            console.error(`[SW] Cache "${cacheName}" deletion failed after ${maxAttempts} attempts`);
            return { cacheName, success: false, error: 'Deletion returned false' };
          }
        } catch (error) {
          if (attempt < maxAttempts - 1) {
            console.warn(`[SW] Cache "${cacheName}" deletion error (attempt ${attempt + 1}/${maxAttempts}):`, error);
            await new Promise(resolve => setTimeout(resolve, retryDelayMs));
          } else {
            console.error(`[SW] Cache "${cacheName}" deletion error after ${maxAttempts} attempts:`, error);
            return { cacheName, success: false, error };
          }
        }
      }
      return { cacheName, success: false, error: 'Max attempts reached' };
    };

    // Delete all caches in parallel with retry logic
    const deleteResults = await Promise.allSettled(
      cacheNamesList.map(cacheName => deleteCacheWithRetry(cacheName))
    );

    // Process results
    const results: Array<{ cacheName: string; success: boolean; error?: any }> = [];
    const errors: Array<{ cacheName: string; error: any }> = [];

    deleteResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        results.push(result.value);
        if (!result.value.success) {
          errors.push({ cacheName: result.value.cacheName, error: result.value.error });
        }
      } else {
        const cacheName = cacheNamesList[index];
        errors.push({ cacheName, error: result.reason });
        results.push({ cacheName, success: false, error: result.reason });
      }
    });

    const successfulDeletions = results.filter(r => r.success);
    const failedDeletions = errors;

    console.log(`[SW] Cache deletion summary: ${successfulDeletions.length} succeeded, ${failedDeletions.length} failed`);

    if (failedDeletions.length > 0) {
      console.error('[SW] Failed to delete caches:', failedDeletions);
    }

    // Verify all caches are actually deleted
    const remainingCaches = await caches.keys();
    if (remainingCaches.length > 0) {
      console.warn('[SW] Some caches still exist after deletion:', remainingCaches);
      
      // Final retry for remaining caches
      const finalRetryResults = await Promise.allSettled(
        remainingCaches.map(cacheName => deleteCacheWithRetry(cacheName, 2, 200))
      );

      const finalRemainingCaches = await caches.keys();
      if (finalRemainingCaches.length > 0) {
        console.error('[SW] Caches still remaining after final retry:', finalRemainingCaches);
      } else {
        console.log('[SW] All caches successfully deleted after final retry');
      }
    } else {
      console.log('[SW] All caches successfully deleted');
    }

    // Repopulate critical precached resources in runtime cache
    // This ensures they're available offline even after clearing precache
    try {
      const imagesCache = await caches.open(runtimeCachesConfig.images.name);
      
      console.log('[SW] Repopulating precached images in runtime cache...');
      const imageCacheResults = await Promise.allSettled(
        PRECACHED_IMAGES.map(async (imgData) => {
          try {
            const response = await fetch(imgData.url);
            if (response.ok) {
              await imagesCache.put(imgData.url, response.clone());
              console.log(`[SW] Cached ${imgData.url} in runtime cache`);
              return { url: imgData.url, success: true };
            } else {
              console.warn(`[SW] Failed to fetch ${imgData.url}: ${response.status}`);
              return { url: imgData.url, success: false };
            }
          } catch (error) {
            console.error(`[SW] Error caching ${imgData.url}:`, error);
            return { url: imgData.url, success: false, error };
          }
        })
      );

      const successfulImages = imageCacheResults.filter(
        r => r.status === 'fulfilled' && r.value.success
      ).length;
      console.log(`[SW] Repopulated ${successfulImages}/${PRECACHED_IMAGES.length} precached images in runtime cache`);
    } catch (error) {
      console.error('[SW] Error repopulating precached images:', error);
      // Continue anyway - this is best effort
    }

    // AFTER clearing caches, manually repopulate precache
    // This is necessary because precacheAndRoute only runs during install event,
    // and registration.update() won't trigger reinstall if file hasn't changed
    try {
      console.log('[SW] Manually repopulating precache...');
      
      const precacheResources = [
        { url: HOMEPAGE_HTML_URL, revision: `main-${CACHE_VERSION}` },
        { url: FALLBACK_HTML_URL, revision: `offline-${CACHE_VERSION}` },
        ...PRECACHED_IMAGES.map((imgData) => ({
          url: imgData.url,
          revision: null,
        })),
        ...PRECACHED_JS_FILES.map((jsData) => ({
          url: jsData.url,
          revision: jsData.revision || null,
        })),
      ];

      // Open precache and manually cache each resource
      const precacheCache = await caches.open(cacheNames.precache);
      
      const precacheResults = await Promise.allSettled(
        precacheResources.map(async (resource) => {
          try {
            const response = await fetch(resource.url);
            if (response.ok) {
              // Get the cache key for this URL (with revision if applicable)
              let cacheKey: string;
              if (resource.revision) {
                const url = new URL(resource.url, self.location.href);
                url.searchParams.set('__WB_REVISION__', resource.revision);
                cacheKey = url.href;
              } else {
                cacheKey = new URL(resource.url, self.location.href).href;
              }
              
              await precacheCache.put(cacheKey, response.clone());
              console.log(`[SW] Precached ${resource.url}`);
              return { url: resource.url, success: true };
            } else {
              console.warn(`[SW] Failed to fetch ${resource.url}: ${response.status}`);
              return { url: resource.url, success: false };
            }
          } catch (error) {
            console.error(`[SW] Error precaching ${resource.url}:`, error);
            return { url: resource.url, success: false, error };
          }
        })
      );

      const successfulPrecaches = precacheResults.filter(
        r => r.status === 'fulfilled' && r.value.success
      ).length;
      console.log(`[SW] Repopulated ${successfulPrecaches}/${precacheResources.length} resources in precache`);
    } catch (error) {
      console.error('[SW] Error manually repopulating precache:', error);
      // Continue anyway - this is best effort
    }

    await sendToClients(eventSource, { type: SW_POST_MESSAGES.CACHES_CLEARED });

  } catch (error) {
    console.error('[SW] Unexpected error while clearing caches:', error);
    // Still notify client even if there was an error
    try {
      await sendToClients(eventSource, { type: SW_POST_MESSAGES.CACHES_CLEARED });
    } catch (notificationError) {
      console.error('[SW] Failed to notify clients:', notificationError);
    }
  }
};

export default clearAllAppCaches;
