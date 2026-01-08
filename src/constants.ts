// Version for cache management
export const CACHE_VERSION = 'v1.0.207';

export const HOMEPAGE_HTML_URL = '/';
export const FALLBACK_HTML_URL = '/offline';
export const FALLBACK_IMG = '/images/fallback-image.jpg';
export const PRECACHED_IMAGES = [
  { url: '/images/ISIA_card_front_with_label.webp', shortDescription: 'frontCardImage' },
  { url: '/images/ISIA_card_back.webp', shortDescription: 'backCardImage' },
  { url: '/images/fallback-image.jpg', shortDescription: 'fallbackImage' },
  { url: '/images/logo.svg', shortDescription: 'isiaLogo' },
];
export const PRECACHED_JS_FILES = [
  { url: '/service-worker.js', revision: null },
];
export const DESTINATION_TYPE = {
  SCRIPT: 'script',
  STYLE: 'style',
  IMAGE: 'image',
  FONT: 'font',
};
export const ISIA_CARD_DATA_ENDPOINT = '/api/isiaCardData';
export const IMAGE_API_ENDPOINTS = [
  '/api/isiaCardImage',
  '/api/nationalSign',
  '/api/flag',
];
export const CLEAR_ORPHANED_INDEXEDDB_ATTEMPTS_NUMBER = 3;
export const CLEAR_ORPHANED_INDEXEDDB_WAIT_INTERVAL_BETWEEN_ATTEMPS_MS = 100;
// For network requests, fall back to cache after given number of seconds if offline
export const NETWORK_TIMEOUT_SECONDS = 3;

export const RUNTIME_ENDPOINTS = [
  ISIA_CARD_DATA_ENDPOINT,
  ...IMAGE_API_ENDPOINTS,
];
