import { useEffect, useRef, useState } from 'react';

function useNationalSign() {
  const [imageURL, setImageURL] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Ref to track imageURL for cleanup (avoids stale closure)
  const imageURLRef = useRef<string | null>(null);

  useEffect(() => {
    // Create AbortController inside the effect
    const abortController = new AbortController();

    const fetchNationalSign = async () => {
      try {
        const response = await fetch('/api/nationalSign', { 
          signal: abortController.signal 
        });
        
        if (!response.ok) {
          setError(`Couldn't get national sign image. Response status: ${response.status}`);
          return;
        }
        
        const blob = await response.blob();
        const newImageUrl = URL.createObjectURL(blob);
        
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

    fetchNationalSign();

    return () => {
      abortController.abort();
      // Cleanup object URL on unmount
      if (imageURLRef.current) {
        URL.revokeObjectURL(imageURLRef.current);
        imageURLRef.current = null;
      }
    };
  }, []);

  return {
    imageURL,
    loading,
    error,
  };
}

export default useNationalSign;
