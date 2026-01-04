/// <reference lib="webworker" />

// The previous line tells the compiler to include the "webworker" library types.
// How it works:
// - TypeScript assumes code runs in a DOM context (window, document, etc.).
// - Service workers run in a Worker context, not a Window context.
// - The lib="webworker" directive tells TypeScript to use Worker types instead of DOM types
//   (without it, TypeScript may not recognize: self (ServiceWorkerGlobalScope), caches (CacheStorage API),
//   clients (Clients API), skipWaiting(), clients.claim(), addEventListener for service worker events, ...).

import { registerRoute, setDefaultHandler, setCatchHandler } from 'workbox-routing';
import {
  precache,
  precacheAndRoute, 
  cleanupOutdatedCaches, 
  matchPrecache,
  getCacheKeyForURL,
} from 'workbox-precaching';
import { cacheNames } from 'workbox-core';
import { NetworkFirst, CacheFirst, NetworkOnly } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import {
  CACHE_VERSION,
  FALLBACK_HTML_URL, FALLBACK_IMG, PRECACHED_IMAGES,
  PRECACHED_JS_FILES, DESTINATION_TYPE, IMAGE_API_ENDPOINTS,
  NETWORK_TIMEOUT_SECONDS,
} from './constants';
import { runtimeCachesConfig } from './runtimeCachesConfig';
import { setupActivateHandler } from './activateHandler';
import { setupMessageHandler } from './messageHandler';

declare const self: ServiceWorkerGlobalScope;

// Set up activate event handler
setupActivateHandler();

// Set up message event handler
setupMessageHandler();

// Clean up old caches (with prefix workbox-precache) - runs on service worker activation.
// It does not delete runtime caches
cleanupOutdatedCaches();

// Precache resources with routing
// (caching files in 'install' event handler of service-worker)
precacheAndRoute([
  { url: '/', revision: `main-${CACHE_VERSION}` },
  { url: FALLBACK_HTML_URL, revision: `offline-${CACHE_VERSION}` },
  ...PRECACHED_IMAGES.map((imgData) => ({
    url: imgData.url,
    // revision: `${imgData.shortDescription}-${CACHE_VERSION}`,
    revision: null, // Let Workbox use content hash - only updates if file changes
  })),
  ...PRECACHED_JS_FILES.map((jsData) => ({
    url: jsData.url,
    //revision: jsData.revision || CACHE_VERSION,
    revision: jsData.revision || null, // Use null instead of CACHE_VERSION
  })),
], {
  // Ignore all URL parameters
  ignoreURLParametersMatching: [/.*/],
});

// HTML pages use NetworkFirst (normal behavior)
registerRoute(
  ({ request, url }) => {
    // Handle navigation requests - EXCLUDING the homepage
    return request.mode === 'navigate' && url.pathname !== '/';
  },
  new NetworkFirst({
    cacheName: runtimeCachesConfig.pages.name,
    // Fall back to cache after given number of seconds if offline
    networkTimeoutSeconds: NETWORK_TIMEOUT_SECONDS,
    plugins: [
      // Only requests that return with a 200 status are cached
      new CacheableResponsePlugin({ statuses: [200] }),
      // Cache expiration rules
      new ExpirationPlugin({
        maxEntries: runtimeCachesConfig.pages.maxEntries,
        maxAgeSeconds: runtimeCachesConfig.pages.maxAge,
        //purgeOnQuotaError: true, // Удалить при нехватке места
      }),
    ],
  })
);

// SCRIPTS, STYLES - Cache with StaleWhileRevalidate strategy
registerRoute(
  ({ request, url }) => {
    const isScriptOrStyle = request.destination === DESTINATION_TYPE.SCRIPT ||
                            // !!! CSS files don't always have request.destination === 'style'
                            request.destination === DESTINATION_TYPE.STYLE;
    
    // Match Next.js static assets (CSS/JS files)
    const isNextStaticAsset = url.pathname.startsWith('/_next/static/');

    // Explicitly match CSS files by extension or Content-Type
    const isCSSFile = url.pathname.endsWith('.css') || 
                     request.headers.get('accept')?.includes('text/css') ||
                     url.pathname.includes('/_next/static/css/');

    // Match JS files explicitly
    const isJSFile = url.pathname.endsWith('.js') || 
                    url.pathname.endsWith('.mjs') ||
                    url.pathname.includes('/_next/static/chunks/');
    
    // Exclude precached files
    //const isNotPrecached = !PRECACHED_JS_FILES.map(jsData => jsData.url).includes(url.pathname);
    
    // return (isScriptOrStyle || isNextStaticAsset || isCSSFile || isJSFile) && isNotPrecached;
    return (isScriptOrStyle || isNextStaticAsset || isCSSFile || isJSFile);
  },
  // Why cache first?
  // Since Next.js uses content hashing for static assets (files in /_next/static/ have hash-based
  // filenames), CacheFirst is more appropriate:
  // - Next.js static assets have unique filenames per version
  // - Old versions won't be requested after an update
  // - Better offline reliability for PWA
  // - Faster (no background revalidation)
  new CacheFirst({
    cacheName: runtimeCachesConfig.static.name,
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({
        maxEntries: runtimeCachesConfig.static.maxEntries,
        maxAgeSeconds: 365 * 24 * 60 * 60, // 1 year - safe because Next.js uses content hashing
      }),
    ],
  })
);

// IMAGES - Cache with CacheFirst strategy
registerRoute(
  ({ request, url }) => 
    request.destination === DESTINATION_TYPE.IMAGE,// &&
    //!PRECACHED_IMAGES.map(imgData => imgData.url).includes(url.pathname),
  new CacheFirst({
    cacheName: runtimeCachesConfig.images.name,
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({ maxEntries: runtimeCachesConfig.images.maxEntries }),
    ],
  })
);

// IMAGE API ENDPOINTS - Cache with CacheFirst strategy
registerRoute(
  ({ url }) => IMAGE_API_ENDPOINTS.some(endpoint => url.pathname.startsWith(endpoint)),
  new CacheFirst({
    cacheName: runtimeCachesConfig.images.name,
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({ maxEntries: runtimeCachesConfig.images.maxEntries }),
    ],
  })
);

// API - Cache with NetworkFirst strategy (exclude image API endpoints)
registerRoute(
  ({ url }) => 
    url.pathname.startsWith('/api/') &&
    !IMAGE_API_ENDPOINTS.some(endpoint => url.pathname.startsWith(endpoint)),
  new NetworkFirst({
    cacheName: runtimeCachesConfig.api.name,
    // Fall back to cache after given number of seconds if offline
    networkTimeoutSeconds: NETWORK_TIMEOUT_SECONDS,
    plugins: [
      new CacheableResponsePlugin({ statuses: [200, 304] }),
      new ExpirationPlugin({ maxEntries: runtimeCachesConfig.api.maxEntries }),
    ],
  })
);

// FONTS - Cache with CacheFirst strategy  
registerRoute(
  ({ request }) => request.destination === 'font',
  new CacheFirst({
    cacheName: runtimeCachesConfig.static.name,
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({ maxEntries: 20 }),
    ],
  })
);

// Default handler (must be AFTER all specific routes)
setDefaultHandler(new NetworkOnly());

// Global catch handler for failed requests
setCatchHandler(async ({ request, url }): Promise<Response> => {
  console.warn('[SW] Catch handler triggered for:', request.url, 'destination:', request.destination);

  const destination = request.destination;

  try {
    switch (destination) {
      case 'document': {
        // For HTML pages, prioritize finding the cached homepage (card page)
        // We want to show the card, NOT the offline page
        console.log('[SW] Attempting to find cached homepage...');
  
        // CRITICAL: Try to get the precached homepage first using the origin URL
        const origin = url.origin;
        const baseUrl = origin + '/';
        
        // Method 1: Try matchPrecache with absolute URL
        try {
          const precached = await matchPrecache(baseUrl);
          if (precached) {
            console.log('[SW] Found in precache via absolute URL:', baseUrl);
            return precached;
          }
        } catch (e) {
          console.warn('[SW] matchPrecache with absolute URL failed:', e);
        }
        
        // Method 2: Try matchPrecache with relative URL variations
        const urlVariations = [
          '/',
          url.pathname,
          url.pathname === '/' ? '/' : url.pathname,
          url.pathname.endsWith('/') ? url.pathname.slice(0, -1) : url.pathname + '/',
        ];
        
        for (const urlToTry of urlVariations) {
          try {
            const precached = await matchPrecache(urlToTry);
            if (precached) {
              console.log('[SW] Found in precache via matchPrecache:', urlToTry);
              return precached;
            }
          } catch (e) {
            // Continue to next variation
          }
        }

        // Method 3: Use getCacheKeyForURL + direct cache access
        for (const urlToTry of urlVariations) {
          try {
            const cacheKey = getCacheKeyForURL(urlToTry);
            if (cacheKey) {
              const precacheCache = await caches.open(cacheNames.precache);
              const cached = await precacheCache.match(cacheKey);
              if (cached) {
                console.log('[SW] Found in precache via cacheKey:', urlToTry);
                return cached;
              }
            }
          } catch (e) {
            // Continue to next variation
          }
        }

        // Method 4: Direct cache matching with Request objects (important for mobile)
        for (const urlToTry of urlVariations) {
          try {
            // Try with relative URL
            const cached1 = await caches.match(urlToTry);
            if (cached1) {
              console.log('[SW] Found via caches.match (relative):', urlToTry);
              return cached1;
            }
            
            // Try with absolute URL
            const absoluteUrl = new URL(urlToTry, origin).href;
            const cached2 = await caches.match(absoluteUrl);
            if (cached2) {
              console.log('[SW] Found via caches.match (absolute):', absoluteUrl);
              return cached2;
            }
            
            // Try with Request object
            const requestObj = new Request(urlToTry, { mode: 'navigate' });
            const cached3 = await caches.match(requestObj);
            if (cached3) {
              console.log('[SW] Found via caches.match (Request object):', urlToTry);
              return cached3;
            }
          } catch (e) {
            // Continue to next variation
          }
        }

        // Method 5: Check runtime pages cache
        try {
          const pagesCache = await caches.open(runtimeCachesConfig.pages.name);
          for (const urlToTry of urlVariations) {
            const cached = await pagesCache.match(urlToTry) || 
                          await pagesCache.match(new Request(urlToTry)) ||
                          await pagesCache.match(new URL(urlToTry, origin).href);
            if (cached) {
              console.log('[SW] Found in pages runtime cache:', urlToTry);
              return cached;
            }
          }
        } catch (e) {
          console.warn('[SW] Error accessing pages cache:', e);
        }

        // Method 6: Search ALL caches comprehensively with absolute URLs
        try {
          const cacheNamesList = await caches.keys();
          console.log('[SW] Available caches:', cacheNamesList);
          
          for (const cacheName of cacheNamesList) {
            const cache = await caches.open(cacheName);
            for (const urlToTry of urlVariations) {
              // Try multiple matching strategies
              const matchResults = [
                await cache.match(urlToTry),
                await cache.match(new Request(urlToTry)),
                await cache.match(new URL(urlToTry, origin).href),
                await cache.match(new Request(new URL(urlToTry, origin).href)),
              ];
              
              // Find the first non-undefined match
              const match = matchResults.find((response): response is Response => response !== undefined);
              
              if (match) {
                console.log(`[SW] Found in cache ${cacheName}:`, urlToTry);
                return match;
              }
            }
          }
        } catch (e) {
          console.warn('[SW] Error searching all caches:', e);
        }

        // Debug: Log precache contents
        try {
          const precacheCache = await caches.open(cacheNames.precache);
          const precacheKeys = await precacheCache.keys();
          console.log('[SW] All precache keys:', precacheKeys.map(r => r.url));
          console.log('[SW] Request URL:', request.url);
          console.log('[SW] URL pathname:', url.pathname);
          console.log('[SW] URL origin:', url.origin);
          console.log('[SW] URL href:', url.href);
        } catch (e) {
          console.warn('[SW] Could not inspect precache:', e);
        }

        console.error('[SW] Could not find cached homepage anywhere');
        console.warn('[SW] Available caches:', await caches.keys());

        // Last resort: Return the offline page instead of "Loading application..."
        // This is better UX than an infinite loading message
        try {
          const offlinePage = await matchPrecache(FALLBACK_HTML_URL);
          if (offlinePage) {
            console.log('[SW] Serving offline page as fallback');
            return offlinePage;
          }
        } catch (e) {
          console.warn('[SW] Could not serve offline page:', e);
        }

        // If we can't even find the offline page, return a simple HTML response
        return new Response(
          '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Offline</title><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><h1>You are offline</h1><p>Please check your connection and try again.</p></body></html>',
          { 
            headers: { 
              'Content-Type': 'text/html',
              'Cache-Control': 'no-cache'
            } 
          }
        );
        
        // 4. Last resort - simple HTML response
        // return new Response(
        //   '<h1>You are offline</h1><p>Please check your connection.</p>',
        //   { headers: { 'Content-Type': 'text/html' } }
        // );
      }

      case 'image': {
        const fallbackImage = await caches.match(FALLBACK_IMG);
        if (fallbackImage) return fallbackImage;
        return new Response(
          '<svg width="100" height="100" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100" fill="#ccc"/><text x="50" y="50" text-anchor="middle">No Image</text></svg>',
          { headers: { 'Content-Type': 'image/svg+xml' } }
        );
      }

      case 'style':
        // Try runtime cache with multiple matching strategies
        const staticCache = await caches.open(runtimeCachesConfig.static.name);
        let cachedStyle = await staticCache.match(request) ||
                          await staticCache.match(url.pathname) ||
                          await staticCache.match(request, { ignoreSearch: true });
        if (cachedStyle) return cachedStyle;
        // Return empty CSS as last resort (better than error for styles)
        return new Response('/* Styles unavailable offline */', { 
          headers: { 'Content-Type': 'text/css' } 
        });

      case 'script':
        // Try to get from cache one more time
        const staticCacheForScript = await caches.open(runtimeCachesConfig.static.name);
        const cachedScript = await staticCacheForScript.match(request);
        if (cachedScript) return cachedScript;
        return Response.error();

      case 'font':
        return Response.error();

      default: {
        // Don't handle API calls here - NetworkFirst strategy should handle them
        // If NetworkFirst fails, it means the data isn't cached and network is unavailable
        // Returning Response.error() will cause the fetch to fail, which the app can handle
        return Response.error();
      }
    }
  } catch (error) {
    console.error('Catch handler failed:', error);
    return Response.error();
  }
});


