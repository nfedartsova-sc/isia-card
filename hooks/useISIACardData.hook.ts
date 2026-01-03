import { useEffect, useState } from 'react';

import { ISIACardResponseData } from '@/api/isiaCardData/route';

export const ISIA_CARD_DATA_ENDPOINT = '/api/isiaCardData';

function useISIACardData() {
  const [cardData, setCardData] = useState<ISIACardResponseData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Create AbortController inside the effect
    const abortController = new AbortController();

    const fetchISIACardData = async () => {
      try {
        const response = await fetch(ISIA_CARD_DATA_ENDPOINT, { 
          signal: abortController.signal 
        });
        
        if (!response.ok) {
          setError(`Couldn't get your card data. Response status: ${response.status}`);
          return;
        }
        
        const result: ISIACardResponseData = await response.json();
        result.expirationDate = new Date(result.expirationDate);
        setCardData(result);

      } catch (error: any) {
        // Don't set error state if the fetch was aborted
        if (error.name !== 'AbortError') {
          setError(error.message);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchISIACardData();

    return () => {
      abortController.abort();
    };
  }, []);

  return {
    cardData,
    loading,
    error,
  };
}

export default useISIACardData;
