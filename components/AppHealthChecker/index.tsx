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

const AppHealthChecker: React.FC<AppHealthCheckerProps> = ({
  className = '',
  style = {},
}) => {
  const [preCacheStatus, setPreCacheStatus] = useState<CacheStatus | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  const handleSWMessage = useCallback((event: MessageEvent) => {
    if (event.data && event.data.type === SW_POST_MESSAGES.PRECACHE_STATUS) {
      const { message, allCached, missingResources, cachedCount, totalCount } = event.data;
      setPreCacheStatus({
        message,
        allCached,
        missingResources,
        cachedCount,
        totalCount,
      });
      setIsChecking(!allCached);
    }
  }, []);

  useEffect(() => {
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      // Listen for cache status updates from service worker
      navigator.serviceWorker.addEventListener('message', handleSWMessage);

      // Send initial PRECACHE_STATUS request on mount
      const sendCacheStatusRequest = () => {
        if (navigator.serviceWorker.controller) {
          setIsChecking(true);
          navigator.serviceWorker.controller.postMessage({ 
            type: SW_RECEIVE_MESSAGES.PRECACHE_STATUS 
          });
        }
      };

      // Wait a bit for service worker to be ready
      const timeoutId = setTimeout(sendCacheStatusRequest, 500);

      return () => {
        clearTimeout(timeoutId);
        navigator.serviceWorker.removeEventListener('message', handleSWMessage);
      };
    }
  }, [handleSWMessage]);

  // Don't render if no status or if all resources are cached
//   if (!status || (status.allCached && !isChecking)) {
//     return null;
//   }

  if (!preCacheStatus)
    return (
      <div className={`app-health-checker ${className}`} style={style}>
        No cache health status
      </div>
    );

  return (
    <div className="health-check-container">
      <div className="title"><b>Your app health status:</b></div>

      <div className={`app-health-checker ${className}`} style={style}>
        <div className="health-status-item">
          {
            isChecking
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
      </div>

    </div>
  );
};

export default AppHealthChecker;
