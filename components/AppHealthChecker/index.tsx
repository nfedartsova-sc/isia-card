'use client'

import { useCallback, useEffect, useState } from 'react';

import { SW_POST_MESSAGES, SW_RECEIVE_MESSAGES } from '@/types/sw-messages';
import Loader from '@/components/Loader/index';
import Checked from '@/components/Checked/index';
import formatBytes from './formatBytes';
import { CACHE_VERSION } from '@/src/constants';

import './styles.scss';

const SW_MESSAGE_RECEIVE_TIMEOUT_MS = 15000;

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

interface StorageEstimates {
  quota?: number;
  usage?: number;
}

const AppHealthChecker: React.FC<AppHealthCheckerProps> = ({
  className = '',
  style = {},
}) => {
  const [preCacheStatus, setPreCacheStatus] = useState<CacheStatus | null>(null);
  const [apiCacheStatus, setApiCacheStatus] = useState<ApiCacheStatus | null>(null);
  const [imagesCacheStatus, setImagesCacheStatus] = useState<CacheStatus | null>(null);
  const [storageEstimates, setStorageEstimates] = useState<StorageEstimates | null>(null);
  const [isCheckingPrecache, setIsCheckingPrecache] = useState(false);
  const [isCheckingApiCache, setIsCheckingApiCache] = useState(false);
  const [isCheckingImagesCache, setIsCheckingImagesCache] = useState(false);
  const [isWaitingForSW, setIsWaitingForSW] = useState(true);
  const [hasSentRequests, setHasSentRequests] = useState(false);

  const handleSWMessage = useCallback((event: MessageEvent) => {
    if (!event.data) return;

    if (event.data.type === SW_POST_MESSAGES.PRECACHE_STATUS) {
      const { message, allCached, missingResources, cachedCount, totalCount } = event.data;
      console.log('[AppHealthChecker] PRECACHE_STATUS received:', { message, allCached, missingResources, cachedCount, totalCount });
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

    if (event.data.type === SW_POST_MESSAGES.API_RUNTIME_CACHE_STATUS) {
      const { message, allCached, hasAllFields, missingFields } = event.data;
      console.log('[AppHealthChecker] API_RUNTIME_CACHE_STATUS received:', { message, allCached, hasAllFields, missingFields });
      setApiCacheStatus({
        message,
        allCached,
        hasAllFields,
        missingFields,
      });
      setIsCheckingApiCache(!(allCached && hasAllFields));
      setIsWaitingForSW(false);
    }

    if (event.data.type === SW_POST_MESSAGES.IMAGES_RUNTIME_CACHE_STATUS) {
      const { message, allCached, missingResources, cachedCount, totalCount } = event.data;
      console.log('[AppHealthChecker] IMAGES_RUNTIME_CACHE_STATUS received:', { message, allCached, missingResources, cachedCount, totalCount });
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
    // Getting storage estimates.
    // navigator.storage.estimate() is origin-specific.
    // It returns storage information only for the current origin.
    navigator.storage.estimate().then(estimate => {
      setStorageEstimates({
        quota: estimate.quota,
        usage: estimate.usage,
      });
    });

    if (!('serviceWorker' in navigator)) {
      setIsWaitingForSW(false);
      setHasSentRequests(false);
      return;
    }

    let retryCount = 0;
    const MAX_RETRIES = 20;
    const RETRY_DELAY_MS = 500;
    let cleanupInterval: NodeJS.Timeout | null = null;
    let hasInitialized = false; // a guard flag that ensures cache status requests are sent only once
                                // per useEffect run; it prevents duplicate messages to the service
                                // worker
    let isCleanedUp = false; // a cleanup flag that prevents async operations from running
                             // after the component unmounts; it's a common React pattern
                             // to avoid memory leaks and state updates on unmounted components
    let messageReceivedTimeout: NodeJS.Timeout | null = null;

    const setupMessageListener = () => {
      navigator.serviceWorker.addEventListener('message', handleSWMessage);
      console.log('[AppHealthChecker] Message listener attached');
    };

    const startSendingRequestsToSW = () => {
      hasInitialized = true;
      setHasSentRequests(true);
      setIsWaitingForSW(false);
      setIsCheckingPrecache(true);
      setIsCheckingApiCache(true);
      setIsCheckingImagesCache(true);
    };

    const sendRequestsToSW = (swInstance: ServiceWorker | null) => {
      if (!swInstance) return;
      swInstance.postMessage({ 
        type: SW_RECEIVE_MESSAGES.PRECACHE_STATUS,
      });
      swInstance.postMessage({ 
        type: SW_RECEIVE_MESSAGES.API_RUNTIME_CACHE_STATUS,
      });
      swInstance.postMessage({ 
        type: SW_RECEIVE_MESSAGES.IMAGES_RUNTIME_CACHE_STATUS,
      });
    };

    const sendCacheStatusRequests = () => {
      // Only send requests once per effect run
      if (hasInitialized || isCleanedUp) return false;
      
      // navigator.serviceWorker.controller is a reference to the active service worker
      // that controls the current page. It's the primary way to communicate with the
      // service worker from the page.
      // Returns null if:
      // - no service worker is controlling the page
      // - the page was loaded with a hard refresh
      // - the service worker hasn't activated yet
      // - the page was opened in a new tab before the service worker activated
      const controller = navigator.serviceWorker.controller;
      if (controller) {
        startSendingRequestsToSW();
        console.log('[AppHealthChecker] Sending cache status requests via controller');
        console.log('[AppHealthChecker] Controller state:', controller.state);
        try {
          sendRequestsToSW(controller);
          console.log('[AppHealthChecker] Messages sent successfully');
        } catch (error) {
          console.error('[AppHealthChecker] Error sending messages:', error);
        }
        // Set a timeout: if no messages received within timeout, stop showing "Checking..."
        messageReceivedTimeout = setTimeout(() => {
          console.warn(`[AppHealthChecker] No status messages received within ${SW_MESSAGE_RECEIVE_TIMEOUT_MS / 1000} seconds`);
          console.warn('[AppHealthChecker] Check service worker console for errors');
        }, SW_MESSAGE_RECEIVE_TIMEOUT_MS);
        return true; // Successfully sent
      }
      return false; // No controller available
    };

    const sendViaRegistration = (registration: ServiceWorkerRegistration) => {
      if (hasInitialized || isCleanedUp) return false;
      
      // Try controller first
      if (navigator.serviceWorker.controller)
        return sendCacheStatusRequests();
      
      // If no controller but we have an active service worker, use it
      // (service worker may not be controlling this page yet)
      if (registration.active) {
        startSendingRequestsToSW();
        console.log('[AppHealthChecker] Sending cache status requests via registration.active');
        console.log('[AppHealthChecker] Active state:', registration.active.state);
        try {
          sendRequestsToSW(registration.active);
          console.log('[AppHealthChecker] Messages sent via registration.active');
        } catch (error) {
          console.error('[AppHealthChecker] Error sending messages via registration:', error);
        }
        messageReceivedTimeout = setTimeout(() => {
          console.warn(`[AppHealthChecker] No status messages received within ${SW_MESSAGE_RECEIVE_TIMEOUT_MS / 1000} seconds`);
        }, SW_MESSAGE_RECEIVE_TIMEOUT_MS);
        return true;
      }
      return false;
    };

    const waitForServiceWorker = async () => {
      // Set up message listener immediately so we don't miss any messages
      setupMessageListener();

      // First, try to get the controller immediately
      if (sendCacheStatusRequests())
        return; // Successfully sent requests

      // If no controller, wait for service worker registration to be ready
      try {
        // registration = the active service worker for this origin
        // (may not be controlling this page yet)
        const registration = await navigator.serviceWorker.ready;
        console.log('[AppHealthChecker] Service worker ready, registration:', registration);
        console.log('[AppHealthChecker] Controller:', navigator.serviceWorker.controller);
        console.log('[AppHealthChecker] Active:', registration.active);
        console.log('[AppHealthChecker] Waiting:', registration.waiting);
        console.log('[AppHealthChecker] Installing:', registration.installing);
        
        // Try to send via registration
        if (sendViaRegistration(registration))
          return; // Successfully sent requests
        
        // If still no controller and no active, wait a bit more.
        // Sometimes controller becomes available after ready.
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Try controller again
        if (sendCacheStatusRequests())
          return;
        
        // Try registration again
        if (sendViaRegistration(registration))
          return;
        
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
          if (sendCacheStatusRequests() || sendViaRegistration(registration))
            return;
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
      }, RETRY_DELAY_MS);
    };

    // Start waiting for service worker
    waitForServiceWorker();

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


  const AppHealthStatusTitle = () => (
    <>
      <div className="title">
        <b>Your app health status:</b>
      </div>
      <div className="subtitle">
        Cache Version: {CACHE_VERSION}
      </div>
    </>
  );

  // Show loading if:
  // 1. We're waiting for service worker, OR
  // 2. We've sent requests but haven't received status or storage estimates yet
  const hasAnyStatus = preCacheStatus || apiCacheStatus || imagesCacheStatus;

  const shouldShowLoading = 
    isWaitingForSW || 
    (!storageEstimates && !hasAnyStatus && hasSentRequests);
  
  if (shouldShowLoading) {
    return (
      <div className={`app-health-checker ${className}`} style={style}>
        <div className="health-check-container">
          <AppHealthStatusTitle />
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

  // If we have at least one status or storage estimes, show them
  if (storageEstimates || hasAnyStatus) {
    return (
      <div className="health-check-container">
        <AppHealthStatusTitle />

        <div className={`app-health-checker ${className}`} style={style}>
          {/* Storage estimates */}
          {storageEstimates && (
            <div className="health-status-item">
              {(() => {
                const usagePercent = storageEstimates.quota && storageEstimates.usage
                  ? (storageEstimates.usage / storageEstimates.quota) * 100
                  : null;
                
                const checkStatus = usagePercent !== null
                  ? usagePercent < 60
                    ? 'success'
                    : usagePercent < 90
                      ? 'warning'
                      : 'error'
                  : undefined;
                
                return (
                  <>
                    {checkStatus && (
                      <Checked checkStatus={checkStatus} />
                    )}
                    <div className="health-status-message">
                      Storage: {formatBytes(storageEstimates.usage)} / {formatBytes(storageEstimates.quota)}
                      {usagePercent !== null && (
                        <span className="health-status-progress">
                          {' '}({Math.round(usagePercent)}% used)
                        </span>
                      )}
                    </div>
                  </>
                );
              })()}
            </div>
          )}

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
        <AppHealthStatusTitle />
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