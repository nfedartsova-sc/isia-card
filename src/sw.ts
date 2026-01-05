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
  HOMEPAGE_HTML_URL, FALLBACK_HTML_URL, FALLBACK_IMG, PRECACHED_IMAGES,
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

// Precache resources with routing.
// Caching files in 'install' event handler of service-worker.
// 'revision: null' means that Workbox uses content hash - e.i. only updates if file changes.
precacheAndRoute([
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
], {
  // Ignore all URL parameters
  ignoreURLParametersMatching: [/.*/],
});

// HTML pages use NetworkFirst (normal behavior)
registerRoute(
  ({ request, url }) => {
    return request.mode === 'navigate' && url.pathname !== HOMEPAGE_HTML_URL;
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

// SCRIPTS, STYLES - Cache with CacheFirst strategy
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
    const isNotPrecached = !PRECACHED_JS_FILES.map(jsData => jsData.url).includes(url.pathname);
    
    return (isScriptOrStyle || isNextStaticAsset || isCSSFile || isJSFile) && isNotPrecached;
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
        maxAgeSeconds: runtimeCachesConfig.static.maxAge,
        //purgeOnQuotaError: true, // Удалить при нехватке места
      }),
    ],
  })
);

// IMAGES - Cache with CacheFirst strategy
registerRoute(
  ({ request, url }) => 
    request.destination === DESTINATION_TYPE.IMAGE &&
    !PRECACHED_IMAGES.map(imgData => imgData.url).includes(url.pathname),
  new CacheFirst({
    cacheName: runtimeCachesConfig.images.name,
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({
        maxEntries: runtimeCachesConfig.images.maxEntries,
        maxAgeSeconds: runtimeCachesConfig.images.maxAge,
        //purgeOnQuotaError: true, // Удалить при нехватке места
      }),
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
      new ExpirationPlugin({
        maxEntries: runtimeCachesConfig.images.maxEntries,
        maxAgeSeconds: runtimeCachesConfig.images.maxAge,
        //purgeOnQuotaError: true, // Удалить при нехватке места
      }),
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
      new ExpirationPlugin({
        maxEntries: runtimeCachesConfig.api.maxEntries,
        maxAgeSeconds: runtimeCachesConfig.api.maxAge,
        //purgeOnQuotaError: true, // Удалить при нехватке места
      }),
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
      new ExpirationPlugin({
        maxEntries: runtimeCachesConfig.font.maxEntries,
        maxAgeSeconds: runtimeCachesConfig.font.maxAge,
        //purgeOnQuotaError: true, // Удалить при нехватке места
      }),
    ],
  })
);

// Default handler (must be AFTER all specific routes)
setDefaultHandler(new NetworkOnly());

// Global catch handler for failed requests
setCatchHandler(async ({ request, url }): Promise<Response> => {
  console.warn('[SW] Catch handler triggered for:', request.url, 'destination:', request.destination);

  const destination = request.destination;

  // Helper function to find precached resource by pathname (reusable for images and documents)
  const findPrecachedByPathname = async (pathname: string): Promise<Response | null> => {
    try {
      // Method 1: Use Workbox's matchPrecache (handles __WB_REVISION__ automatically)
      const precached = await matchPrecache(pathname);
      if (precached) {
        console.log('[SW] Found in precache via matchPrecache:', pathname);
        return precached;
      }
    } catch (e) {
      // Continue to manual search
    }

    try {
      // Method 2: Use getCacheKeyForURL (Workbox's recommended way)
      const cacheKey = getCacheKeyForURL(pathname);
      if (cacheKey) {
        const precacheCache = await caches.open(cacheNames.precache);
        const cached = await precacheCache.match(cacheKey);
        if (cached) {
          console.log('[SW] Found in precache via getCacheKeyForURL:', pathname);
          return cached;
        }
      }
    } catch (e) {
      // Continue to manual search
    }

    try {
      // Method 3: Manually search precache cache by iterating keys
      // This handles __WB_REVISION__ query parameters
      const precacheCache = await caches.open(cacheNames.precache);
      const precacheKeys = await precacheCache.keys();
      
      // Normalize pathname for comparison
      const normalizedPathname = pathname === '' ? '/' : pathname;
      
      for (const cachedRequest of precacheKeys) {
        const cachedUrl = new URL(cachedRequest.url);
        // Match by pathname, ignoring query parameters (including __WB_REVISION__)
        if (cachedUrl.pathname === normalizedPathname) {
          const cached = await precacheCache.match(cachedRequest);
          if (cached) {
            console.log('[SW] Found in precache by manual search:', cachedRequest.url, 'for pathname:', normalizedPathname);
            return cached;
          }
        }
      }
    } catch (e) {
      console.warn('[SW] Error manually searching precache:', e);
    }

    return null;
  };

  try {
    switch (destination) {
      case 'document': {
        // Try to find the requested page in precache
        const targetPathname = url.pathname === '' ? '/' : url.pathname;
        const precachedPage = await findPrecachedByPathname(targetPathname);
        if (precachedPage) {
          return precachedPage;
        }

        // Check runtime pages cache (for dynamically cached pages)
        try {
          const pagesCache = await caches.open(runtimeCachesConfig.pages.name);
          const cached = await pagesCache.match(request) ||
                        await pagesCache.match(url.pathname) ||
                        await pagesCache.match(request.url);
          if (cached) {
            console.log('[SW] Found document in pages runtime cache:', url.pathname);
            return cached;
          }
        } catch (e) {
          console.warn('[SW] Error accessing pages cache:', e);
        }

        // Search all caches as fallback
        try {
          const allCachesMatch = await caches.match(request) ||
                               await caches.match(url.pathname) ||
                               await caches.match(request.url);
          if (allCachesMatch) {
            console.log('[SW] Found document in any cache:', url.pathname);
            return allCachesMatch;
          }
        } catch (e) {
          console.warn('[SW] Error searching all caches:', e);
        }

        // Fallback to offline page using the same helper
        const offlinePage = await findPrecachedByPathname(FALLBACK_HTML_URL);
        if (offlinePage) {
          console.log('[SW] Serving offline page as fallback for:', url.pathname);
          return offlinePage;
        }

        // Last resort: Return a simple offline HTML response
        console.error('[SW] Could not find any cached document for:', url.pathname);
        return new Response(
          '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Offline</title><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><h1>You are offline</h1><p>Please check your connection and try again.</p></body></html>',
          { 
            headers: { 
              'Content-Type': 'text/html',
              'Cache-Control': 'no-cache'
            } 
          }
        );
      }

      case 'image': {
        // Method 1: Try precache first using the helper function
        const precachedImage = await findPrecachedByPathname(url.pathname);
        if (precachedImage) {
          console.log('[SW] Found image in precache:', url.pathname);
          return precachedImage;
        }

        // Method 2: Try to find the image in the images runtime cache
        try {
          const imagesCache = await caches.open(runtimeCachesConfig.images.name);
          
          // Try multiple matching strategies for the image
          const cachedImage = await imagesCache.match(request) ||
                            await imagesCache.match(url.pathname) ||
                            await imagesCache.match(request.url) ||
                            await imagesCache.match(request, { ignoreSearch: true });
          
          if (cachedImage) {
            console.log('[SW] Found image in images cache:', request.url);
            return cachedImage;
          }
          console.log('[SW] Could not find image in images cache:', request.url);
        } catch (e) {
          console.warn('[SW] Error searching images cache:', e);
        }
        
        // Method 3: Search all caches as fallback (including precache)
        try {
          const allCachesMatch = await caches.match(request) ||
                               await caches.match(url.pathname) ||
                               await caches.match(request.url);
          if (allCachesMatch) {
            console.log('[SW] Found image in any cache:', request.url);
            return allCachesMatch;
          }
        } catch (e) {
          console.warn('[SW] Error searching all caches:', e);
        }
        
        // Method 4: Try fallback image from precache using helper
        const fallbackImage = await findPrecachedByPathname(FALLBACK_IMG);
        if (fallbackImage) {
          console.log('[SW] Serving fallback image from precache');
          return fallbackImage;
        }
        
        // Last resort: Return SVG placeholder
        console.error('[SW] Could not find image anywhere, including fallback:', url.pathname);
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
        // Handle API endpoints (including image API endpoints that might not have destination='image')
        const isImageAPI = IMAGE_API_ENDPOINTS.some(endpoint => url.pathname.startsWith(endpoint));
        const isAPI = url.pathname.startsWith('/api/');

        if (isImageAPI) {
          // Image API endpoints - check precache first
          try {
            const precached = await matchPrecache(request.url) || 
                            await matchPrecache(url.pathname);
            if (precached) {
              console.log('[SW] Found image API response in precache:', request.url);
              return precached;
            }
          } catch (e) {
            console.warn('[SW] Error checking precache for image API:', e);
          }

          // Try images cache
          try {
            const imagesCache = await caches.open(runtimeCachesConfig.images.name);
            const cachedImage = await imagesCache.match(request) ||
                              await imagesCache.match(url.pathname) ||
                              await imagesCache.match(request.url) ||
                              await imagesCache.match(request, { ignoreSearch: true });
            
            if (cachedImage) {
              console.log('[SW] Found image API response in images cache:', request.url);
              return cachedImage;
            }
          } catch (e) {
            console.warn('[SW] Error searching images cache for API:', e);
          }
          
          // Try all caches as fallback
          try {
            const allCachesMatch = await caches.match(request) ||
                                await caches.match(url.pathname) ||
                                await caches.match(request.url);
            if (allCachesMatch) {
              console.log('[SW] Found image API response in any cache:', request.url);
              return allCachesMatch;
            }
          } catch (e) {
            console.warn('[SW] Error searching all caches for image API:', e);
          }
          
          // Fallback image for image API endpoints
          const fallbackImage = await caches.match(FALLBACK_IMG);
          if (fallbackImage) return fallbackImage;
        }

        if (isAPI) {
          // Regular API endpoints - try API cache with improved matching
          try {
            const apiCache = await caches.open(runtimeCachesConfig.api.name);
            
            // Try multiple matching strategies
            const cachedAPI = await apiCache.match(request) ||
                            await apiCache.match(url.pathname) ||
                            await apiCache.match(request.url) ||
                            await apiCache.match(new Request(url.pathname)) ||
                            await apiCache.match(new Request(request.url)) ||
                            await apiCache.match(request, { ignoreSearch: true });
            
            if (cachedAPI) {
              console.log('[SW] Found API response in cache:', request.url);
              return cachedAPI;
            }
          } catch (e) {
            console.warn('[SW] Error searching API cache:', e);
          }
          
          // Try all caches as fallback (in case it's cached elsewhere)
          try {
            const allCachesMatch = await caches.match(request) ||
                                await caches.match(url.pathname) ||
                                await caches.match(request.url);
            if (allCachesMatch) {
              console.log('[SW] Found API response in any cache:', request.url);
              return allCachesMatch;
            }
          } catch (e) {
            console.warn('[SW] Error searching all caches for API:', e);
          }
        }

        // If nothing found, return error (let the app handle it)
        return Response.error();

        // TODO: delete if not necessary
        // Don't handle API calls here - NetworkFirst strategy should handle them
        // If NetworkFirst fails, it means the data isn't cached and network is unavailable
        // Returning Response.error() will cause the fetch to fail, which the app can handle
        //return Response.error();
      }
    }
  } catch (error) {
    console.error('Catch handler failed:', error);
    return Response.error();
  }
});


