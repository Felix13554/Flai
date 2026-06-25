import React, { createContext, useContext, useState, useCallback } from 'react';

interface LoadingContextType {
  isPageLoading: boolean;
  setPageLoading: (loading: boolean) => void;
  loadingStates: Record<string, boolean>;
  setLoading: (key: string, loading: boolean) => void;
  isLoading: (key: string) => boolean;
  loadingProgress: number;
  setLoadingProgress: (progress: number) => void;
  loadingMessage: string;
  setLoadingMessage: (message: string) => void;
}

const LoadingContext = createContext<LoadingContextType | undefined>(undefined);

export const LoadingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isPageLoading, setIsPageLoading] = useState(false);
  const [loadingStates, setLoadingStates] = useState<Record<string, boolean>>({});
  const [loadingProgress, setLoadingProgressState] = useState(0);
  const [loadingMessage, setLoadingMessageState] = useState('');

  const setPageLoading = useCallback((loading: boolean) => {
    setIsPageLoading(loading);
  }, []);

  const setLoading = useCallback((key: string, loading: boolean) => {
    setLoadingStates(prev => ({
      ...prev,
      [key]: loading
    }));
  }, []);

  const isLoading = useCallback((key: string) => {
    return loadingStates[key] || false;
  }, [loadingStates]);

  const setLoadingProgress = useCallback((progress: number) => {
    setLoadingProgressState(progress);
  }, []);

  const setLoadingMessage = useCallback((message: string) => {
    setLoadingMessageState(message);
  }, []);

  return (
    <LoadingContext.Provider value={{
      isPageLoading,
      setPageLoading,
      loadingStates,
      setLoading,
      isLoading,
      loadingProgress,
      setLoadingProgress,
      loadingMessage,
      setLoadingMessage
    }}>
      {children}
    </LoadingContext.Provider>
  );
};

export const useLoading = () => {
  const context = useContext(LoadingContext);
  if (context === undefined) {
    throw new Error('useLoading must be used within a LoadingProvider');
  }
  return context;
};