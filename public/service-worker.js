const MIN_UPDATE_INTERVAL_MS = 5000; // Minimum 5 seconds between update checks
const UPDATES_CHECK_FREQUENCY_HOURS = 1; // how often check for updates
const CHECK_UPDATES_DELAY_MS = 2000;
const RELOAD_SERVICE_WORKER_KEY = 'sw-reload';
const RELOAD_SERVICE_WORKER_TIME_KEY = 'sw-reload-time';
const SERVICE_WORKER_FILE = '/sw.js';
const REGISTRATION_SCOPE = './';
const SKIP_WAITING_MESSAGE = 'SKIP_WAITING';
const SMALL_DELAY_TO_ENSURE_SERVICE_WORKER_READY_MS = 100;

function registerServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator))
    return;

  // Check if we just reloaded due to service worker update
  const justReloaded = sessionStorage.getItem(RELOAD_SERVICE_WORKER_KEY);
  if (justReloaded)
    sessionStorage.removeItem(RELOAD_SERVICE_WORKER_KEY);
  
  // Register the service worker
  navigator.serviceWorker.register(SERVICE_WORKER_FILE, {
    scope: REGISTRATION_SCOPE,
    updateViaCache: 'none', // ensuring the browser always fetches fresh SW
  })
    .then((registration) => {
      console.log('The App service worker has been successfully registered:', registration);
      
      // Track if update check is in progress to prevent multiple simultaneous checks
      let updateCheckInProgress = false;
      let lastUpdateCheck = 0;
      
      // Helper function to safely check for updates
      const safeUpdate = () => {
        // Don't check if we just reloaded (within first 3 seconds)
        if (justReloaded && Date.now() - parseInt(sessionStorage.getItem(RELOAD_SERVICE_WORKER_TIME_KEY) || '0') < 3000)
          return;
        
        // Prevent multiple simultaneous update checks
        if (updateCheckInProgress)
          return;
        
        // Throttle update checks
        const now = Date.now();
        if (now - lastUpdateCheck < MIN_UPDATE_INTERVAL_MS)
          return;
        
        try {
          // Only update if registration is in a valid state
          if (registration && (registration.active || registration.waiting)) {
            updateCheckInProgress = true;
            lastUpdateCheck = now;
            
            registration.update().then(() => {
              updateCheckInProgress = false;
            }).catch((error) => {
              updateCheckInProgress = false;
              // Silently ignore update errors - they're not critical
              console.debug('Service worker update check:', error.message);
            });
          }
        } catch (error) {
          updateCheckInProgress = false;
          console.debug('Service worker update check failed:', error.message);
        }
      };
      
      // Only check for updates after a delay (not immediately)
      // Skip immediate check if we just reloaded
      if (!justReloaded && registration.active)
        setTimeout(safeUpdate, MIN_UPDATE_INTERVAL_MS); // Wait seconds before first check
      
      // Periodically check for updates
      setInterval(() => {
        safeUpdate();
      }, UPDATES_CHECK_FREQUENCY_HOURS * 60 * 60 * 1000);
      
      // Check for updates when page becomes visible (user switches back to tab)
      // But only if enough time has passed
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden)
          setTimeout(safeUpdate, CHECK_UPDATES_DELAY_MS); // Small delay to prevent rapid checks
      });
      
      // Listen for updates
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed') {
              if (navigator.serviceWorker.controller) {
                // There's a new service worker available
                // TODO: inform user?
                console.log('New service worker available. Reload to update.');
                // Mark that we're about to reload
                sessionStorage.setItem(RELOAD_SERVICE_WORKER_KEY, 'true');
                sessionStorage.setItem(RELOAD_SERVICE_WORKER_TIME_KEY, Date.now().toString());
                // Force activation by sending skip waiting message
                newWorker.postMessage({ type: SKIP_WAITING_MESSAGE });
              } else {
                // First time installation, no need to reload
                console.log('Service worker installed for the first time.');
              }
            }
          });
        }
      });
    })
    .catch((error) => {
      console.error('Service worker registration failed:', error);
    });
  
  // Listen for controller changes (when new service worker takes control)
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // Only reload if we actually have a new service worker
    if (sessionStorage.getItem(RELOAD_SERVICE_WORKER_KEY)) {
      console.log('Service worker controller changed. Reloading page...');
      // Small delay to ensure the new service worker is ready
      setTimeout(() => {
        window.location.reload();
      }, SMALL_DELAY_TO_ENSURE_SERVICE_WORKER_READY_MS);
    }
  });
}

registerServiceWorker();
