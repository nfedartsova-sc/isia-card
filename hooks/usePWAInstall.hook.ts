import { useState, useEffect, useRef, useCallback } from 'react';

import useWindowEvent from './useWindowEvent.hook';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const STORAGE_KEY = 'pwa-installable';

export default function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null);

  // Handle beforeinstallprompt event (Chrome, Edge, etc.)
  const handler = (e: BeforeInstallPromptEvent) => {
    console.log('beforeinstallprompt event fired!', e);
    e.preventDefault();
    setDeferredPrompt(e);
    deferredPromptRef.current = e;
    setIsInstallable(true);
    sessionStorage.setItem(STORAGE_KEY, 'true');
  };

  // Set up event listener immediately
  useEffect(() => {
    console.log('Setting up beforeinstallprompt listener');
    
    // FIRST: Check if event was already captured globally (before React mounted)
    const globalEvent = (window as any).__pwaInstallPromptEvent;
    if (globalEvent) {
      console.log('Found globally captured beforeinstallprompt event!');
      setDeferredPrompt(globalEvent);
      deferredPromptRef.current = globalEvent;
      setIsInstallable(true);
      sessionStorage.setItem(STORAGE_KEY, 'true');
      // Clear it so we don't use it again
      (window as any).__pwaInstallPromptEvent = null;
    }
    
    // THEN: Set up listener for future events (e.g., if user dismisses and it fires again)
    window.addEventListener('beforeinstallprompt', handler as EventListener);
    
    // Check sessionStorage on mount
    const wasInstallable = sessionStorage.getItem(STORAGE_KEY) === 'true';
    console.log('Was installable before:', wasInstallable);
    
    // If we had installability before, wait for the event to fire
    // But don't set isInstallable optimistically - wait for actual event
    if (wasInstallable) {
      console.log('Waiting for beforeinstallprompt event to fire...');
      // Give it more time - sometimes the event fires after a delay
      const timeoutId = setTimeout(() => {
        // Check the ref, not the state (closure issue fix)
        if (!deferredPromptRef.current) {
          console.log('beforeinstallprompt did not fire - clearing installability flag');
          setIsInstallable(false);
          sessionStorage.removeItem(STORAGE_KEY);
        }
      }, 5000); // Increased to 5 seconds

      return () => {
        clearTimeout(timeoutId);
        window.removeEventListener('beforeinstallprompt', handler as EventListener);
      };
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handler as EventListener);
    };
  }, []);

  // Update isInstallable based on deferredPrompt
  useEffect(() => {
    if (deferredPrompt) {
      setIsInstallable(true);
      sessionStorage.setItem(STORAGE_KEY, 'true');
      console.log('deferredPrompt set, isInstallable = true');
    }
  }, [deferredPrompt]);

  const handleAppInstalled = () => {
    console.log('App installed');
    setIsInstalled(true);
    setIsInstallable(false);
    setDeferredPrompt(null);
    deferredPromptRef.current = null;
    sessionStorage.removeItem(STORAGE_KEY);
  };

  useWindowEvent('appinstalled', handleAppInstalled);

  useEffect(() => {
    // Check if already installed as standalone
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
      setIsInstallable(false);
      sessionStorage.removeItem(STORAGE_KEY);
      return;
    }

    // Check if installed via iOS "Add to Home Screen"
    if ((navigator as any).standalone === true) {
      setIsInstalled(true);
      setIsInstallable(false);
      sessionStorage.removeItem(STORAGE_KEY);
      return;
    }

    // For iOS Safari: check if it's iOS and show manual install option
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    
    if (isIOS && isSafari && !isInstalled) {
      // TODO:
      // iOS Safari doesn't fire beforeinstallprompt
      // You could set a flag here to show manual install instructions
      // setIsInstallable(true); // Uncomment if you want to show iOS instructions
    }
  }, [isInstalled]);


  const installPWA = useCallback(async (): Promise<boolean> => {
    // Use ref instead of state to avoid stale closure issues
    const prompt = deferredPromptRef.current;
    if (!prompt) {
      console.error('Installation not available: deferredPrompt is null');
      throw new Error('Installation not available');
    }

    try {
      await prompt.prompt();
      const { outcome } = await prompt.userChoice;
      
      if (outcome === 'accepted') {
        setDeferredPrompt(null);
        deferredPromptRef.current = null;
        setIsInstallable(false);
        sessionStorage.removeItem(STORAGE_KEY);
        return true;
      }
      // If dismissed, remove from storage so it doesn't show again
      if (outcome === 'dismissed') {
        sessionStorage.removeItem(STORAGE_KEY);
      }
      return false;
      
    } catch (error: any) {
      console.error('Error installing PWA:', error);
      // Clear the prompt if it's invalid
      setDeferredPrompt(null);
      deferredPromptRef.current = null;
      setIsInstallable(false);
      sessionStorage.removeItem(STORAGE_KEY);
      throw new Error(`Error installing application: ${error.message}`);
    }
  }, []); // Empty deps since we use ref which doesn't need to be in deps

  return {
    isInstallable,
    isInstalled,
    installPWA,
    deferredPrompt, // Expose if needed for debugging
  };
}
