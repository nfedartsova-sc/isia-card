// 'use client';

import ISIACard from '@/components/Card/index';

export default function Home() {
  // useEffect(() => {
  //   const handleMessage = (event) => {
  //     if (event.data && event.data.type === 'CACHES_CLEARED') {
  //       alert('All cached data has been cleared.');
  //       window.location.reload();
  //     }
  //   };  
  //   navigator.serviceWorker.addEventListener('message', handleMessage);
  //   return () => navigator.serviceWorker.removeEventListener('message', handleMessage);
  // }, []);

  return (
    <main className="w-full h-full">
      <ISIACard />
    </main>
  );
}
