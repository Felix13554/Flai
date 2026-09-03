import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import EditableContent from './EditableContent';
import { useData } from '../contexts/DataContext';

const Testimonials: React.FC = () => {
  const navigate = useNavigate();
  const { ratings } = useData();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeHeight, setIframeHeight] = useState(800);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data && typeof event.data.height === 'number') {
        setIframeHeight(event.data.height + 20);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  return (
    <section className="py-20 bg-neutral-800">
      <div className="container">
        <EditableContent
          contentKey="testimonials-title"
          as="h2"
          className="text-3xl font-bold text-center mb-12 text-white"
          fallback="Hvad siger vores kunder?"
        />
        <div className="mb-16 px-4 sm:px-0 flex justify-center">
          <div className="w-full sm:w-[90%] md:w-full">
            <iframe
              ref={iframeRef}
              src="/review-4.html"
              className="w-full transition-all duration-300"
              style={{
                height: `${iframeHeight}px`,
                border: 'none',
                background: 'transparent',
                overflow: 'hidden'
              }}
              title="Google Anmeldelser"
              scrolling="no"
            />
          </div>
        </div>
        <div className="text-center">
          <button
            onClick={() => navigate('/ratings')}
            className="btn-primary"
          >
            <EditableContent
              contentKey="testimonials-button"
              fallback="Se Alle Anmeldelser"
            />
          </button>
        </div>
      </div>
    </section>
  );
};

export default Testimonials;
