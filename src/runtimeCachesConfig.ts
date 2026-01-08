import { CACHE_VERSION } from './constants';

const OFFLINE_MIN_AGE = 14 * 24 * 60 * 60;  // 14 days (supposed max offline period)
const OFFLINE_MAX_AGE = 365 * 24 * 60 * 60; // 1 year - safe because Next.js uses content hashing

const RUNTIME_CACHE_NAME_PREFIXES = {
  PAGES: 'pages-runtime-',
  STATIC: 'static-runtime-',
  IMAGES: 'images-runtime-',
  API: 'api-runtime-',
  FONT: 'font-runtime-',
};

export const isRuntimeCache = (cacheName: string) => {
  return Object.values(RUNTIME_CACHE_NAME_PREFIXES).some(prefix => 
    cacheName.startsWith(prefix)
  );
};

// COMMENTS:
//
//   (1) maxEntries - the maximum TOTAL number of unique URLs in the cache
// How it works:
// Scenario                          What happens
// ---------------------------------------------------------------
// 1. You cache 60 different         Workbox deletes the 10 oldest
// URLs with maxEntries: 50	         URLs to keep 50
// 2. You fetch /api/data 100 times	 Only 1 entry exists (latest
//                                   response overwrites previous)
//
//   (2) purgeOnQuotaError - is a Workbox ExpirationPlugin option that automatically
// deletes the cache when a quota error occurs (e.g., storage quota exceeded).
// When true, Workbox clears the cache and its metadata to free space and prevent storage errors.
export const runtimeCachesConfig = {
  pages: {
    name: `${RUNTIME_CACHE_NAME_PREFIXES.PAGES}${CACHE_VERSION}`,
    maxAge: OFFLINE_MIN_AGE,
    maxEntries: 30,
    purgeOnQuotaError: true, // Pages are dynamic and can be refetched. Low priority for offline use.
  },
  static: {
    name: `${RUNTIME_CACHE_NAME_PREFIXES.STATIC}${CACHE_VERSION}`,
    maxAge: OFFLINE_MAX_AGE,
    maxEntries: 100, // Next.js can generate many chunks
    purgeOnQuotaError: false, // Critical for app functionality. Next.js uses content hashing,
                              // so old versions won't be requested. Keep these cached for offline use.
  },
  images: {
    name: `${RUNTIME_CACHE_NAME_PREFIXES.IMAGES}${CACHE_VERSION}`,
    maxAge: OFFLINE_MIN_AGE,
    maxEntries: 75,
    purgeOnQuotaError: true, // Images are large and can consume significant space.
                             // Clearing them when quota is exceeded helps manage storage.
  },
  api: {
    name: `${RUNTIME_CACHE_NAME_PREFIXES.API}${CACHE_VERSION}`,
    maxAge: OFFLINE_MIN_AGE,
    maxEntries: 20,
    purgeOnQuotaError: true, // API data can become stale. Clearing it on quota errors helps
                             // maintain freshness and frees space.
  },
  font: {
    name: `${RUNTIME_CACHE_NAME_PREFIXES.FONT}${CACHE_VERSION}`,
    maxAge: OFFLINE_MAX_AGE,
    maxEntries: 20,
    purgeOnQuotaError: false, // Fonts are small, critical for rendering, and rarely change.
                              // Keep them cached for offline use.
  },
};
