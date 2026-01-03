'use client'

import useNavigatorOnlineStatus from '@/hooks/useNavigatorOnlineStatus.hook';

const NavigatorOnlineStatus: React.FC = ({
}) => {
  const { online } = useNavigatorOnlineStatus();

  if (online) return null;

  return <div className="error">You're offline</div>;
}

export default NavigatorOnlineStatus;