import { CACHE_VERSION } from './constants';

// TODO: set networkTimeoutSeconds? set max age seconds? review max cache entries? purgeOnQuotaError?

// maxEntries - the maximum TOTAL number of unique URLs in the cache
// How it works:
// Scenario                          What happens
// ---------------------------------------------------------------
// 1. You cache 60 different         Workbox deletes the 10 oldest
// URLs with maxEntries: 50	         URLs to keep 50
// 2. You fetch /api/data 100 times	 Only 1 entry exists (latest
//                                   response overwrites previous)
export const runtimeCachesConfig = {
  pages: {
    name: `pages-runtime-${CACHE_VERSION}`,
    maxAge: 60 * 60, // 60 minutes
    maxEntries: 50,
  },
  static: {
    name: `static-runtime-${CACHE_VERSION}`,
    //maxAge: 7 * 24 * 60 * 60, // 7 дней
    maxEntries: 50,
  },
  images: {
    name: `images-runtime-${CACHE_VERSION}`,
    //maxAge: 30 * 24 * 60 * 60, // 30 дней
    maxEntries: 50,
  },
  api: {
    name: `api-runtime-${CACHE_VERSION}`,
    //maxAge: 5 * 60, // 5 минут
    maxEntries: 50,
  },
};
