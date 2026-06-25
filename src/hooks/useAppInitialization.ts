import { useEffect } from 'react';
import { useLoading } from '../contexts/LoadingContext';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';

export const useAppInitialization = () => {
  const { setLoadingProgress, setLoadingMessage } = useLoading();
  const { loading: authLoading } = useAuth();
  const { isDataLoaded, dataError } = useData();

  useEffect(() => {
    let progress = 0;
    let message = 'Starter applikation...';

    // Initial progress
    setLoadingProgress(5);

    // Check auth loading
    if (!authLoading) {
      progress = 10;
      setLoadingProgress(progress);
      setLoadingMessage(message);
    }
    // Data loading is handled by DataContext
    // We just need to wait for it to complete
    if (isDataLoaded) {
      if (dataError) {
        progress = 100;
        message = 'Fejl ved indlæsning af data';
        setLoadingProgress(progress);
        setLoadingMessage(message);
      } else {
        progress = 100;
        message = 'Klar!';
        setLoadingProgress(progress);
        setLoadingMessage(message);
      }
    }
  }, [authLoading, isDataLoaded, dataError, setLoadingProgress, setLoadingMessage]);

  return {
    hasError: dataError !== null
  };
};