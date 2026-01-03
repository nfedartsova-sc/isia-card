import { useEffect, useRef, useState } from 'react';
// import { appConfig } from '../../config/app-config';

function useCountryFlag(countryCode?: string | null) {
  const [imageURL, setImageURL] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Keep track of the current imageURL for cleanup
  const imageURLRef = useRef<string | null>(null);

  useEffect(() => {
    if (!countryCode) {
      setLoading(false);
      return;
    }

    // Create a NEW AbortController for each effect run
    const abortController = new AbortController();
    
    setLoading(true);
    setError(null);

    const fetchCountryFlag = async () => {
      try {
        const response = await fetch(
          //`${appConfig.isiaDBUrl}/api/association/${countryCode}/flag`,
          '/api/flag',
          { signal: abortController.signal }
        );

        if (!response.ok) {
          setError(`Couldn't get country flag image. Response status: ${response.status}`);
          return;
        }
        const blob = await response.blob();
        const newImageUrl = URL.createObjectURL(blob);
        
        // Revoke old URL before setting new one
        if (imageURLRef.current) {
          URL.revokeObjectURL(imageURLRef.current);
        }
        
        imageURLRef.current = newImageUrl;
        setImageURL(newImageUrl);

      } catch (error: any) {
        // Don't set error state if the fetch was aborted
        if (error.name !== 'AbortError') {
          setError(error.message);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchCountryFlag();

    // Cleanup function
    return () => {
      abortController.abort();
      // Cleanup object URL on unmount or when countryCode changes
      if (imageURLRef.current) {
        URL.revokeObjectURL(imageURLRef.current);
        imageURLRef.current = null;
      }
    };
  }, [countryCode]);

  return {
    imageURL,
    loading,
    error,
  };
}

export default useCountryFlag;
