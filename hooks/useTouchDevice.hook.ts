import { useEffect, useState } from 'react';

type TouchDeviceStatus = true | false | undefined;
const DEFAULT_IS_TOUCH_DEVICE: TouchDeviceStatus = undefined;

export default function useTouchDevice() {
  const [isTouchDevice, setIsTouchDevice] = useState<TouchDeviceStatus>(DEFAULT_IS_TOUCH_DEVICE);
  const [isClient, setIsClient] = useState<boolean>(false);

  useEffect(() => {
    // Setting the flag that the code is executed on client
    setIsClient(true);

    // Multiple checks for touch capability
    const hasTouchSupport = 
      'ontouchstart' in window ||                          // iOS, Android
      navigator.maxTouchPoints > 0 ||                      // Modern browsers
      (window.matchMedia && window.matchMedia('(pointer: coarse)').matches); // CSS media query

    setIsTouchDevice(hasTouchSupport);
  }, []);

  // Returning default values on server
  if (!isClient) {
    return {
      isTouchDevice: DEFAULT_IS_TOUCH_DEVICE,
    };
  }

  return {
    isTouchDevice,
  };
}
