'use client'

import { useCallback, useEffect, useState } from 'react';

import Prompt from '../Prompt/index';
import useNavigatorOnlineStatus  from '@/hooks/useNavigatorOnlineStatus.hook';
import { STORAGE_KEY } from '@/hooks/usePWAInstall.hook';
import { ISIA_CARD_DATA_ENDPOINT } from '@/hooks/useISIACardData.hook';
import { SW_POST_MESSAGES, SW_RECEIVE_MESSAGES } from '@/types/sw-messages';
import { useMessages } from '@/contexts/MessageContext';
import { HOMEPAGE_HTML_URL, PRECACHED_IMAGES, PRECACHED_JS_FILES, IMAGE_API_ENDPOINTS } from '@/src/constants';
import { runtimeCachesConfig } from '@/src/runtimeCachesConfig';

interface ResetAllCachedDataButtonProps {
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

type ResetProgress = 'idle' | 'clearing-caches' | 'cleared-caches' | 'clearing-indexeddb' | 'cleared-indexeddb' | 'complete';
type PreloadAppResourcesProgress = 'idle' | 'preloading' | 'checking' | 'complete';

const ResetAllCachedDataButton: React.FC<ResetAllCachedDataButtonProps> = ({
  className = '',
  style = {},
  children,
}) => {
  const { online } = useNavigatorOnlineStatus();
  const { addMessage } = useMessages();
  const [showResetCachePrompt, setShowResetCachePrompt] = useState(false);
  const [isCheckingServer, setIsCheckingServer] = useState(false);
  const [clearingCache, setClearingCache] = useState(false);
  const [resetProgress, setResetProgress] = useState<ResetProgress>('idle');
  const [preloadAppResourcesProgress, setPreloadAppResourcesProgress] = useState<PreloadAppResourcesProgress>('idle');

  const handleSWMessage = useCallback((event: MessageEvent) => {
    if (event.data && event.data.type === SW_POST_MESSAGES.CACHES_CLEARED)
      addMessage({ message: { type: 'success', text: 'Caches cleared by service worker', level: 'debug' } });
  }, [addMessage]);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      // Listen for cache cleared confirmation from service worker
      navigator.serviceWorker.addEventListener('message', handleSWMessage);
      return () => {
        navigator.serviceWorker.removeEventListener('message', handleSWMessage);
      };
    }
  }, [addMessage]);

  const handleShowResetCachePrompt = useCallback(() => {
    setShowResetCachePrompt(true);
  }, []);

  // Check if server is available
  const checkServerAvailability = useCallback(async (timeoutMs: number = 5000): Promise<boolean> => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(ISIA_CARD_DATA_ENDPOINT, {
        method: 'HEAD', // Use HEAD to minimize data transfer
        signal: controller.signal,
        cache: 'no-store', // Don't use cache for this check
      });

      clearTimeout(timeoutId);
      return response.ok;
    } catch (error: any) {
      if (error.name === 'AbortError') {
        addMessage({ message: { type: 'error', text: 'Server check timed out. Server may be unavailable.', level: 'debug' } });
      } else {
        addMessage({ message: { type: 'error', text: `Server check failed: ${error.message}`, level: 'debug' } });
      }
      return false;
    }
  }, [addMessage]);

  const clearCacheStorage = useCallback(async () => {
    let cachesCleared = false;
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      // Set up one-time listener for cache cleared confirmation.
      // Use a more robust approach with a flag to prevent duplicate handling.
      let messageReceived = false;
      const cacheClearedPromise = new Promise<void>((resolve) => {
        const handleCacheCleared = (event: MessageEvent) => {
          if (event.data && event.data.type === SW_POST_MESSAGES.CACHES_CLEARED && !messageReceived) {
            messageReceived = true;
            navigator.serviceWorker.removeEventListener('message', handleCacheCleared);
            resolve();
          }
        };
        navigator.serviceWorker.addEventListener('message', handleCacheCleared);
        
        // Timeout after 5 seconds if no response
        setTimeout(() => {
          if (!messageReceived) {
            messageReceived = true;
            navigator.serviceWorker.removeEventListener('message', handleCacheCleared);
            // Still resolve even on timeout - caches might have been cleared
            resolve();
          }
        }, 5000);
      });

      // Tell service worker to clear all caches
      navigator.serviceWorker.controller.postMessage({ type: SW_RECEIVE_MESSAGES.CLEAR_ALL_CACHES });
      await cacheClearedPromise;
      cachesCleared = true;

    } else {
      // Fallback: clear caches directly if no active service worker
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(name => caches.delete(name)));
        cachesCleared = true;
      }
    }
    return cachesCleared;
  }, [addMessage]);

  /*const clearIndexedDBDatabases = useCallback(async () => {
    if (indexedDB.databases) {
      const databases = (await indexedDB.databases()); 
      await Promise.all(
        databases
          .filter((db): db is IDBDatabaseInfo & { name: string } => !!db.name)
          .map((db) => {
            return new Promise((resolve, reject) => {
              const request = indexedDB.deleteDatabase(db.name);
              request.onsuccess = () => {
                addMessage({ message: { type: 'success', text: `Database ${db.name} deleted`, level: 'debug' } });
                resolve(true); 
              };
              request.onerror = () => {
                addMessage({ message: { type: 'error', text: `Database ${db.name} error: ${JSON.stringify(request.error)}`, level: 'debug' } });
                reject(request.error); 
              };
              request.onblocked = () => {
                addMessage({ message: { type: 'info', text: `Database ${db.name} deletion blocked`, level: 'debug' } });
                resolve(true);
              };
            });
          })
      );
    }
  }, [addMessage]);*/

  const clearIndexedDBDatabases = useCallback(async () => {
    if (!indexedDB.databases) {
      return;
    }

    const databases = await indexedDB.databases();
    const databasesToDelete = databases.filter(
      (db): db is IDBDatabaseInfo & { name: string } => !!db.name
    );

    if (databasesToDelete.length === 0) {
      addMessage({ message: { type: 'info', text: 'No IndexedDB databases to clear', level: 'debug' } });
      return;
    }

    addMessage({ message: { type: 'info', text: `Clearing ${databasesToDelete.length} IndexedDB database(s)...`, level: 'debug' } });

    // Delete databases in parallel, but wait for each to actually complete
    await Promise.all(
      databasesToDelete.map((db) => {
        return new Promise<void>((resolve, reject) => {
          const MAX_WAIT_MS = 30000; // 30 seconds max per database
          const startTime = Date.now();
          let isResolved = false;

          const timeoutId = setTimeout(() => {
            if (!isResolved) {
              isResolved = true;
              addMessage({ 
                message: { 
                  type: 'info', 
                  text: `Database ${db.name} deletion timed out after ${MAX_WAIT_MS}ms. It may still be deleting in the background.`, 
                  level: 'debug' 
                } 
              });
              resolve(); // Resolve to not block the reset process
            }
          }, MAX_WAIT_MS);

          const request = indexedDB.deleteDatabase(db.name);

          request.onsuccess = () => {
            if (!isResolved) {
              isResolved = true;
              clearTimeout(timeoutId);
              const elapsed = Date.now() - startTime;
              addMessage({ 
                message: { 
                  type: 'success', 
                  text: `Database ${db.name} deleted${elapsed > 1000 ? ` (took ${(elapsed / 1000).toFixed(1)}s)` : ''}`, 
                  level: 'debug' 
                } 
              });
              resolve();
            }
          };

          request.onerror = () => {
            if (!isResolved) {
              isResolved = true;
              clearTimeout(timeoutId);
              addMessage({ 
                message: { 
                  type: 'error', 
                  text: `Database ${db.name} deletion error: ${request.error?.message || 'Unknown error'}`, 
                  level: 'debug' 
                } 
              });
              reject(request.error || new Error(`Failed to delete database ${db.name}`));
            }
          };

          request.onblocked = () => {
            // Don't resolve here - the deletion is still in progress
            // It's waiting for open connections to close
            const elapsed = Date.now() - startTime;
            if (elapsed < 1000) {
              // Only log on first block to avoid spam
              addMessage({ 
                message: { 
                  type: 'info', 
                  text: `Database ${db.name} deletion blocked - waiting for connections to close...`, 
                  level: 'debug' 
                } 
              });
            }
            // Continue waiting for onsuccess or onerror
          };
        });
      })
    );
  }, [addMessage]);

  const handleResetAllCachedData = useCallback(async () => {
    // Close the prompt immediately when user clicks Reset
    setShowResetCachePrompt(false);

    setClearingCache(true);
    setResetProgress('clearing-caches');

    let reloadApp = true;

    try {
      // First, check if server is available
      setIsCheckingServer(true);
      addMessage({ message: { type: 'info', text: 'Checking server availability...', level: 'debug' } });
      
      const serverAvailable = await checkServerAvailability(5000);
      setIsCheckingServer(false);

      if (!serverAvailable) {
        const errorMessage = 'Server is not available. Cannot reset cached data - you would lose all app data. Please try again when server is online.';
        addMessage({ message: { type: 'error', text: errorMessage, level: 'app' }, consoleLog: false });
        addMessage({ message: { type: 'error', text: errorMessage, level: 'debug' } });
        reloadApp = false;
        setResetProgress('idle');
        setClearingCache(false);
        return;
      }
      addMessage({ message: { type: 'success', text: 'Server is available. Proceeding with cache reset...', level: 'debug' } });

      addMessage({ message: { type: 'info', text: 'Called resetting cached data', level: 'debug' } });

      // Clear Cache Storage via service worker
      const cachesCleared = await clearCacheStorage();
      if (cachesCleared) {
        addMessage({ message: { type: 'success', text: 'Cache Storage cleared', level: 'debug' } });
      } else {
        addMessage({ message: { type: 'error', text: 'Cache Storage was not cleared', level: 'debug' } });
      }

      setResetProgress('cleared-caches');

      // Update progress: cache storage cleared, now half-disabled
      setResetProgress('clearing-indexeddb');

      // Clear IndexedDB databases (including workbox-expiration)
      try {
        await clearIndexedDBDatabases();
        addMessage({ message: { type: 'success', text: 'IndexedDB cleared', level: 'debug' } });
      } catch (indexedDBError) {
        addMessage({ message: { type: 'error', text: `IndexedDB clearing error: ${indexedDBError}`, level: 'debug' } });
        // Continue anyway - IndexedDB errors shouldn't block the reset
      }

      setResetProgress('clearing-indexeddb');

      // Update progress: IndexedDB cleared, now fully enabled
      setResetProgress('complete');

      // Clear storage related to PWA installability
      sessionStorage.removeItem(STORAGE_KEY);

      const message = 'All cached data has been cleared successfully! Fresh data will be loaded from server. Reloading page...';
      addMessage({ message: { type: 'success', text: message, level: 'app' }, consoleLog: false });
      addMessage({ message: { type: 'success', text: message, level: 'debug' } });

    } catch (error) {
      setIsCheckingServer(false);
      addMessage({ message: { type: 'error', text: 'An error occurred while clearing cached data. Please try again.', level: 'app' }, consoleLog: false });
      addMessage({ message: { type: 'error', text: 'Error clearing cached data: ' + error, level: 'debug' } });
      setResetProgress('idle');

    } finally {
      // Note: We don't set clearingCache to false here because we want to keep it disabled until reload
      // The button will be fully enabled (resetProgress === 'complete') but clearingCache will prevent clicks
      //setClearingCache(false);

      // Reload even on error to ensure fresh state.
      // This ensures the app gets a fresh start.
      // Delay reload so user can see a message.
      if (reloadApp) {
        // Preload critical resources before reloading.
        // This ensures they're cached in runtime cache.
        try {
          const criticalResources = [
            HOMEPAGE_HTML_URL,
            ...PRECACHED_IMAGES.map(imgData => imgData.url),
            ...PRECACHED_JS_FILES.map(jsData => jsData.url),
            ISIA_CARD_DATA_ENDPOINT, // Preload card data API endpoint
            ...IMAGE_API_ENDPOINTS, // Preload image API endpoints
          ];
          
          // Preload resources in parallel
          await Promise.allSettled(
            criticalResources.map(url => 
              fetch(url, { cache: 'default' }).catch(() => {
                // Ignore errors - resources might not be available
              })
            )
          );

          // Explicitly cache homepage in runtime pages cache
          // This ensures it's available offline even if precache matching fails
          try {
            const homepageResponse = await fetch('/', { 
              method: 'GET',
              cache: 'no-cache', // Force network fetch to get fresh content
            });
            
            if (homepageResponse.ok) {
              // Clone the response because we'll use it twice
              const responseClone = homepageResponse.clone();
              
              // Store in runtime pages cache as fallback
              const pagesCache = await caches.open(runtimeCachesConfig.pages.name);
              await pagesCache.put('/', responseClone);
              
              addMessage({ message: { type: 'success', text: 'Homepage cached in runtime cache for offline use', level: 'debug' } });
            }
          } catch (error) {
            console.warn('Error caching homepage in runtime cache:', error);
            addMessage({ message: { type: 'info', text: 'Could not cache homepage - it may not be available offline', level: 'debug' } });
          }
          
          addMessage({ message: { type: 'success', text: 'Critical resources preloaded', level: 'debug' } });
        } catch (error) {
          // Continue anyway - preloading is best effort
          console.warn('Error preloading resources:', error);
        }
        
        // Delay reload so user can see a message and resources can cache
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      } else {
        setClearingCache(false);
      }
    }
  }, [checkServerAvailability, clearCacheStorage, clearIndexedDBDatabases, addMessage]);

  const handleDismiss = useCallback(() => {
    setShowResetCachePrompt(false);
  }, []);

  if (!online)
    return null;

  // Determine button state based on reset progress
  const getButtonClassName = () => {
    const baseClass = `pwa-install-dlg-button ${className}`;
    if (resetProgress === 'clearing-caches') {
      return `${baseClass} disabled`; // Fully disabled
    } else if (resetProgress === 'clearing-indexeddb') {
      return `${baseClass} half-disabled`; // Half-disabled
    } else if (resetProgress === 'complete') {
      return baseClass; // Fully enabled (but still disabled via disabled prop if clearingCache is true)
    }
    return baseClass;
  };

  return (
    <div>
      <Prompt
        show={showResetCachePrompt}
        title="Reset all cached app data?"
        explanation={isCheckingServer ? "Checking server availability..." : "If server is down, you may lose all your app data"}
        agreeButtonTitle={isCheckingServer ? "Checking..." : "Reset"}
        dismissButtonTitle="Cancel"
        onAgree={handleResetAllCachedData}
        onDismiss={handleDismiss}
        agreeButtonClassName={isCheckingServer ? "disabled" : ""}
      />
      <button
        onClick={handleShowResetCachePrompt}
        className={getButtonClassName()}
        style={style}
        aria-label="Reset all cached data"
        disabled={clearingCache || resetProgress === 'clearing-caches' || resetProgress === 'clearing-indexeddb'}
      >
        {children || 'Reset all cached data'}
      </button>
    </div>
  );
}

export default ResetAllCachedDataButton;