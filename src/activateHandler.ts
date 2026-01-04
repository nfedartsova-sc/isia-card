/// <reference lib="webworker" />

import { runtimeCachesConfig } from './runtimeCachesConfig';
import {
  CLEAR_ORPHANED_INDEXEDDB_ATTEMPTS_NUMBER,
  CLEAR_ORPHANED_INDEXEDDB_WAIT_INTERVAL_BETWEEN_ATTEMPS_MS,
} from './constants';

declare const self: ServiceWorkerGlobalScope;

/**
 * Sets up the activate event listener for the service worker.
 * Handles cleanup of old caches and orphaned IndexedDB databases.
 */
export function setupActivateHandler() {
  // Deleting OLD RUNTIME caches on service worker activation
  self.addEventListener('activate', (event) => {
    event.waitUntil(
      Promise.all([
        // 1. Clean old runtime caches
        caches.keys().then((cacheNames) => {
          const validCacheNames = Object.values(runtimeCachesConfig).map(c => c.name);
          const cachesToDelete = cacheNames.filter(
            cacheName => cacheName.includes('runtime') && !validCacheNames.includes(cacheName)
          );
          return Promise.all(
            cachesToDelete.map((cacheName) => {
              return caches.delete(cacheName).then(deleted => {
                console.log(`[SW] Cache ${cacheName} deleted:`, deleted);
                return deleted;
              });
            })
          );
        }),
         // 2. Clean old precache caches (IMPORTANT: This ensures new precache entries replace old ones)
         caches.keys().then((cacheNames) => {
          const precacheCaches = cacheNames.filter(name => 
            name.includes('precache') || name.startsWith('workbox-precache')
          );
          // Keep only the current precache cache
          const currentPrecacheCache = cacheNames.precache;
          const oldPrecacheCaches = precacheCaches.filter(name => name !== currentPrecacheCache);
          
          return Promise.all(
            oldPrecacheCaches.map((cacheName) => {
              return caches.delete(cacheName).then(deleted => {
                console.log(`[SW] Old precache ${cacheName} deleted:`, deleted);
                return deleted;
              });
            })
          );
        }),
        // 3. Clean orphaned IndexedDB (workbox-expiration databases)
        (async () => {
          if (typeof indexedDB === 'undefined' || !indexedDB.databases)
            return;
          
          const validDbNames = Object.values(runtimeCachesConfig).map(c => `workbox-expiration-${c.name}`);
          
          const databases = await indexedDB.databases();
          const orphanedDbs = databases.filter(
            db => db.name?.startsWith('workbox-expiration-') && !validDbNames.includes(db.name!)
          );
          
          console.log('[SW] Cleaning orphaned IndexedDBs:', orphanedDbs.map(d => d.name));
          
          for (const db of orphanedDbs) {
            // Try multiple times with delay
            for (let attempt = 0; attempt < CLEAR_ORPHANED_INDEXEDDB_ATTEMPTS_NUMBER; attempt++) {
              const deleted = await new Promise<boolean>((resolve) => {
                const req = indexedDB.deleteDatabase(db.name!);
                req.onsuccess = () => {
                  console.log(`[SW] Deleted IndexedDB: ${db.name}`);
                  resolve(true);
                };
                req.onerror = () => resolve(false);
                req.onblocked = () => {
                  console.warn(`[SW] IndexedDB blocked: ${db.name}, attempt ${attempt + 1}`);
                  resolve(false);
                };
              });
              if (deleted) break;
              await new Promise(r => setTimeout(r, CLEAR_ORPHANED_INDEXEDDB_WAIT_INTERVAL_BETWEEN_ATTEMPS_MS));
            }
          }
        })(),
        // 4. Ensure service worker takes control immediately
        // (wrapping clients.claim() in event.waitUntil() ensures it completes before
        // the activate event finishes)
        // This method takes immediate control of any existing clients (open tabs/windows) when the service worker activates.
        // Without clientsClaim():
        // 1) New service worker installs and activates
        // 2) Existing tabs remain with old code until manually refreshed
        // 3) Only new tabs get the new service worker
        // With clientsClaim():
        // 1) New service worker installs and activates
        // 2) Immediately takes control of all existing tabs
        // 3) All tabs now use the new service worker instantly
        self.clients.claim(),
      ])
    );
  });
}
