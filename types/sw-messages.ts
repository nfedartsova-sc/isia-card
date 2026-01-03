// Service Worker message types - shared between SW and app
export const SW_POST_MESSAGES = {
  CACHES_CLEARED: 'CACHES_CLEARED',
};
  
export const SW_RECEIVE_MESSAGES = {
  SKIP_WAITING: 'SKIP_WAITING',
  CLEAR_ALL_CACHES: 'CLEAR_ALL_CACHES',
};
