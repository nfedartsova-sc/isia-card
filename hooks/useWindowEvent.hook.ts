import { useEffect } from 'react';

export default function useWindowEvent(event: any, callback: any) {
  useEffect(() => {
    window.addEventListener(event, callback);
    return () => window.removeEventListener(event, callback);
  }, [event, callback]);
};
