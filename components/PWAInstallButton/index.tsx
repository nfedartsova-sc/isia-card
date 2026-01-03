'use client'

import { useCallback, useState } from 'react';

import Prompt from '../Prompt/index';
import usePWAInstall from '@/hooks/usePWAInstall.hook';
import useNavigatorOnlineStatus from '@/hooks/useNavigatorOnlineStatus.hook';

interface PWAInstallButtonProps {
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  className = '',
  style = {},
  children,
}) => {
  const { isInstallable, isInstalled, installPWA, deferredPrompt } = usePWAInstall();
  const [showInstallPWAPrompt, setShowInstallPWAPrompt] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);

  const { online } = useNavigatorOnlineStatus();

  const handleShowInstallPWAPrompt = useCallback(() => {
    setInstallError(null);
    setShowInstallPWAPrompt(true);
  }, []);

  const handleInstall = useCallback(async () => {
    setShowInstallPWAPrompt(false);
    try {
      await installPWA();
    } catch (error: any) {
      setInstallError(error.message);
    }
  }, []);

  const handleDismiss = useCallback(() => {
    setShowInstallPWAPrompt(false);
  }, []);

  // Only show button if we have both isInstallable AND deferredPrompt
  // This ensures the install will work when clicked
  if (isInstalled || !isInstallable || !deferredPrompt || !online) {
    return null;
  }

  return (
    <div>
      <Prompt
        show={showInstallPWAPrompt}
        title="Install the app?"
        explanation="Install our app for better user experience"
        agreeButtonTitle="Install"
        dismissButtonTitle="Later"
        onAgree={handleInstall}
        onDismiss={handleDismiss}
      />
      <button
        onClick={handleShowInstallPWAPrompt}
        className={className}
        style={style}
        aria-label="Install application"
      >
        {children || 'Install'}
      </button>
      {installError && <p className="text-red-600">{installError}</p>}
    </div>
  );
}

export default PWAInstallButton;
