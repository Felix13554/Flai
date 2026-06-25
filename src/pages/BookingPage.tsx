import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { CheckCircle, AlertTriangle } from 'lucide-react';
import { supabase } from '../utils/supabase';
import { Product, TimeSlot } from '../types';
import { useAuth } from '../contexts/AuthContext';
import TimeSlotPicker from '../components/TimeSlotPicker';
import EditableContent from '../components/EditableContent';
import GoogleLoginButton from '../components/GoogleLoginButton';
import PanoramaViewer from '../components/PanoramaViewer';
import { isAddressWithinRange, getFormattedDistance } from '../utils/location';
import toast from 'react-hot-toast';

// Resolve a YouTube video ID from either:
//   - the "youtube:<videoId>" prefix format used by the portfolio, OR
//   - any common full YouTube URL (youtu.be/…, youtube.com/watch?v=…, /embed/…, /shorts/…)
// Returns null if the string is not a YouTube reference.
const getYouTubeId = (url: string): string | null => {
  // Portfolio-style prefix: "youtube:<videoId>"
  if (url.startsWith('youtube:')) return url.split(':')[1] || null;

  // Full URL formats
  try {
    const u = new URL(url);
    if (u.hostname === 'youtu.be') return u.pathname.slice(1).split('?')[0] || null;
    if (u.hostname.includes('youtube.com')) {
      const v = u.searchParams.get('v');
      if (v) return v;
      const parts = u.pathname.split('/').filter(Boolean);
      if (['embed', 'shorts', 'v'].includes(parts[0])) return parts[1] || null;
    }
  } catch {
    // not a valid URL – fall through
  }
  return null;
};

const isYouTubeUrl = (url: string) => getYouTubeId(url) !== null;

const BookingPage: React.FC = () => {
  const { productId } = useParams<{ productId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<TimeSlot | null>(null);
  const [address, setAddress] = useState('');
  const [includeEditing, setIncludeEditing] = useState(false);
  const [totalPrice, setTotalPrice] = useState(0);
  const [isAddressValid, setIsAddressValid] = useState<boolean>(true);
  const [distance, setDistance] = useState<string>('');
  const [isValidatingAddress, setIsValidatingAddress] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [guestEmail, setGuestEmail] = useState('');
  const [guestName, setGuestName] = useState('');
  const [guestEmailError, setGuestEmailError] = useState('');
  const [guestNameError, setGuestNameError] = useState('');
  const [userName, setUserName] = useState('');
  const [userNameError, setUserNameError] = useState('');
  const [needsUserName, setNeedsUserName] = useState(false);

  // Restore booking state after Google OAuth redirect
  useEffect(() => {
    const restoreBookingState = () => {
      const savedState = sessionStorage.getItem('bookingState');
      if (savedState) {
        try {
          const state = JSON.parse(savedState);
          if (state.selectedTimeSlot) {
            setSelectedTimeSlot(state.selectedTimeSlot);
          }
          if (state.address) {
            setAddress(state.address);
          }
          if (state.includeEditing !== undefined) {
            setIncludeEditing(state.includeEditing);
          }
          // Clear the saved state after restoration
          sessionStorage.removeItem('bookingState');
          toast.success('Velkommen tilbage! Din booking er gendannet.');
        } catch (error) {
          console.error('Error restoring booking state:', error);
        }
      }
    };

    if (user) {
      restoreBookingState();
    }
  }, [user]);

  // Check if logged-in user has a name in auth metadata
  useEffect(() => {
    const checkUserName = async () => {
      if (user) {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        
        const fullName = authUser?.user_metadata?.full_name || 
                        authUser?.user_metadata?.name || 
                        '';
        
        if (fullName) {
          setUserName(fullName);
          setNeedsUserName(false);
        } else {
          setNeedsUserName(true);
        }
      }
    };

    checkUserName();
  }, [user]);

  useEffect(() => {
    const fetchProduct = async () => {
      if (!productId) return;

      try {
        const { data, error } = await supabase
          .from('products')
          .select('*')
          .eq('id', productId)
          .single();

        if (error) throw error;

        setProduct(data);
        setTotalPrice(data.price);
      } catch (error) {
        console.error('Error fetching product:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchProduct();
  }, [productId]);

  // Recalculate total price:
  // - If editing is included in the product, no extra charge ever
  // - If editing is NOT included but user opts in, add 100 kr
  useEffect(() => {
    if (product) {
      const editingCost = (product.category === 'video' && !product.is_editing_included && includeEditing) ? 100 : 0;
      setTotalPrice(product.price + editingCost);
    }
  }, [product, includeEditing]);

  // Auto-enable editing toggle if product includes it (for UI clarity), but no charge added
  useEffect(() => {
    if (product?.is_editing_included) {
      setIncludeEditing(true);
    }
  }, [product]);

  const validateAddress = async (address: string) => {
    if (!address.trim()) {
      setIsAddressValid(true);
      setDistance('');
      return true;
    }

    setIsValidatingAddress(true);
    try {
      const isValid = await isAddressWithinRange(address);
      setIsAddressValid(isValid);
      
      if (!isValid) {
        const dist = await getFormattedDistance(address);
        setDistance(dist);
        return false;
      } else {
        setDistance('');
        return true;
      }
    } catch (error) {
      console.error('Error validating address:', error);
      return false;
    } finally {
      setIsValidatingAddress(false);
    }
  };

  const handleAddressChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newAddress = e.target.value;
    setAddress(newAddress);
    if (!isAddressValid) {
      setIsAddressValid(true);
      setDistance('');
    }
  };

  const handleSelectTimeSlot = (slot: TimeSlot) => {
    setSelectedTimeSlot(slot);
  };

  const validateEmail = (email: string): boolean => {
    if (!email) return false;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleGuestEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const email = e.target.value;
    setGuestEmail(email);
    if (email && !validateEmail(email)) {
      setGuestEmailError('Indtast venligst en gyldig email-adresse');
    } else {
      setGuestEmailError('');
    }
  };

  const handleGuestNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const name = e.target.value;
    setGuestName(name);
    if (!name.trim()) {
      setGuestNameError('Indtast venligst dit navn');
    } else {
      setGuestNameError('');
    }
  };

  const handleUserNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const name = e.target.value;
    setUserName(name);
    if (!name.trim()) {
      setUserNameError('Indtast venligst dit navn');
    } else {
      setUserNameError('');
    }
  };

  const updateUserNameInAuth = async (name: string) => {
    try {
      const { error } = await supabase.auth.updateUser({
        data: { full_name: name }
      });

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error updating user name:', error);
      return false;
    }
  };

  const handleContinue = async () => {
    if (isProcessing) return;

    if (!selectedTimeSlot) {
      toast.error('Vælg venligst dato og tidspunkt');
      return;
    }

    if (!address.trim()) {
      toast.error('Indtast venligst en adresse');
      return;
    }

    if (!user) {
      if (!guestEmail) {
        toast.error('Indtast venligst din email');
        return;
      }

      if (!validateEmail(guestEmail)) {
        toast.error('Indtast venligst en gyldig email-adresse');
        return;
      }

      if (!guestName.trim()) {
        toast.error('Indtast venligst dit navn');
        return;
      }
    }

    if (user && needsUserName && !userName.trim()) {
      toast.error('Indtast venligst dit navn');
      return;
    }

    if (!product) {
      toast.error('Produktet blev ikke fundet');
      return;
    }

    setIsProcessing(true);

    try {
      if (user && needsUserName && userName.trim()) {
        const updated = await updateUserNameInAuth(userName);
        if (!updated) {
          toast.error('Kunne ikke gemme dit navn. Prøv venligst igen.');
          setIsProcessing(false);
          return;
        }
      }

      const isValid = await validateAddress(address);
      if (!isValid) {
        toast.error('Adressen er uden for vores dækningsområde');
        setIsProcessing(false);
        return;
      }

      // Only charge for editing if video category AND NOT included in product AND user opted in
      const editingCost = (product.category === 'video' && !product.is_editing_included && includeEditing) ? 100 : 0;
      const calculatedTotalPrice = product.price + editingCost;

      navigate('/payment', {
        state: {
          productId: product.id,
          productName: product.name,
          productPrice: product.price,
          bookingDate: selectedTimeSlot.date,
          bookingTime: selectedTimeSlot.time,
          address,
          includeEditing,
          isEditingIncluded: product.is_editing_included ?? false,
          totalPrice: calculatedTotalPrice,
          guestEmail: !user ? guestEmail : undefined,
          guestName: !user ? guestName : userName
        }
      });
    } catch (error) {
      console.error('Error processing booking:', error);
      toast.error('Der opstod en fejl. Prøv venligst igen.');
      setIsProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="pt-24 pb-16 container">
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-neutral-300"></div>
          <EditableContent
            contentKey="booking-loading-text"
            as="p"
            className="mt-2"
            fallback="Indlæser produkt..."
          />
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="pt-24 pb-16 container">
        <div className="text-center py-12 text-error">
          <EditableContent
            contentKey="booking-product-not-found"
            as="p"
            fallback="Produktet blev ikke fundet. Gå tilbage til produktsiden og prøv igen."
          />
          <button 
            onClick={() => navigate('/products')}
            className="btn-primary mt-4"
          >
            <EditableContent
              contentKey="booking-back-to-products-button"
              fallback="Tilbage til Produkter"
            />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="pt-24 pb-16">
      <div className="container">
        <div className="max-w-3xl mx-auto">
          <EditableContent
            contentKey="booking-page-title"
            as="h1"
            className="text-3xl font-bold mb-8"
            fallback="Book Din Droneoptagelse"
          />
          
          <div className="bg-neutral-800 rounded-xl shadow-md p-6 mb-8 border border-neutral-700">
            <EditableContent
              contentKey="booking-product-info-title"
              as="h2"
              className="text-xl font-semibold mb-4"
              fallback="Produkt Information"
            />
            <div className="flex flex-col md:flex-row">
              <div className="md:w-1/3 mb-4 md:mb-0">
                {product.images[0] && isYouTubeUrl(product.images[0]) ? (
                  <div className="relative w-full pt-[56.25%]">
                    <iframe
                      className="absolute inset-0 w-full h-full rounded-lg"
                      src={`https://www.youtube.com/embed/${getYouTubeId(product.images[0])}`}
                      title={product.name}
                      frameBorder="0"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      referrerPolicy="strict-origin-when-cross-origin"
                      allowFullScreen
                    />
                  </div>
                ) : product.images[0]?.startsWith('panorama:') ? (
                  <div className="relative w-full pt-[56.25%] rounded-lg overflow-hidden">
                    <div className="absolute inset-0">
                      <PanoramaViewer
                        url={product.images[0].replace('panorama:', '')}
                        title={product.name}
                        autoRotate={0.5}
                        className="w-full h-full"
                      />
                    </div>
                    <div className="absolute top-2 left-2 z-20 flex items-center gap-1 bg-black/60 backdrop-blur-sm rounded-full px-2 py-0.5 pointer-events-none">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2"><circle cx="12" cy="12" r="10"/><ellipse cx="12" cy="12" rx="5" ry="10"/><path d="M2 12h20"/></svg>
                      <span className="text-white text-[0.6rem] font-bold tracking-wider">360°</span>
                    </div>
                  </div>
                ) : (
                  <img
                    src={product.images[0]}
                    alt={product.name}
                    className="w-full h-32 object-cover rounded-lg"
                  />
                )}
              </div>
              <div className="md:w-2/3 md:pl-6">
                <h3 className="text-lg font-medium">{product.name}</h3>
                <p className="text-neutral-300 mt-2">{product.description}</p>
                <p className="text-neutral-300 font-semibold mt-3">{product.price} <EditableContent contentKey="booking-page-kr-3" fallback="kr" /></p>
              </div>
            </div>
          </div>

          {/* Personal Information Section */}
          <div className="bg-neutral-800 rounded-xl shadow-md p-6 mb-8 border border-neutral-700">
            <EditableContent
              contentKey="booking-personal-info-title"
              as="h2"
              className="text-xl font-semibold mb-4"
              fallback="Dine Oplysninger"
            />
            
            {!user ? (
              <>
                <EditableContent
                  contentKey="booking-guest-info-description"
                  as="p"
                  className="text-neutral-300 mb-4"
                  fallback="Udfyld dine oplysninger for at fortsætte, eller log ind med Google for at udfylde automatisk."
                />
                
                <div className="mb-6">
                  <GoogleLoginButton
                    buttonText="Udfyld med Google"
                    redirectTo={`${window.location.origin}/booking/${productId}`}
                    bookingState={{
                      productId,
                      selectedTimeSlot,
                      address,
                      includeEditing,
                      totalPrice
                    }}
                  />
                </div>

                <div className="relative mb-6">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-neutral-700"></div>
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-2 bg-neutral-800 text-neutral-400"><EditableContent contentKey="booking-page-eller-udfyld-manuelt" fallback="eller udfyld manuelt" /></span>
                  </div>
                </div>

                <div className="mb-4">
                  <label htmlFor="guestName" className="block text-sm font-medium text-neutral-300 mb-2">
                    <EditableContent
                      contentKey="booking-guest-name-label"
                      fallback="Fulde navn *"
                    />
                  </label>
                  <input
                    type="text"
                    id="guestName"
                    value={guestName}
                    onChange={handleGuestNameChange}
                    onBlur={() => {
                      if (!guestName.trim()) {
                        setGuestNameError('Indtast venligst dit navn');
                      }
                    }}
                    placeholder="John Doe"
                    className={`w-full px-4 py-2 bg-neutral-700 border rounded-lg text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary transition-all ${
                      guestNameError ? 'border-red-500' : 'border-neutral-600'
                    }`}
                  />
                  {guestNameError && (
                    <p className="text-red-500 text-sm mt-2">{guestNameError}</p>
                  )}
                </div>

                <div className="mb-4">
                  <label htmlFor="guestEmail" className="block text-sm font-medium text-neutral-300 mb-2">
                    <EditableContent
                      contentKey="booking-guest-email-label"
                      fallback="Email-adresse *"
                    />
                  </label>
                  <input
                    type="email"
                    id="guestEmail"
                    value={guestEmail}
                    onChange={handleGuestEmailChange}
                    onBlur={() => {
                      if (guestEmail && !validateEmail(guestEmail)) {
                        setGuestEmailError('Indtast venligst en gyldig email-adresse');
                      }
                    }}
                    placeholder="din@email.dk"
                    className={`w-full px-4 py-2 bg-neutral-700 border rounded-lg text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary transition-all ${
                      guestEmailError ? 'border-red-500' : 'border-neutral-600'
                    }`}
                  />
                  {guestEmailError && (
                    <p className="text-red-500 text-sm mt-2">{guestEmailError}</p>
                  )}
                  <EditableContent
                    contentKey="booking-email-description"
                    as="p"
                    className="text-neutral-400 text-sm mt-2"
                    fallback="Vi sender bekræftelsen og detaljer om din booking til denne email-adresse."
                  />
                </div>
              </>
            ) : needsUserName ? (
              <>
                <EditableContent
                  contentKey="booking-user-name-description"
                  as="p"
                  className="text-neutral-300 mb-4"
                  fallback="Vi har brug for dit navn for at kunne gennemføre bookingen."
                />
                
                <div className="mb-4">
                  <label htmlFor="userName" className="block text-sm font-medium text-neutral-300 mb-2">
                    <EditableContent
                      contentKey="booking-user-name-label"
                      fallback="Fulde navn *"
                    />
                  </label>
                  <input
                    type="text"
                    id="userName"
                    value={userName}
                    onChange={handleUserNameChange}
                    onBlur={() => {
                      if (!userName.trim()) {
                        setUserNameError('Indtast venligst dit navn');
                      }
                    }}
                    placeholder="John Doe"
                    className={`w-full px-4 py-2 bg-neutral-700 border rounded-lg text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary transition-all ${
                      userNameError ? 'border-red-500' : 'border-neutral-600'
                    }`}
                  />
                  {userNameError && (
                    <p className="text-red-500 text-sm mt-2">{userNameError}</p>
                  )}
                </div>
              </>
            ) : (
              <div className="flex items-center space-x-3 p-4 border border-green-500/20 rounded-lg bg-green-500/10">
                <CheckCircle size={20} className="text-green-400" />
                <div>
                  <p className="text-white font-medium">{userName}</p>
                  <p className="text-neutral-300 text-sm">{user.email}</p>
                </div>
              </div>
            )}
          </div>

          <div className="bg-neutral-800 rounded-xl shadow-md p-6 mb-8 border border-neutral-700">
            <EditableContent
              contentKey="booking-time-selection-title"
              as="h2"
              className="text-xl font-semibold mb-4"
              fallback="Vælg Dato og Tid"
            />
            
            <TimeSlotPicker 
              onSelectTimeSlot={handleSelectTimeSlot}
              selectedSlot={selectedTimeSlot}
            />
          </div>
          
          <div className="bg-neutral-800 rounded-xl shadow-md p-6 mb-8 border border-neutral-700">
            <EditableContent
              contentKey="booking-address-title"
              as="h2"
              className="text-xl font-semibold mb-4"
              fallback="Adresse"
            />
            <EditableContent
              contentKey="booking-address-description"
              as="p"
              className="text-neutral-300 mb-4"
              fallback="Indtast adressen hvor droneoptagelsen skal finde sted."
            />
            
            <div>
              <EditableContent
                contentKey="booking-address-label"
                as="label"
                className="form-label"
                fallback="Fuld adresse"
              />
              <textarea 
                id="address" 
                rows={3} 
                className={`form-input resize-none ${!isAddressValid ? 'border-red-500' : ''}`}
                placeholder="Gade, husnummer, postnummer, by"
                value={address}
                onChange={handleAddressChange}
                onBlur={() => {
                  if (address.trim()) {
                    validateAddress(address);
                  }
                }}
                required
              ></textarea>
              
              {!isAddressValid && address && (
                <div className="mt-2 text-red-500 flex items-start">
                  <AlertTriangle size={16} className="mr-2 mt-1 flex-shrink-0" />
                  <span>
                    <EditableContent contentKey="booking-page-denne-adresse-er" fallback="Denne adresse er" /> {distance} <EditableContent contentKey="booking-page-fra-vores-base-og-er" fallback="fra vores base og er uden for vores dækningsområde." />
                  </span>
                </div>
              )}
            </div>
          </div>
          
          {product.category === 'video' && (
          <div className="bg-neutral-800 rounded-xl shadow-md p-6 mb-8 border border-neutral-700">
            <EditableContent
              contentKey="booking-extras-title"
              as="h2"
              className="text-xl font-semibold mb-4"
              fallback="Tilvalg"
            />
            
            {product.is_editing_included ? (
              <div className="flex items-start space-x-3 p-4 border border-green-500/20 rounded-lg bg-green-500/10">
                <svg className="w-6 h-6 text-green-400 mt-1" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <div>
                  <EditableContent
                    contentKey="booking-editing-included-title"
                    as="h3"
                    className="font-medium text-green-400"
                    fallback="Redigering inkluderet"
                  />
                  <EditableContent
                    contentKey="booking-editing-included-description"
                    as="p"
                    className="text-neutral-300 mt-1"
                    fallback="Dette produkt inkluderer redigering som farvekorrigering, klipning, baggrundsmusik og lydeffekter."
                  />
                </div>
              </div>
            ) : (
              <div className="flex items-start space-x-3 p-4 border border-neutral-700 rounded-lg bg-neutral-800/50">
                <input 
                  type="checkbox" 
                  id="editing" 
                  className="mt-1"
                  checked={includeEditing}
                  onChange={(e) => setIncludeEditing(e.target.checked)}
                />
                <div>
                  <EditableContent
                    contentKey="booking-editing-option-title"
                    as="label"
                    className="font-medium cursor-pointer text-white"
                    fallback="Redigering af optagelser"
                  />
                  <EditableContent
                    contentKey="booking-editing-option-description"
                    as="p"
                    className="text-neutral-300 mt-1"
                    fallback="Få redigering af dine optagelser, herunder klipning, effekter, lydeffekter og baggrundsmusik."
                  />
                  <EditableContent
                    contentKey="booking-editing-option-price"
                    as="p"
                    className="text-neutral-300 font-semibold mt-2"
                    fallback="+100 kr"
                  />
                </div>
              </div>
            )}
          </div>
          )}
          
          <div className="bg-neutral-800 rounded-xl shadow-md p-6 mb-8 border border-neutral-700">
            <EditableContent
              contentKey="booking-summary-title"
              as="h2"
              className="text-xl font-semibold mb-4"
              fallback="Opsummering"
            />
            
            <div className="space-y-4 mb-6">
              <div className="flex justify-between">
                <EditableContent
                  contentKey="booking-summary-product-label"
                  as="span"
                  className="text-neutral-300"
                  fallback="Produkt"
                />
                <span className="text-white">{product.name}</span>
              </div>
              
              {selectedTimeSlot && (
                <>
                  <div className="flex justify-between">
                    <EditableContent
                      contentKey="booking-summary-date-label"
                      as="span"
                      className="text-neutral-300"
                      fallback="Dato"
                    />
                    <span className="text-white">{new Date(selectedTimeSlot.date).toLocaleDateString('da-DK', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
                  </div>
                  <div className="flex justify-between">
                    <EditableContent
                      contentKey="booking-summary-time-label"
                      as="span"
                      className="text-neutral-300"
                      fallback="Tidspunkt"
                    />
                    <span className="text-white">{selectedTimeSlot.time}</span>
                  </div>
                </>
              )}

              <div className="flex justify-between">
                <EditableContent
                  contentKey="booking-summary-base-price-label"
                  as="span"
                  className="text-neutral-300"
                  fallback="Basis pris"
                />
                <span className="text-white">{product.price} <EditableContent contentKey="booking-page-kr-2" fallback="kr" /></span>
              </div>

              {/* Only show editing line item if video category AND NOT included in product AND user opted in */}
              {product.category === 'video' && !product.is_editing_included && includeEditing && (
                <div className="flex justify-between">
                  <EditableContent
                    contentKey="booking-summary-editing-label"
                    as="span"
                    className="text-neutral-300"
                    fallback="Redigering"
                  />
                  <span className="text-white"><EditableContent contentKey="booking-page-100-kr" fallback="+100 kr" /></span>
                </div>
              )}

              {/* Show editing included badge if video category AND product includes it */}
              {product.category === 'video' && product.is_editing_included && (
                <div className="flex justify-between">
                  <EditableContent
                    contentKey="booking-summary-editing-label"
                    as="span"
                    className="text-neutral-300"
                    fallback="Redigering"
                  />
                  <span className="text-green-400">
                    <EditableContent
                      contentKey="booking-summary-editing-included"
                      fallback="Inkluderet"
                    />
                  </span>
                </div>
              )}
            </div>
            
            <div className="border-t border-neutral-700 pt-4">
              <div className="flex justify-between items-center">
                <EditableContent
                  contentKey="booking-summary-total-label"
                  as="span"
                  className="font-semibold text-white"
                  fallback="Total"
                />
                <span className="text-xl font-bold text-white">{totalPrice} <EditableContent contentKey="booking-page-kr" fallback="kr" /></span>
              </div>
            </div>
          </div>
          
          <div className="flex justify-between">
            <button 
              onClick={() => navigate('/products')}
              className="btn-secondary"
              disabled={isProcessing}
            >
              <EditableContent
                contentKey="booking-back-button"
                fallback="Tilbage"
              />
            </button>
            
            <button
              onClick={handleContinue}
              className="btn-primary flex items-center"
              disabled={isProcessing}
            >
              {isProcessing ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                  <EditableContent
                    contentKey="booking-processing-text"
                    fallback="Behandler..."
                  />
                </>
              ) : (
                <EditableContent
                  contentKey="booking-continue-button"
                  fallback="Fortsæt til Betaling"
                />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BookingPage;
