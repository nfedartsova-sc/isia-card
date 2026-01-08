/// <reference lib="webworker" />

import { SW_POST_MESSAGES } from '@/types/sw-messages';
import { ISIA_CARD_DATA_ENDPOINT } from '../constants';
import { runtimeCachesConfig } from '../runtimeCachesConfig';
import sendToClients from './sendToClients';

declare const self: ServiceWorkerGlobalScope;

/**
 * Gets info about api runtime cache
 */
const getApiRuntimeCacheHealthStatus = async (eventSource: MessagePort | Client | ServiceWorker | null) => {
  const CHECK_INTERVAL_MS = 10000; // 10 seconds
  const MAX_CHECK_DURATION_MS = 60000; // 1 minute
  const startTime = Date.now();

  const API_ENDPOINT = ISIA_CARD_DATA_ENDPOINT;
  const REQUIRED_FIELDS = [
    'isiaCode',
    'name',
    'title',
    'countryCode',
    'association',
    'membershipNo',
    'webSite',
    'expirationDate',
  ];

  const checkApiCacheStatus = async (): Promise<{
    allCached: boolean;
    hasAllFields: boolean;
    missingFields: string[];
    message: string;
  }> => {
    try {
      // Get api-runtime cache name
      const apiCacheName = runtimeCachesConfig.api.name;
      
      // Check if api-runtime cache exists
      const cacheExists = await caches.has(apiCacheName);
      if (!cacheExists) {
        return {
          allCached: false,
          hasAllFields: false,
          missingFields: REQUIRED_FIELDS,
          message: 'API cache not found - endpoint may not have been requested yet',
        };
      }

      const apiCache = await caches.open(apiCacheName);

      // Get all cached keys for comprehensive matching (iOS compatibility)
      const cacheKeys = await apiCache.keys();
      
      // Try to find the cached response for /api/isiaCardData
      const apiUrl = new URL(API_ENDPOINT, self.location.href).href;
      const apiPathname = new URL(API_ENDPOINT, self.location.href).pathname;
      
      // Try multiple matching strategies
      const matchResults = [
        await apiCache.match(apiUrl),
        await apiCache.match(apiPathname),
        await apiCache.match(API_ENDPOINT),
        await apiCache.match(new Request(apiPathname)),
        await apiCache.match(new Request(apiUrl)),
        await apiCache.match(apiUrl, { ignoreSearch: true }),
      ];

      let cachedResponse = matchResults.find((response): response is Response => response !== undefined);
      
      /*if (!cachedResponse) {
        // Check if cache has any entries - if it does, the endpoint just isn't cached yet
        const cacheKeys = await apiCache.keys();
        if (cacheKeys.length > 0) {
          return {
            allCached: false,
            hasAllFields: false,
            missingFields: REQUIRED_FIELDS,
            message: 'API endpoint not cached - may need to be requested first',
          };
        } else {
          return {
            allCached: false,
            hasAllFields: false,
            missingFields: REQUIRED_FIELDS,
            message: 'API cache is empty - endpoint may not have been requested yet',
          };
        }
      }*/

      // If not found, try matching by pathname against all cached keys (iOS compatibility)
      if (!cachedResponse && cacheKeys.length > 0) {
        for (const cachedRequest of cacheKeys) {
          try {
            const cachedUrl = new URL(cachedRequest.url);
            const cachedPathname = cachedUrl.pathname;
            
            // Match by pathname (most reliable for iOS)
            if (cachedPathname === apiPathname) {
              const match = await apiCache.match(cachedRequest);
              if (match) {
                cachedResponse = match;
                console.log(`[SW] Found API cache by pathname match: ${cachedRequest.url} -> ${apiPathname}`);
                break;
              }
            }
          } catch (urlError) {
            // Skip invalid URLs
            continue;
          }
        }
      }
    
      if (!cachedResponse) {
        // Check if cache has any entries - if it does, the endpoint just isn't cached yet
        if (cacheKeys.length > 0) {
          // Log what we found for debugging
          console.log(`[SW] API cache has ${cacheKeys.length} entries but endpoint not found. Cached URLs:`, 
            cacheKeys.map(r => {
              try {
                return new URL(r.url).pathname;
              } catch {
                return r.url;
              }
            })
          );
          return {
            allCached: false,
            hasAllFields: false,
            missingFields: REQUIRED_FIELDS,
            message: 'API endpoint not cached - may need to be requested first',
          };
        } else {
          return {
            allCached: false,
            hasAllFields: false,
            missingFields: REQUIRED_FIELDS,
            message: 'API cache is empty - endpoint may not have been requested yet',
          };
        }
      }

      // Parse the cached response to check fields
      try {
        const responseData = await cachedResponse.json();
        const missingFields: string[] = [];
        
        for (const field of REQUIRED_FIELDS) {
          if (!(field in responseData) || responseData[field] === null || responseData[field] === undefined) {
            missingFields.push(field);
          }
        }

        const hasAllFields = missingFields.length === 0;
        
        return {
          allCached: true,
          hasAllFields,
          missingFields,
          message: hasAllFields
            ? 'API data cached with all fields'
            : `API data cached but missing fields: ${missingFields.join(', ')}`,
        };
      } catch (parseError) {
        console.error('[SW] Error parsing cached API response:', parseError);
        return {
          allCached: true,
          hasAllFields: false,
          missingFields: REQUIRED_FIELDS,
          message: 'API data cached but response is invalid',
        };
      }
    } catch (error) {
      console.error('[SW] Error checking API cache status:', error);
      return {
        allCached: false,
        hasAllFields: false,
        missingFields: REQUIRED_FIELDS,
        message: 'Error checking API cache',
      };
    }
  };

  const sendStatusUpdate = async (checkNumber: number) => {
    const status = await checkApiCacheStatus();
    const elapsed = Date.now() - startTime;
    
    let message: string;
    if (status.allCached && status.hasAllFields) {
      message = `Card data cached successfully`;
    } else if (status.allCached && !status.hasAllFields) {
      message = `Card data cached but missing fields: ${status.missingFields.join(', ')}`;
    } else {
      // After 30 seconds, change message to indicate it's not being cached
      if (elapsed > 30000) {
        message = `Card data not cached - endpoint may need to be requested first`;
      } else {
        message = `Waiting for service worker to cache card data...`;
      }
    }

    await sendToClients(eventSource, {
      type: SW_POST_MESSAGES.API_RUNTIME_CACHE_STATUS,
      message,
      allCached: status.allCached,
      hasAllFields: status.hasAllFields,
      missingFields: status.missingFields,
    });

    return status;
  };

  // Initial check
  const initialStatus = await sendStatusUpdate(0);

  // If not all cached and within time limit, continue checking
  if (!(initialStatus.allCached && initialStatus.hasAllFields)) {
    let checkNumber = 1;
    const intervalId = setInterval(async () => {
      const elapsed = Date.now() - startTime;
      
      if (elapsed >= MAX_CHECK_DURATION_MS) {
        clearInterval(intervalId);
        const finalStatus = await checkApiCacheStatus();
        await sendToClients(eventSource, {
          type: SW_POST_MESSAGES.API_RUNTIME_CACHE_STATUS,
          message: finalStatus.allCached && finalStatus.hasAllFields
            ? `Card data cached with all user fields`
            : finalStatus.allCached
              ? `Card data cached but missing fields: ${finalStatus.missingFields.join(', ')}`
              : `Card data may still be caching`,
          allCached: finalStatus.allCached,
          hasAllFields: finalStatus.hasAllFields,
          missingFields: finalStatus.missingFields,
        });
        return;
      }

      const status = await sendStatusUpdate(checkNumber);
      checkNumber++;

      // If all cached with all fields, stop checking
      if (status.allCached && status.hasAllFields) {
        clearInterval(intervalId);
      }
    }, CHECK_INTERVAL_MS);
  }
};

export default getApiRuntimeCacheHealthStatus;
