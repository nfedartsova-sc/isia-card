import { useCallback, useEffect, useState } from 'react';

import useWindowEvent from './useWindowEvent.hook';

const ONLINE_DEFAULT_VALUE = true;

export default function useNavigatorOnlineStatus() {
  const [online, setOnline] = useState(ONLINE_DEFAULT_VALUE);
  const [isClient, setIsClient] = useState<boolean>(false);
    
  const handleOnline = useCallback(() => setOnline(true), []);
  const handleOffline = useCallback(() => setOnline(false), []);

  useWindowEvent('online', handleOnline);
  useWindowEvent('offline', handleOffline);

  useEffect(() => {
    // Setting the flag that the code is executed on client
    setIsClient(true);
    
    // Setting initial value
    setOnline(navigator.onLine);
  }, []);
  
  // Returning default values on server
  if (!isClient) {
    return {
      online: ONLINE_DEFAULT_VALUE,
    };
  }

  return {
    online,
  };
}
