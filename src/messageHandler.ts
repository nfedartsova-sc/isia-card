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
    else if (event.data.type === SW_RECEIVE_MESSAGES.CLEAR_ALL_CACHES) {
      event.waitUntil(
        caches.keys().then((cacheNames) => {
          return Promise.all(
            cacheNames.map((cacheName) => caches.delete(cacheName))
          );
        }).then(() => {
          // Notify the client that caches are cleared
          self.clients.matchAll().then((clients) => {
            clients.forEach((client) => {
              client.postMessage({ type: SW_POST_MESSAGES.CACHES_CLEARED });
            });
          });
        })
      );
    }

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
