/// <reference lib="webworker" />

import { SW_POST_MESSAGES, SW_RECEIVE_MESSAGES } from '@/types/sw-messages';
import { matchPrecache, getCacheKeyForURL } from 'workbox-precaching';
import { cacheNames } from 'workbox-core';
import {
  CACHE_VERSION,
  HOMEPAGE_HTML_URL,
  FALLBACK_HTML_URL,
  PRECACHED_IMAGES,
  PRECACHED_JS_FILES,
  IMAGE_API_ENDPOINTS,
} from './constants';
import { runtimeCachesConfig } from './runtimeCachesConfig';

declare const self: ServiceWorkerGlobalScope;

/**
 * Sets up the message event listener for the service worker.
 * Handles messages from clients (skip waiting, clear caches, etc.).
 */
export function setupMessageHandler() {
  self.addEventListener('message', (event) => {
    if (!event.data) return;

    console.log('[SW] Received message:', event.data.type);

        // Helper function to send message to client(s)
        const sendToClients = async (message: any) => {
          // First, try to send directly to the source if available
          if (event.source && 'postMessage' in event.source) {
            try {
              (event.source as Client).postMessage(message);
              console.log('[SW] Message sent via event.source');
              return;
            } catch (error) {
              console.warn('[SW] Failed to send via event.source:', error);
            }
          }
    
          // Fallback: try to get clients, with retry logic
          let clients = await self.clients.matchAll({ includeUncontrolled: true });
          console.log('[SW] Found', clients.length, 'clients on first attempt');
          
          // If no clients, wait a bit and try again
          if (clients.length === 0) {
            await new Promise(resolve => setTimeout(resolve, 100));
            clients = await self.clients.matchAll({ includeUncontrolled: true });
            console.log('[SW] Found', clients.length, 'clients on second attempt');
          }
          
          // If still no clients, wait a bit more
          if (clients.length === 0) {
            await new Promise(resolve => setTimeout(resolve, 200));
            clients = await self.clients.matchAll({ includeUncontrolled: true });
            console.log('[SW] Found', clients.length, 'clients on third attempt');
          }
    
          if (clients.length > 0) {
            clients.forEach((client) => {
              client.postMessage(message);
            });
            console.log('[SW] Message sent to', clients.length, 'clients');
          } else {
            console.warn('[SW] No clients available to send message to');
          }
        };
    
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

    // Handle cache clear request (clears ALL caches - both precache and runtime caches)
    /*else if (event.data.type === SW_RECEIVE_MESSAGES.CLEAR_ALL_CACHES) {
      event.waitUntil(
        
        // TODO: delete if not needed

        // caches.keys().then((cacheNames) => {
        //   return Promise.all(
        //     cacheNames.map((cacheName) => caches.delete(cacheName))
        //   );
        // }).then(() => {
        //   // Notify the client that caches are cleared
        //   self.clients.matchAll().then((clients) => {
        //     clients.forEach((client) => {
        //       client.postMessage({ type: SW_POST_MESSAGES.CACHES_CLEARED });
        //     });
        //   });
        // })


        (async () => {
          try {
            // Get all cache names
            const cacheNamesList = await caches.keys();
            console.log('[SW] Clearing caches:', cacheNamesList);
            
            // Delete all caches with retry logic
            const deleteResults = await Promise.allSettled(
              cacheNamesList.map(async (cacheName) => {
                // Try deleting up to 3 times
                for (let attempt = 0; attempt < 3; attempt++) {
                  const deleted = await caches.delete(cacheName);
                  if (deleted) {
                    console.log(`[SW] Cache ${cacheName} deleted successfully`);
                    return { cacheName, success: true };
                  }
                  
                  // If deletion failed, wait a bit and retry
                  if (attempt < 2) {
                    console.warn(`[SW] Cache ${cacheName} deletion failed (attempt ${attempt + 1}), retrying...`);
                    await new Promise(resolve => setTimeout(resolve, 100));
                  } else {
                    console.error(`[SW] Cache ${cacheName} deletion failed after 3 attempts`);
                    return { cacheName, success: false };
                  }
                }
                return { cacheName, success: false };
              })
            );
            
            // Check if any deletions failed
            const failedDeletions = deleteResults
              .filter((result): result is PromiseRejectedResult | PromiseFulfilledResult<{ cacheName: string; success: boolean }> => 
                result.status === 'rejected' || 
                (result.status === 'fulfilled' && !result.value.success)
              )
              .map(result => 
                result.status === 'rejected' 
                  ? result.reason 
                  : result.value.cacheName
              );
            
            if (failedDeletions.length > 0) {
              console.error('[SW] Failed to delete some caches:', failedDeletions);
            }
            
            // Verify all caches are actually deleted
            const remainingCaches = await caches.keys();
            if (remainingCaches.length > 0) {
              console.warn('[SW] Some caches still exist after deletion:', remainingCaches);
              
              // Try one more time to delete remaining caches
              await Promise.allSettled(
                remainingCaches.map(cacheName => caches.delete(cacheName))
              );
              
              // Final verification
              const finalCaches = await caches.keys();
              if (finalCaches.length > 0) {
                console.error('[SW] Caches still remaining after final attempt:', finalCaches);
              } else {
                console.log('[SW] All caches successfully deleted after retry');
              }
            } else {
              console.log('[SW] All caches successfully deleted');
            }
            
            // Notify the client that caches are cleared
            const clients = await self.clients.matchAll();
            clients.forEach((client) => {
              client.postMessage({ type: SW_POST_MESSAGES.CACHES_CLEARED });
            });
          } catch (error) {
            console.error('[SW] Error clearing caches:', error);
            // Still notify client even if there was an error
            const clients = await self.clients.matchAll();
            clients.forEach((client) => {
              client.postMessage({ type: SW_POST_MESSAGES.CACHES_CLEARED });
            });
          }
        })()
      );
    }*/


      // VERY GOOD!!!
    // Handle cache clear request (clears runtime caches but preserves precache for offline functionality)
    /*else if (event.data.type === SW_RECEIVE_MESSAGES.CLEAR_ALL_CACHES) {
      event.waitUntil(
        (async () => {
          try {
            // Get all cache names
            const cacheNamesList = await caches.keys();
            console.log('[SW] Clearing caches:', cacheNamesList);
            
            // IMPORTANT: Preserve the precache so the app works offline
            // Only clear runtime caches, not the workbox-precache which contains static assets
            const precacheCacheName = cacheNames.precache;
            
            const cachesToDelete = cacheNamesList.filter(
              (cacheName) => cacheName !== precacheCacheName
            );
            
            console.log('[SW] Preserving precache:', precacheCacheName);
            console.log('[SW] Deleting runtime caches:', cachesToDelete);
            
            // Delete only runtime caches with retry logic
            const deleteResults = await Promise.allSettled(
              cachesToDelete.map(async (cacheName) => {
                // Try deleting up to 3 times
                for (let attempt = 0; attempt < 3; attempt++) {
                  const deleted = await caches.delete(cacheName);
                  if (deleted) {
                    console.log(`[SW] Cache ${cacheName} deleted successfully`);
                    return { cacheName, success: true };
                  }
                  
                  // If deletion failed, wait a bit and retry
                  if (attempt < 2) {
                    console.warn(`[SW] Cache ${cacheName} deletion failed (attempt ${attempt + 1}), retrying...`);
                    await new Promise(resolve => setTimeout(resolve, 100));
                  } else {
                    console.error(`[SW] Cache ${cacheName} deletion failed after 3 attempts`);
                    return { cacheName, success: false };
                  }
                }
                return { cacheName, success: false };
              })
            );
            
            // Check if any deletions failed
            const failedDeletions = deleteResults
              .filter((result): result is PromiseRejectedResult | PromiseFulfilledResult<{ cacheName: string; success: boolean }> => 
                result.status === 'rejected' || 
                (result.status === 'fulfilled' && !result.value.success)
              )
              .map(result => 
                result.status === 'rejected' 
                  ? result.reason 
                  : result.value.cacheName
              );
            
            if (failedDeletions.length > 0) {
              console.error('[SW] Failed to delete some caches:', failedDeletions);
            }
            
            // Verify runtime caches are deleted (but precache should still exist)
            const remainingCaches = await caches.keys();
            const remainingRuntimeCaches = remainingCaches.filter(name => name !== precacheCacheName);
            if (remainingRuntimeCaches.length > 0) {
              console.warn('[SW] Some runtime caches still exist after deletion:', remainingRuntimeCaches);
              
              // Try one more time to delete remaining runtime caches
              await Promise.allSettled(
                remainingRuntimeCaches.map(cacheName => caches.delete(cacheName))
              );
            }
            
            console.log('[SW] Runtime caches cleared, precache preserved');
            
            // Notify the client that caches are cleared
            const clients = await self.clients.matchAll();
            clients.forEach((client) => {
              client.postMessage({ type: SW_POST_MESSAGES.CACHES_CLEARED });
            });
          } catch (error) {
            console.error('[SW] Error clearing caches:', error);
            // Still notify client even if there was an error
            const clients = await self.clients.matchAll();
            clients.forEach((client) => {
              client.postMessage({ type: SW_POST_MESSAGES.CACHES_CLEARED });
            });
          }
        })()
    );
    }*/


    // Handle cache clear request (clears ALL caches - both runtime and precache)
    else if (event.data.type === SW_RECEIVE_MESSAGES.CLEAR_ALL_CACHES) {
      event.waitUntil(
        (async () => {
          try {
            // Get all cache names
            const cacheNamesList = await caches.keys();
            console.log('[SW] Clearing all caches:', cacheNamesList);
            
            if (cacheNamesList.length === 0) {
              console.log('[SW] No caches to clear');
              // Still notify client
              // const clients = await self.clients.matchAll();
              // clients.forEach((client) => {
              //   client.postMessage({ type: SW_POST_MESSAGES.CACHES_CLEARED });
              // });
              // return;
              await sendToClients({ type: SW_POST_MESSAGES.CACHES_CLEARED });
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


            // AFTER clearing caches, trigger service worker update to reinstall precache
            // This ensures the precache gets repopulated during the install event

            //registration.update() doesn't trigger a reinstall if the service worker file hasn't changed, so the install event doesn't fire and precacheAndRoute() doesn't run


            // try {
            //   // Force service worker to update/reinstall
            //   // This will trigger the install event which repopulates the precache
            //   if (self.registration) {
            //     await self.registration.update();
            //     console.log('[SW] Triggered service worker update to repopulate precache');
            //   } else {
            //     console.warn('[SW] Service worker registration not available, cannot trigger update');
            //   }
            // } catch (error) {
            //   console.error('[SW] Error triggering service worker update:', error);
            //   // Continue anyway - the page reload will trigger reinstall
            // }


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



            // // Notify all clients that caches are cleared
            // const clients = await self.clients.matchAll();
            // clients.forEach((client) => {
            //   client.postMessage({ type: SW_POST_MESSAGES.CACHES_CLEARED });
            // });

            await sendToClients({ type: SW_POST_MESSAGES.CACHES_CLEARED });


          } catch (error) {
            console.error('[SW] Unexpected error while clearing caches:', error);
            // Still notify client even if there was an error
            try {
              // const clients = await self.clients.matchAll();
              // clients.forEach((client) => {
              //   client.postMessage({ type: SW_POST_MESSAGES.CACHES_CLEARED });
              // });
              await sendToClients({ type: SW_POST_MESSAGES.CACHES_CLEARED });
            } catch (notificationError) {
              console.error('[SW] Failed to notify clients:', notificationError);
            }
          }
        })()
      );
    }

// Handle cache status check request
else if (event.data.type === SW_RECEIVE_MESSAGES.PRECACHE_STATUS) {
  console.log('[SW] Received PRECACHE_STATUS message');
  // Don't use waitUntil here - we want this to run independently
  event.waitUntil((async () => {
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

      // const clients = await self.clients.matchAll();
      // console.log('[SW] Sending PRECACHE_STATUS to', clients.length, 'clients');
      // clients.forEach((client) => {
      //   client.postMessage({
      //     type: SW_POST_MESSAGES.PRECACHE_STATUS,
      //     message,
      //     allCached: status.allCached,
      //     missingResources: status.missingResources,
      //     cachedCount: status.cachedCount,
      //     totalCount: status.totalCount,
      //   });
      // });

      await sendToClients({
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
          // const clients = await self.clients.matchAll();
          // clients.forEach((client) => {
          //   client.postMessage({
          //     type: SW_POST_MESSAGES.PRECACHE_STATUS,
          //     message: finalStatus.allCached
          //       ? `All critical resources cached`
          //       : `Some resources may still be caching (${finalStatus.missingResources.length} remaining)`,
          //     allCached: finalStatus.allCached,
          //     missingResources: finalStatus.missingResources,
          //     cachedCount: finalStatus.cachedCount,
          //     totalCount: finalStatus.totalCount,
          //   });
          // });
          await sendToClients({
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
  })());
}


// Handle API cache status check request
else if (event.data.type === SW_RECEIVE_MESSAGES.API_RUNTIME_CACHE_STATUS) {
  // Don't use waitUntil here - we want this to run independently
  console.log('[SW] Processing API_RUNTIME_CACHE_STATUS request');
  event.waitUntil((async () => {
    const CHECK_INTERVAL_MS = 10000; // 10 seconds
    const MAX_CHECK_DURATION_MS = 60000; // 1 minute
    const startTime = Date.now();

    const API_ENDPOINT = '/api/isiaCardData';
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

        const cachedResponse = matchResults.find((response): response is Response => response !== undefined);
        
        if (!cachedResponse) {
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

      // const clients = await self.clients.matchAll();
      // clients.forEach((client) => {
      //   client.postMessage({
      //     type: SW_POST_MESSAGES.API_RUNTIME_CACHE_STATUS,
      //     message,
      //     allCached: status.allCached,
      //     hasAllFields: status.hasAllFields,
      //     missingFields: status.missingFields,
      //   });
      // });

      await sendToClients({
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
          // const clients = await self.clients.matchAll();
          // clients.forEach((client) => {
          //   client.postMessage({
          //     type: SW_POST_MESSAGES.API_RUNTIME_CACHE_STATUS,
          //     message: finalStatus.allCached && finalStatus.hasAllFields
          //       ? `Card data cached with all user fields`
          //       : finalStatus.allCached
          //         ? `Card data cached but missing fields: ${finalStatus.missingFields.join(', ')}`
          //         : `Card data may still be caching`,
          //     allCached: finalStatus.allCached,
          //     hasAllFields: finalStatus.hasAllFields,
          //     missingFields: finalStatus.missingFields,
          //   });
          // });
          await sendToClients({
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
  })());
}


// Handle Images runtime cache status check request
else if (event.data.type === SW_RECEIVE_MESSAGES.IMAGES_RUNTIME_CACHE_STATUS) {
  // Don't use waitUntil here - we want this to run independently
  console.log('[SW] Processing IMAGES_RUNTIME_CACHE_STATUS request');
  event.waitUntil((async () => {
    const CHECK_INTERVAL_MS = 10000; // 10 seconds
    const MAX_CHECK_DURATION_MS = 60000; // 1 minute
    const startTime = Date.now();

    // Get list of critical images that should be in images-runtime cache
    const criticalImages = [
      //...PRECACHED_IMAGES.map(img => img.url),
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

      // const clients = await self.clients.matchAll();
      // clients.forEach((client) => {
      //   client.postMessage({
      //     type: SW_POST_MESSAGES.IMAGES_RUNTIME_CACHE_STATUS,
      //     message,
      //     allCached: status.allCached,
      //     missingResources: status.missingResources,
      //     cachedCount: status.cachedCount,
      //     totalCount: status.totalCount,
      //   });
      // });

      await sendToClients({
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
          // const clients = await self.clients.matchAll();
          // clients.forEach((client) => {
          //   client.postMessage({
          //     type: SW_POST_MESSAGES.IMAGES_RUNTIME_CACHE_STATUS,
          //     message: finalStatus.allCached
          //       ? `All images cached`
          //       : `Some images may still be caching (${finalStatus.missingResources.length} remaining)`,
          //     allCached: finalStatus.allCached,
          //     missingResources: finalStatus.missingResources,
          //     cachedCount: finalStatus.cachedCount,
          //     totalCount: finalStatus.totalCount,
          //   });
          // });
          await sendToClients({
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
  })());
}


    // TODO: delete if not necessary

     // Handle cache clear request (clears runtime caches but preserves precache for offline functionality)
    //  else if (event.data.type === SW_RECEIVE_MESSAGES.CLEAR_ALL_CACHES) {
    //   event.waitUntil(
    //     caches.keys().then((cacheNamesList) => {
    //       // IMPORTANT: Preserve the precache so the app works offline
    //       // Only clear runtime caches, not the workbox-precache which contains the homepage
    //       const precacheCacheName = cacheNames.precache;
          
    //       const cachesToDelete = cacheNamesList.filter(
    //         (cacheName) => cacheName !== precacheCacheName
    //       );
          
    //       return Promise.all(
    //         cachesToDelete.map((cacheName) => caches.delete(cacheName))
    //       );
    //     }).then(() => {
    //       // Notify the client that caches are cleared
    //       self.clients.matchAll().then((clients) => {
    //         clients.forEach((client) => {
    //           client.postMessage({ type: SW_POST_MESSAGES.CACHES_CLEARED });
    //         });
    //       });
    //     })
    //   );
    // }
  });
}
