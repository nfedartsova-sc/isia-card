'use client'

import { useCallback, useEffect, useState } from 'react';

import { SW_POST_MESSAGES, SW_RECEIVE_MESSAGES } from '@/types/sw-messages';
import Loader from '@/components/Loader/index';
import Checked from '@/components/Checked/index';

import './styles.scss';

interface AppHealthCheckerProps {
  className?: string;
  style?: React.CSSProperties;
}

interface CacheStatus {
  message: string;
  allCached: boolean;
  missingResources?: string[];
  cachedCount?: number;
  totalCount?: number;
}

interface ApiCacheStatus {
  message: string;
  allCached: boolean;
  hasAllFields: boolean;
  missingFields?: string[];
}

const AppHealthChecker: React.FC<AppHealthCheckerProps> = ({
  className = '',
  style = {},
}) => {
    const [preCacheStatus, setPreCacheStatus] = useState<CacheStatus | null>(null);
    const [apiCacheStatus, setApiCacheStatus] = useState<ApiCacheStatus | null>(null);
    const [imagesCacheStatus, setImagesCacheStatus] = useState<CacheStatus | null>(null);
    const [isCheckingPrecache, setIsCheckingPrecache] = useState(false);
    const [isCheckingApiCache, setIsCheckingApiCache] = useState(false);
    const [isCheckingImagesCache, setIsCheckingImagesCache] = useState(false);
    const [isWaitingForSW, setIsWaitingForSW] = useState(true);
    const [hasSentRequests, setHasSentRequests] = useState(false);

  const handleSWMessage = useCallback((event: MessageEvent) => {
    if (event.data && event.data.type === SW_POST_MESSAGES.PRECACHE_STATUS) {
      const { message, allCached, missingResources, cachedCount, totalCount } = event.data;
      console.log('[AppHealthChecker] PRECACHE_STATUS received:', { allCached, cachedCount, totalCount });
      setPreCacheStatus({
        message,
        allCached,
        missingResources,
        cachedCount,
        totalCount,
      });
      setIsCheckingPrecache(!allCached);
      setIsWaitingForSW(false);
    }

    if (event.data && event.data.type === SW_POST_MESSAGES.API_RUNTIME_CACHE_STATUS) {
      const { message, allCached, hasAllFields, missingFields } = event.data;
      console.log('[AppHealthChecker] API_RUNTIME_CACHE_STATUS received:', { allCached, hasAllFields });
      setApiCacheStatus({
        message,
        allCached,
        hasAllFields,
        missingFields,
      });
      setIsCheckingApiCache(!(allCached && hasAllFields));
      setIsWaitingForSW(false);
    }

    if (event.data && event.data.type === SW_POST_MESSAGES.IMAGES_RUNTIME_CACHE_STATUS) {
        const { message, allCached, missingResources, cachedCount, totalCount } = event.data;
        console.log('[AppHealthChecker] IMAGES_RUNTIME_CACHE_STATUS received:', { allCached, cachedCount, totalCount });
      setImagesCacheStatus({
          message,
          allCached,
          missingResources,
          cachedCount,
          totalCount,
        });
        setIsCheckingImagesCache(!allCached);
        setIsWaitingForSW(false);
      }
  }, []);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) {
      setIsWaitingForSW(false);
      setHasSentRequests(false);
      return;
    }

    let retryCount = 0;
    const MAX_RETRIES = 20; // Increased retries
    const RETRY_DELAY = 500;
    let cleanupInterval: NodeJS.Timeout | null = null;
    let hasInitialized = false;
    let isCleanedUp = false;
    let messageReceivedTimeout: NodeJS.Timeout | null = null;

    const setupMessageListener = () => {
      navigator.serviceWorker.addEventListener('message', handleSWMessage);
      console.log('[AppHealthChecker] Message listener attached');
    };

    const sendCacheStatusRequests = () => {
      // Only send requests once per effect run
      if (hasInitialized || isCleanedUp) return false;
      
      const controller = navigator.serviceWorker.controller;
      if (controller) {
        hasInitialized = true;
        setHasSentRequests(true);
        setIsWaitingForSW(false); // We have a controller, stop waiting
        setIsCheckingPrecache(true);
        setIsCheckingApiCache(true);
        setIsCheckingImagesCache(true);
        
        console.log('[AppHealthChecker] Sending cache status requests via controller');
        console.log('[AppHealthChecker] Controller state:', controller.state);
        
        try {
          controller.postMessage({ 
            type: SW_RECEIVE_MESSAGES.PRECACHE_STATUS 
          });
          controller.postMessage({ 
            type: SW_RECEIVE_MESSAGES.API_RUNTIME_CACHE_STATUS 
          });
          controller.postMessage({ 
            type: SW_RECEIVE_MESSAGES.IMAGES_RUNTIME_CACHE_STATUS 
          });
          console.log('[AppHealthChecker] Messages sent successfully');
        } catch (error) {
          console.error('[AppHealthChecker] Error sending messages:', error);
        }

        // Set a timeout: if no messages received within 15 seconds, stop showing "Checking..."
        messageReceivedTimeout = setTimeout(() => {
            console.warn('[AppHealthChecker] No status messages received within 15 seconds');
          console.warn('[AppHealthChecker] Check service worker console for errors');
        }, 15000);

        return true; // Successfully sent
      }
      return false; // No controller available
    };

    const sendViaRegistration = async (registration: ServiceWorkerRegistration) => {
        if (hasInitialized || isCleanedUp) return false;
        
        // Try controller first
        if (navigator.serviceWorker.controller) {
          return sendCacheStatusRequests();
        }
        
        // If no controller but we have an active service worker, use it
        if (registration.active) {
          hasInitialized = true;
          setHasSentRequests(true);
          setIsWaitingForSW(false);
          setIsCheckingPrecache(true);
          setIsCheckingApiCache(true);
          setIsCheckingImagesCache(true);
          
          console.log('[AppHealthChecker] Sending cache status requests via registration.active');
          console.log('[AppHealthChecker] Active state:', registration.active.state);
          
          try {
            registration.active.postMessage({ 
              type: SW_RECEIVE_MESSAGES.PRECACHE_STATUS 
            });
            registration.active.postMessage({ 
              type: SW_RECEIVE_MESSAGES.API_RUNTIME_CACHE_STATUS 
            });
            registration.active.postMessage({ 
              type: SW_RECEIVE_MESSAGES.IMAGES_RUNTIME_CACHE_STATUS 
            });
            console.log('[AppHealthChecker] Messages sent via registration.active');
          } catch (error) {
            console.error('[AppHealthChecker] Error sending messages via registration:', error);
          }
          
          messageReceivedTimeout = setTimeout(() => {
            console.warn('[AppHealthChecker] No status messages received within 15 seconds');
          }, 15000);
          
          return true;
        }
        
        return false;
      };

      const waitForServiceWorker = async () => {
        // Set up message listener immediately so we don't miss any messages
        setupMessageListener();
  
        // First, try to get the controller immediately
        if (sendCacheStatusRequests()) {
          return; // Successfully sent requests
        }
  
        // If no controller, wait for service worker registration to be ready
        try {
          const registration = await navigator.serviceWorker.ready;
          console.log('[AppHealthChecker] Service worker ready, registration:', registration);
          console.log('[AppHealthChecker] Controller:', navigator.serviceWorker.controller);
          console.log('[AppHealthChecker] Active:', registration.active);
          console.log('[AppHealthChecker] Waiting:', registration.waiting);
          console.log('[AppHealthChecker] Installing:', registration.installing);
          
          // Try to send via registration
          if (await sendViaRegistration(registration)) {
            return; // Successfully sent requests
          }
          
          // If still no controller and no active, wait a bit more
          // Sometimes controller becomes available after ready
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Try controller again
          if (sendCacheStatusRequests()) {
            return;
          }
          
          // Try registration again
          if (await sendViaRegistration(registration)) {
            return;
          }
          
          // If service worker is waiting, it might need to activate
          if (registration.waiting && !registration.active) {
            console.log('[AppHealthChecker] Service worker is waiting, waiting for activation...');
            // Wait for controllerchange event
            const controllerChangePromise = new Promise<void>((resolve) => {
              const handleControllerChange = () => {
                navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
                resolve();
              };
              navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);
              // Timeout after 5 seconds
              setTimeout(() => {
                navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
                resolve();
              }, 5000);
            });
            
            await controllerChangePromise;
            
            // Try again after controller change
            if (await sendCacheStatusRequests() || await sendViaRegistration(registration)) {
              return;
            }
          }
        } catch (error) {
          console.warn('[AppHealthChecker] Service worker registration error:', error);
        }
  
        // Retry logic if controller isn't available yet
        cleanupInterval = setInterval(() => {
          if (isCleanedUp) {
            if (cleanupInterval) {
              clearInterval(cleanupInterval);
              cleanupInterval = null;
            }
            return;
          }
  
          retryCount++;
          
          if (sendCacheStatusRequests()) {
            // Successfully sent requests
            if (cleanupInterval) {
              clearInterval(cleanupInterval);
              cleanupInterval = null;
            }
          } else if (retryCount >= MAX_RETRIES) {
            // Give up after max retries
            if (cleanupInterval) {
              clearInterval(cleanupInterval);
              cleanupInterval = null;
            }
            setIsWaitingForSW(false);
            setHasSentRequests(false);
            console.warn('[AppHealthChecker] Service worker controller not available after', MAX_RETRIES, 'retries');
            console.warn('[AppHealthChecker] This might mean the service worker is not controlling this page');
          }
        }, RETRY_DELAY);
      };

    // Start waiting for service worker
    waitForServiceWorker();

    // // Timeout to stop waiting if no messages received after reasonable time
    // // But don't stop if we're still retrying
    // const timeoutId = setTimeout(() => {
    //   if (!hasInitialized && retryCount >= MAX_RETRIES) {
    //     setIsWaitingForSW(false);
    //   }
    // }, 15000); // 15 seconds timeout (longer than max retries)

    return () => {
      isCleanedUp = true;
      if (cleanupInterval) {
        clearInterval(cleanupInterval);
        cleanupInterval = null;
      }
      if (messageReceivedTimeout) {
        clearTimeout(messageReceivedTimeout);
        messageReceivedTimeout = null;
      }
      navigator.serviceWorker.removeEventListener('message', handleSWMessage);
    };
  }, [handleSWMessage]);

//   useEffect(() => {
//     if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
//       // Listen for cache status updates from service worker
//       navigator.serviceWorker.addEventListener('message', handleSWMessage);

//       // Send initial cache status requests on mount
//       const sendCacheStatusRequests = () => {
//         if (navigator.serviceWorker.controller) {
//           setIsCheckingPrecache(true);
//           setIsCheckingApiCache(true);
//           setIsCheckingImagesCache(true);
//           navigator.serviceWorker.controller.postMessage({ 
//             type: SW_RECEIVE_MESSAGES.PRECACHE_STATUS 
//           });
//           navigator.serviceWorker.controller.postMessage({ 
//             type: SW_RECEIVE_MESSAGES.API_RUNTIME_CACHE_STATUS 
//           });
//           navigator.serviceWorker.controller.postMessage({ 
//             type: SW_RECEIVE_MESSAGES.IMAGES_RUNTIME_CACHE_STATUS 
//           });
//         }
//       };

//       // Wait a bit for service worker to be ready
//       const timeoutId = setTimeout(sendCacheStatusRequests, 500);

//       return () => {
//         clearTimeout(timeoutId);
//         navigator.serviceWorker.removeEventListener('message', handleSWMessage);
//       };
//     }
//   }, [handleSWMessage]);

  // Don't render if no status or if all resources are cached
//   if (!status || (status.allCached && !isChecking)) {
//     return null;
//   }

   // Update render condition to show statuses even if we're still waiting for some
  // Show loading only if we're waiting for SW OR if we've sent requests but have NO statuses at all
  const hasAnyStatus = preCacheStatus || apiCacheStatus || imagesCacheStatus;
  
  if ((isWaitingForSW || (!hasAnyStatus && hasSentRequests)) && !hasAnyStatus) {
    return (
      <div className={`app-health-checker ${className}`} style={style}>
        <div className="health-check-container">
          <div className="title"><b>Your app health status:</b></div>
          <div className="health-status-item">
            <Loader />
            <div className="health-status-message">
              {isWaitingForSW ? 'Waiting for service worker...' : 'Checking cache status...'}
            </div>
          </div>
        </div>
      </div>
    );
  }

   // If we have at least one status, show it
   if (hasAnyStatus) {
    return (
      <div className="health-check-container">
        <div className="title"><b>Your app health status:</b></div>
        <div className={`app-health-checker ${className}`} style={style}>
        {preCacheStatus && (
          <div className="health-status-item">
            {
              isCheckingPrecache
                ? (
                  <>
                    <Loader />
                    <div className="health-status-message">
                      {preCacheStatus.message}
                    </div>
                  </>
                )
                : (
                  <>
                    <Checked
                      checkStatus={
                        !preCacheStatus.missingResources || !preCacheStatus.missingResources.length
                          ? 'success'
                          : preCacheStatus.totalCount && preCacheStatus.missingResources.length < preCacheStatus.totalCount
                            ? 'warning'
                            : 'error'
                      }
                    />
                    <div className="health-status-message">
                      {preCacheStatus.message}
                      {preCacheStatus.cachedCount !== undefined && preCacheStatus.totalCount !== undefined && (
                        <span className="health-status-progress">
                          {' '}({preCacheStatus.cachedCount}/{preCacheStatus.totalCount})
                        </span>
                      )}
                    </div>
                  </>
                )
            }
          </div>
        )}

        {apiCacheStatus && (
          <div className="health-status-item">
            {
              isCheckingApiCache
                ? (
                  <>
                    <Loader />
                    <div className="health-status-message">
                      {apiCacheStatus.message}
                    </div>
                  </>
                )
                : (
                  <>
                    <Checked
                      checkStatus={
                        apiCacheStatus.allCached && apiCacheStatus.hasAllFields
                          ? 'success'
                          : apiCacheStatus.allCached && !apiCacheStatus.hasAllFields
                            ? 'warning'
                            : 'error'
                      }
                    />
                    <div className="health-status-message">
                      {apiCacheStatus.message}
                    </div>
                  </>
                )
            }
          </div>
        )}

        {/* Images cache status */}
        {imagesCacheStatus && (
          <div className="health-status-item">
            {
              isCheckingImagesCache
                ? (
                  <>
                    <Loader />
                    <div className="health-status-message">
                      {imagesCacheStatus.message}
                    </div>
                  </>
                )
                : (
                  <>
                    <Checked
                      checkStatus={
                        !imagesCacheStatus.missingResources || !imagesCacheStatus.missingResources.length
                          ? 'success'
                          : imagesCacheStatus.totalCount && imagesCacheStatus.missingResources.length < imagesCacheStatus.totalCount
                            ? 'warning'
                            : 'error'
                      }
                    />
                    <div className="health-status-message">
                      {imagesCacheStatus.message}
                      {imagesCacheStatus.cachedCount !== undefined && imagesCacheStatus.totalCount !== undefined && (
                        <span className="health-status-progress">
                          {' '}({imagesCacheStatus.cachedCount}/{imagesCacheStatus.totalCount})
                        </span>
                      )}
                    </div>
                  </>
                )
            }
          </div>
        )}
      </div>

    </div>
  );
}

// Fallback: initial state
return (
    <div className={`app-health-checker ${className}`} style={style}>
      <div className="health-check-container">
        <div className="title"><b>Your app health status:</b></div>
        <div className="health-status-item">
          <Loader />
          <div className="health-status-message">
            Initializing...
          </div>
        </div>
      </div>
    </div>
  );
};

export default AppHealthChecker;