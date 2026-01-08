/// <reference lib="webworker" />

import { SW_POST_MESSAGES } from '@/types/sw-messages';
import { IMAGE_API_ENDPOINTS } from '../constants';
import { runtimeCachesConfig } from '../runtimeCachesConfig';
import sendToClients from './sendToClients';

declare const self: ServiceWorkerGlobalScope;

/**
 * Gets info about images runtime cache
 */
const getImagesRuntimeCacheHealthStatus = async (eventSource: MessagePort | Client | ServiceWorker | null) => {
  const CHECK_INTERVAL_MS = 10000; // 10 seconds
  const MAX_CHECK_DURATION_MS = 60000; // 1 minute
  const startTime = Date.now();

  // Get list of critical images that should be in images-runtime cache
  const criticalImages = [
    ...IMAGE_API_ENDPOINTS,
  ];

  const checkImagesCacheStatus = async (): Promise<{
    allCached: boolean;
    missingResources: string[];
    cachedCount: number;
    totalCount: number;
  }> => {
    const missingResources: string[] = [];
    let cachedCount = 0;

    try {
      // Get images-runtime cache name
      const imagesCacheName = runtimeCachesConfig.images.name;
      
      // Check if images-runtime cache exists
      const cacheExists = await caches.has(imagesCacheName);
      if (!cacheExists) {
        // Images cache doesn't exist yet - service worker might still be installing
        return {
          allCached: false,
          missingResources: criticalImages,
          cachedCount: 0,
          totalCount: criticalImages.length,
        };
      }

      const imagesCache = await caches.open(imagesCacheName);
      const imagesCacheKeys = await imagesCache.keys();

      // If images cache exists but is empty, service worker might still be installing
      if (imagesCacheKeys.length === 0) {
        return {
          allCached: false,
          missingResources: criticalImages,
          cachedCount: 0,
          totalCount: criticalImages.length,
        };
      }

      for (const imageUrl of criticalImages) {
        let isCached = false;

        try {
          const imagePathname = new URL(imageUrl, self.location.href).pathname;
          
          // First, try direct cache.match with various strategies
          const imageUrlFull = new URL(imageUrl, self.location.href).href;
          
          const matchResults = [
            await imagesCache.match(imageUrlFull),
            await imagesCache.match(imagePathname),
            await imagesCache.match(imageUrl),
            await imagesCache.match(new Request(imagePathname)),
            await imagesCache.match(new Request(imageUrlFull)),
            await imagesCache.match(new Request(imageUrl)),
            await imagesCache.match(imageUrlFull, { ignoreSearch: true }),
            await imagesCache.match(imagePathname, { ignoreSearch: true }),
          ];
          
          const matched = matchResults.find((response): response is Response => response !== undefined);
          
          if (matched) {
            isCached = true;
          } else {
            // More robust fallback: Check all cached keys by pathname
            // This handles cases where URLs might be cached with different protocols/hosts/query params
            for (const cachedRequest of imagesCacheKeys) {
              try {
                const cachedUrl = new URL(cachedRequest.url);
                const cachedPathname = cachedUrl.pathname;
                
                // Match by pathname (most reliable)
                if (cachedPathname === imagePathname) {
                  isCached = true;
                  break;
                }
                
                // Also try matching the request directly
                const directMatch = await imagesCache.match(cachedRequest);
                if (directMatch) {
                  // Check if this cached request's pathname matches what we're looking for
                  if (cachedPathname === imagePathname) {
                    isCached = true;
                    break;
                  }
                }
              } catch (urlError) {
                // Skip invalid URLs
                continue;
              }
            }
          }
        } catch (e) {
          // Image not found, continue
          console.warn(`[SW] Error checking image ${imageUrl}:`, e);
        }
        
        if (isCached) {
          cachedCount++;
        } else {
          missingResources.push(imageUrl);
          console.log(`[SW] Image not found in cache: ${imageUrl} (looking for pathname: ${new URL(imageUrl, self.location.href).pathname})`);
        }
      }
      
      // Debug: Log what we found
      console.log(`[SW] Images cache check: Found ${cachedCount}/${criticalImages.length} images`);
      if (missingResources.length > 0) {
        console.log(`[SW] Missing images:`, missingResources);
        console.log(`[SW] Cached URLs in images-runtime:`, imagesCacheKeys.map(r => {
          try {
            return new URL(r.url).pathname;
          } catch {
            return r.url;
          }
        }));
      }
    } catch (error) {
      console.error('[SW] Error checking images cache status:', error);
    }

    return {
      allCached: missingResources.length === 0,
      missingResources,
      cachedCount,
      totalCount: criticalImages.length,
    };
  };

  const sendStatusUpdate = async (checkNumber: number) => {
    const status = await checkImagesCacheStatus();
    const elapsed = Date.now() - startTime;
    
    let message: string;
    if (status.allCached) {
      message = `Card images cached successfully`;
    } else {
      const remaining = status.totalCount - status.cachedCount;
      // If images cache doesn't exist or is empty, indicate we're waiting for installation
      if (status.cachedCount === 0 && status.missingResources.length === status.totalCount) {
        // After 30 seconds, change message to indicate images may need to be requested first
        if (elapsed > 30000) {
          message = `Card images not cached - may need to be requested first`;
        } else {
          message = `Waiting for service worker to cache card images...`;
        }
      } else {
        message = `Service worker caching card images... ${remaining} remaining`;
      }
    }

    await sendToClients(eventSource, {
      type: SW_POST_MESSAGES.IMAGES_RUNTIME_CACHE_STATUS,
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
        const finalStatus = await checkImagesCacheStatus();
        await sendToClients(eventSource, {
          type: SW_POST_MESSAGES.IMAGES_RUNTIME_CACHE_STATUS,
          message: finalStatus.allCached
            ? `All images cached`
            : `Some images may still be caching (${finalStatus.missingResources.length} remaining)`,
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

export default getImagesRuntimeCacheHealthStatus;
