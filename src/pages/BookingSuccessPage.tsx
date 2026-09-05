import EditableContent from '../components/EditableContent';
import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle } from 'lucide-react';

const BookingSuccessPage: React.FC = () => {
  const navigate = useNavigate();

  useEffect(() => {
    // Scroll to top when component mounts
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="px-4 pt-24 pb-8 md:min-h-screen md:pt-12 md:flex md:items-center md:justify-center" style={{ backgroundColor: '#171717' }}> 
      <div className="max-w-2xl w-full md:mx-auto">
        <div className="rounded-2xl shadow-2xl p-6 md:p-12 text-center border border-neutral-700" style={{ backgroundColor: '#262626' }}>
          {/* Success Icon */}
          <div className="flex justify-center mb-4 md:mb-6">
            <div className="bg-green-500/20 rounded-full p-3 md:p-4">
              <CheckCircle className="w-16 h-16 md:w-20 md:h-20 text-green-500" />
            </div>
          </div>

          {/* Main Heading */}
          <h1 className="text-2xl md:text-4xl font-bold text-white mb-3 md:mb-4">
            <EditableContent contentKey="booking-success-page-tak-for-din-booking" fallback="Tak for din booking!" />
          </h1>

          {/* Subheading */}
          <p className="text-base md:text-lg text-neutral-300 mb-6 md:mb-8">
            <EditableContent contentKey="booking-success-page-din-booking-er-modtaget-og" fallback="Din booking er modtaget, og vi har sendt en bekræftelse til din e-mail." />
          </p>

          {/* Information Box */}
          <div className="bg-neutral-900/50 rounded-lg p-4 md:p-6 mb-6 md:mb-8 text-left">
            <h2 className="text-lg md:text-xl font-semibold text-white mb-3 md:mb-4">
              <EditableContent contentKey="booking-success-page-hvad-sker-der-nu" fallback="Hvad sker der nu?" />
            </h2>
            <ul className="space-y-3 text-sm md:text-base text-neutral-300">
              <li className="flex items-start">
                <span className="text-green-500 mr-2 mt-1">✓</span>
                <span><EditableContent contentKey="booking-success-page-du-vil-modtage-en-bekraeftelsesmail" fallback="Du vil modtage en bekræftelsesmail med alle detaljer om din booking" /></span>
              </li>
            </ul>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 md:gap-4 justify-center">
            <button
              onClick={() => navigate('/')}
              className="px-6 md:px-8 py-3 bg-neutral-700 hover:bg-neutral-600 text-white rounded-lg font-medium transition-colors duration-200"
            >
              <EditableContent contentKey="booking-success-page-tilbage-til-forsiden" fallback="Tilbage til forsiden" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BookingSuccessPage;
