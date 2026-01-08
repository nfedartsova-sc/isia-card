// Version for cache management
export const CACHE_VERSION = 'v1.0.224';

export const WB_REVISION_PARAM = '__WB_REVISION__';
export const HOMEPAGE_HTML_URL = '/';
export const FALLBACK_HTML_URL = '/offline';
export const FALLBACK_IMG = '/images/fallback-image.jpg';
export const PRECACHED_IMAGES = [
  { url: '/images/ISIA_card_front_with_label.webp', shortDescription: 'frontCardImage' },
  { url: '/images/ISIA_card_back.webp', shortDescription: 'backCardImage' },
  { url: FALLBACK_IMG, shortDescription: 'fallbackImage' },
  { url: '/images/logo.svg', shortDescription: 'isiaLogo' },
];
export const PRECACHED_JS_FILES = [
  { url: '/service-worker.js', revision: null },
];
export const PRECACHE_RESOURCES = [
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
export const criticalResourcesList = PRECACHE_RESOURCES.map(res => res.url);

export const ISIA_CARD_DATA_ENDPOINT = '/api/isiaCardData';
export const IMAGE_API_ENDPOINTS = [
  '/api/isiaCardImage',
  '/api/nationalSign',
  '/api/flag',
];
export const criticalRuntimeImages = IMAGE_API_ENDPOINTS;

export const CLEAR_ORPHANED_INDEXEDDB_ATTEMPTS_NUMBER = 3;
export const CLEAR_ORPHANED_INDEXEDDB_WAIT_INTERVAL_BETWEEN_ATTEMPS_MS = 100;
// For network requests, fall back to cache after given number of seconds if offline
export const NETWORK_TIMEOUT_SECONDS = 3;

export const DESTINATION_TYPE = {
  SCRIPT: 'script',
  STYLE: 'style',
  IMAGE: 'image',
  FONT: 'font',
};