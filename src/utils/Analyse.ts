import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import Clarity from '@microsoft/clarity';

// Define types for TypeScript
declare global {
  interface Window {
    dataLayer: any[];
    gtag: (...args: any[]) => void;
  }
}

const GA_ID = 'G-0LVVX00CBB';

const Analyse = () => {
  const location = useLocation();

  useEffect(() => {
    // 1. Initialize Microsoft Clarity
    Clarity.init('vldm4dwlmk');

    // 2. Initialize Google Tag (gtag.js)
    if (!document.getElementById('google-tag')) {
      const script = document.createElement('script');
      script.id = 'google-tag';
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
      document.head.appendChild(script);

      window.dataLayer = window.dataLayer || [];
      window.gtag = function () {
        window.dataLayer.push(arguments);
      };

      window.gtag('js', new Date());
      window.gtag('config', GA_ID);
    }
  }, []);

  // 3. Track Page Views on route change
  useEffect(() => {
    if (window.gtag) {
      window.gtag('config', GA_ID, {
        page_path: location.pathname,
      });
    }
  }, [location]);

  return null; // This component doesn't render anything
};

export default Analyse;