/// <reference lib="webworker" />

import { SW_POST_MESSAGES, SW_RECEIVE_MESSAGES } from '@/types/sw-messages';
import { cacheNames } from 'workbox-core';

declare const self: ServiceWorkerGlobalScope;

/**
 * Sets up the message event listener for the service worker.
 * Handles messages from clients (skip waiting, clear caches, etc.).
 */
export function setupMessageHandler() {
  self.addEventListener('message', (event) => {
    if (!event.data) return;
    
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

    // Handle cache clear request (clears runtime caches but preserves precache for offline functionality)
    else if (event.data.type === SW_RECEIVE_MESSAGES.CLEAR_ALL_CACHES) {
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
