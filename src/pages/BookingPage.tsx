import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AlertTriangle, CreditCard, Banknote, Coins } from 'lucide-react';
import { supabase } from '../utils/supabase';
import { Product, TimeSlot } from '../types';
import { useAuth } from '../contexts/AuthContext';
import TimeSlotPicker from '../components/TimeSlotPicker';
import EditableContent from '../components/EditableContent';
import GoogleLoginButton from '../components/GoogleLoginButton';
import StripePaymentForm from '../components/StripePaymentForm';
import { useBookings } from '../hooks/useBookings';
import { checkSlotAvailability } from '../utils/booking';
import { isAddressWithinRange, getFormattedDistance } from '../utils/location';
import { loadStripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';
import toast from 'react-hot-toast';

// Initialize Stripe (module-level singleton, same pattern as before)
let stripePromise: Promise<any> | null = null;

const initializeStripe = async () => {
  if (stripePromise) return stripePromise;
  try {
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-stripe-config`,
      { headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` } }
    );
    const data = await response.json();
    if (data.error) { console.error('Failed to get Stripe config:', data.error); return null; }
    stripePromise = loadStripe(data.publishableKey);
    return stripePromise;
  } catch (error) {
    console.error('Error initializing Stripe:', error);
    return null;
  }
};

const BookingPage: React.FC = () => {
  const { productId } = useParams<{ productId: string }>();
  const navigate = useNavigate();
  const { user, credits, refreshCredits } = useAuth();
  const { createBooking } = useBookings(user?.id);

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<TimeSlot | null>(null);
  const [address, setAddress] = useState('');
  const [includeEditing, setIncludeEditing] = useState(false);
  const [totalPrice, setTotalPrice] = useState(0);
  const [isAddressValid, setIsAddressValid] = useState<boolean>(true);
  const [distance, setDistance] = useState<string>('');
  const [isValidatingAddress, setIsValidatingAddress] = useState(false);
  const [guestEmail, setGuestEmail] = useState('');
  const [guestName, setGuestName] = useState('');
  const [guestEmailError, setGuestEmailError] = useState('');
  const [guestNameError, setGuestNameError] = useState('');
  const [userName, setUserName] = useState('');
  const [userNameError, setUserNameError] = useState('');
  const [needsUserName, setNeedsUserName] = useState(false);

  // ---- Payment section state (merged from former PaymentPage) ----
  const [finalBookingDetails, setFinalBookingDetails] = useState<{
    bookingDate: string;
    bookingTime: string;
    address: string;
    includeEditing: boolean;
    isEditingIncluded: boolean;
    totalPrice: number;
    guestEmail?: string;
    guestName?: string;
  } | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'pay_now' | 'pay_later' | 'cash' | 'credits'>('pay_now');
  const [creditUsageOption, setCreditUsageOption] = useState<'none' | 'all' | 'custom'>('none');
  const [customCreditsToUseInput, setCustomCreditsToUseInput] = useState<string>('');
  const [creditsToUse, setCreditsToUse] = useState(0);
  const [payLoading, setPayLoading] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [stripeReady, setStripeReady] = useState(false);
  const [customerName, setCustomerName] = useState('');

  const priceAfterDiscount = finalBookingDetails?.totalPrice || 0;
  const finalPrice = Math.max(0, priceAfterDiscount - creditsToUse);
  const canPayWithCreditsOnly = creditsToUse >= priceAfterDiscount && priceAfterDiscount > 0;

  useEffect(() => {
    const setup = async () => {
      const promise = await initializeStripe();
      setStripeReady(!!promise);
    };
    setup();
  }, []);

  useEffect(() => {
    if (finalBookingDetails?.guestName) {
      setCustomerName(finalBookingDetails.guestName);
    } else if (user) {
      (async () => {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        const fullName = authUser?.user_metadata?.full_name || authUser?.user_metadata?.name || '';
        setCustomerName(fullName);
      })();
    }
  }, [user, finalBookingDetails]);

  useEffect(() => {
    if (creditUsageOption === 'none') {
      setCreditsToUse(0);
      if (paymentMethod === 'credits') setPaymentMethod('pay_now');
    } else if (creditUsageOption === 'all') {
      const max = Math.min(credits, priceAfterDiscount);
      setCreditsToUse(max);
      if (max >= priceAfterDiscount) setPaymentMethod('credits');
    } else if (creditUsageOption === 'custom') {
      const custom = parseInt(customCreditsToUseInput) || 0;
      const max = Math.min(credits, custom, priceAfterDiscount);
      setCreditsToUse(max);
      if (max >= priceAfterDiscount) setPaymentMethod('credits');
      else if (paymentMethod === 'credits') setPaymentMethod('pay_now');
    }
  }, [creditUsageOption, customCreditsToUseInput, credits, priceAfterDiscount, paymentMethod]);

  useEffect(() => {
    if (!stripeReady && paymentMethod === 'pay_now') {
      setPayError('Betalingssystem indlæses...');
    } else {
      setPayError(null);
    }
  }, [paymentMethod, stripeReady]);

  useEffect(() => {
    if (finalPrice === 0 && paymentMethod === 'pay_now') {
      setPaymentMethod('credits');
    }
  }, [finalPrice, paymentMethod]);

  const sendBookingConfirmationEmail = async (booking: any) => {
    if (!finalBookingDetails || !product) return;
    try {
      const email = user?.email || finalBookingDetails.guestEmail;
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-booking-confirmation-email`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            email,
            productName: product.name,
            bookingDate: finalBookingDetails.bookingDate,
            bookingTime: finalBookingDetails.bookingTime,
            address: finalBookingDetails.address,
            totalPrice: finalPrice,
            paymentMethod: booking.payment_method,
            bookingId: booking.id,
            includeEditing: finalBookingDetails.includeEditing,
            discountAmount: 0,
            creditsUsed: creditsToUse,
            customerName: booking.customer_name,
          }),
        }
      );
      const data = await response.json();
      if (data.error) {
        console.error('Failed to send confirmation email:', data.error);
        toast.error('Booking oprettet, men bekræftelses-email kunne ikke sendes');
      } else {
        toast.success('Bekræftelses-email sendt!');
      }
    } catch (error) {
      console.error('Error sending confirmation email:', error);
      toast.error('Booking oprettet, men bekræftelses-email kunne ikke sendes');
    }
  };

  const createBookingWithCredits = async (paymentStatus: string, paymentMethodType: string) => {
    if (!finalBookingDetails || !product) throw new Error('Booking data mangler');
    const bookingData: any = {
      product_id: product.id,
      booking_date: finalBookingDetails.bookingDate,
      booking_time: finalBookingDetails.bookingTime,
      address: finalBookingDetails.address,
      include_editing: finalBookingDetails.includeEditing,
      payment_status: paymentStatus,
      payment_method: paymentMethodType,
      payment_intent_id: null,
      discount_code_id: null,
      discount_amount: 0,
      original_price: finalBookingDetails.totalPrice,
      price: finalPrice,
      credits_used: creditsToUse,
      customer_name: customerName,
      mode: 'normal',
    };

    if (user) bookingData.user_id = user.id;
    else bookingData.guest_email = finalBookingDetails.guestEmail;

    const booking = await createBooking(bookingData);
    if (!booking) throw new Error('Kunne ikke oprette booking');

    if (user && creditsToUse > 0) {
      const { error: creditError } = await supabase
        .from('profiles')
        .update({ credits: credits - creditsToUse })
        .eq('id', user.id);
      if (creditError) {
        console.error('Error updating credits:', creditError);
        toast.error('Booking oprettet, men credits kunne ikke opdateres');
      } else {
        await refreshCredits();
      }
    }

    return booking;
  };

  const handlePayWithCredits = async () => {
    try {
      await validateBookingBeforePayment();
    } catch (error: any) {
      toast.error(error.message || 'Udfyld bookingoplysningerne først');
      return;
    }
    if (!canPayWithCreditsOnly) { toast.error('Du har ikke nok credits til at dække hele beløbet'); return; }
    setPayLoading(true);
    setPayError(null);
    try {
      const booking = await createBookingWithCredits('paid', 'credits');
      await sendBookingConfirmationEmail(booking);
      toast.success('Booking bekræftet! Betalt med credits.');
      navigate('/booking-success');
    } catch (err: any) {
      setPayError(err.message || 'Der opstod en fejl under behandling af din bestilling');
      toast.error(err.message || 'Der opstod en fejl under behandling af din bestilling');
    } finally {
      setPayLoading(false);
    }
  };

  const handlePayLater = async () => {
    try {
      await validateBookingBeforePayment();
    } catch (error: any) {
      toast.error(error.message || 'Udfyld bookingoplysningerne først');
      return;
    }
    setPayLoading(true);
    setPayError(null);
    try {
      const booking = await createBookingWithCredits('pending', 'invoice');
      await sendBookingConfirmationEmail(booking);
      toast.success('Booking bekræftet! Du vil modtage en faktura når bookingen er gennemført.');
      navigate('/booking-success');
    } catch (err: any) {
      setPayError(err.message || 'Der opstod en fejl under behandling af din bestilling');
      toast.error(err.message || 'Der opstod en fejl under behandling af din bestilling');
    } finally {
      setPayLoading(false);
    }
  };

  const handlePayCash = async () => {
    try {
      await validateBookingBeforePayment();
    } catch (error: any) {
      toast.error(error.message || 'Udfyld bookingoplysningerne først');
      return;
    }
    setPayLoading(true);
    setPayError(null);
    try {
      const booking = await createBookingWithCredits('pending', 'cash');
      await sendBookingConfirmationEmail(booking);
      toast.success('Booking bekræftet! Du betaler kontant ved optagelsen.');
      navigate('/booking-success');
    } catch (err: any) {
      setPayError(err.message || 'Der opstod en fejl under behandling af din bestilling');
      toast.error(err.message || 'Der opstod en fejl under behandling af din bestilling');
    } finally {
      setPayLoading(false);
    }
  };

  const validateBookingBeforePayment = async () => {
    if (!product || !finalBookingDetails) throw new Error('Udfyld venligst bookingoplysningerne først');
    if (!selectedTimeSlot) throw new Error('Vælg venligst dato og tidspunkt');
    if (!address.trim()) throw new Error('Indtast venligst en adresse');

    if (!user) {
      if (!guestEmail || !validateEmail(guestEmail)) throw new Error('Indtast venligst en gyldig email-adresse');
      if (!guestName.trim()) throw new Error('Indtast venligst dit navn');
    } else if (needsUserName && !userName.trim()) {
      throw new Error('Indtast venligst dit navn');
    }

    const isAvailable = await checkSlotAvailability(finalBookingDetails.bookingDate, finalBookingDetails.bookingTime);
    if (!isAvailable) throw new Error('Dette tidspunkt er desværre ikke længere ledigt');

    const isValid = await isAddressWithinRange(finalBookingDetails.address);
    if (!isValid) {
      const dist = await getFormattedDistance(finalBookingDetails.address);
      throw new Error(`Adressen er ${dist} fra vores base og er uden for vores dækningsområde.`);
    }
  };

  const createPaymentIntent = async () => {
    await validateBookingBeforePayment();
    if (!finalBookingDetails || !product) throw new Error('Booking data mangler');
    const userEmail = user?.email || finalBookingDetails.guestEmail;
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-payment-intent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          amount: finalPrice,
          customerEmail: userEmail,
          customerName: customerName,
          metadata: {
            productId: product.id,
            productName: product.name,
            bookingDate: finalBookingDetails.bookingDate,
            bookingTime: finalBookingDetails.bookingTime,
            address: finalBookingDetails.address,
            includeEditing: finalBookingDetails.includeEditing,
            discountCodeId: null,
            discountAmount: 0,
            originalPrice: finalBookingDetails.totalPrice,
            creditsUsed: creditsToUse,
            guestEmail: !user ? finalBookingDetails.guestEmail : null,
            customerName: customerName,
            userId: user?.id || null,
            mode: 'normal',
          },
        }),
      }
    );

    const data = await response.json();
    if (data.error) throw new Error(data.error);

    return {
      clientSecret: data.clientSecret,
      paymentIntentId: data.paymentIntentId
    };
  };

  const handlePaymentComplete = async (paymentIntentId: string) => {
    const booking = await createBookingWithCredits('paid', 'card');
    await supabase
      .from('bookings')
      .update({ payment_intent_id: paymentIntentId })
      .eq('id', booking.id);
    await sendBookingConfirmationEmail(booking);
  };

  // Keep payment data synchronized with the live booking form.
  useEffect(() => {
    if (!product || !selectedTimeSlot) {
      setFinalBookingDetails(null);
      return;
    }

    const effectiveGuestName = user ? (userName || customerName) : guestName;
    const effectiveGuestEmail = user?.email || guestEmail;
    const editingCost = (product.category === 'video' && !product.is_editing_included && includeEditing) ? 100 : 0;

    setFinalBookingDetails({
      bookingDate: selectedTimeSlot.date,
      bookingTime: selectedTimeSlot.time,
      address,
      includeEditing,
      isEditingIncluded: product.is_editing_included ?? false,
      totalPrice: product.price + editingCost,
      guestEmail: !user ? effectiveGuestEmail : undefined,
      guestName: !user ? effectiveGuestName : undefined,
    });
  }, [product, selectedTimeSlot, address, includeEditing, user, userName, customerName, guestName, guestEmail]);

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

  if (loading) {
    return (
      <div className="pt-24 pb-16 container">
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-neutral-300"></div>
          <EditableContent contentKey="booking-loading-text" as="p" className="mt-2" fallback="Indlæser produkt..." />
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="pt-24 pb-16 container">
        <div className="text-center py-12 text-error">
          <EditableContent contentKey="booking-product-not-found" as="p" fallback="Produktet blev ikke fundet. Gå tilbage til produktsiden og prøv igen." />
          <button onClick={() => navigate('/products')} className="btn-primary mt-4">
            <EditableContent contentKey="booking-back-to-products-button" fallback="Tilbage til Produkter" />
          </button>
        </div>
      </div>
    );
  }

  const bookingReady = Boolean(
    product &&
    selectedTimeSlot &&
    address.trim() &&
    (user ? (!needsUserName || userName.trim()) : (guestName.trim() && validateEmail(guestEmail)))
  );

  return (
    <div className="pt-24 pb-16">
      <div className="container">
        <div className="max-w-3xl mx-auto">

          {/* Product Header — same visual treatment as Simple Request */}
          <div className="mb-6">
            <div className="flex items-center gap-2 text-neutral-400 text-sm mb-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
              <EditableContent contentKey="simple-product-label" fallback="Produkt" />
            </div>
            <h1 className="text-3xl font-bold">{product.name}</h1>
          </div>

          {/* Personal Information */}
          <div className="bg-neutral-800 rounded-xl shadow-md p-6 mb-6 border border-neutral-700">
            <EditableContent contentKey="simple-personal-info-title" as="h2" className="text-xl font-semibold mb-4" fallback="Dine oplysninger" />

            {!user ? (
              <>
                <EditableContent
                  contentKey="booking-guest-info-description"
                  as="p"
                  className="text-neutral-300 mb-4"
                  fallback="Udfyld dine oplysninger for at fortsætte, eller log ind med Google for at udfylde automatisk."
                />

                <div className="mb-4">
                  <label htmlFor="guestName" className="block text-sm font-medium text-neutral-300 mb-2">
                    <EditableContent contentKey="simple-name-label" fallback="Dit navn" />
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      id="guestName"
                      value={guestName}
                      onChange={handleGuestNameChange}
                      className={`w-full px-4 py-2 bg-neutral-700 border rounded-lg text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary transition-all ${guestNameError ? 'border-red-500' : 'border-neutral-600'}`}
                      placeholder="John Doe"
                    />
                    <div className="absolute right-2 top-1/2 -translate-y-1/2">
                      <GoogleLoginButton
                        buttonText=""
                        redirectTo={`${window.location.origin}/booking/${productId}`}
                        bookingState={{ productId, selectedTimeSlot, address, includeEditing, guestEmail, guestName }}
                        compact={true}
                      />
                    </div>
                  </div>
                  {guestNameError && <p className="text-red-500 text-sm mt-2">{guestNameError}</p>}
                </div>

                <div>
                  <label htmlFor="guestEmail" className="block text-sm font-medium text-neutral-300 mb-2">
                    <EditableContent contentKey="simple-email-label" fallback="Din email" />
                  </label>
                  <div className="relative">
                    <input
                      type="email"
                      id="guestEmail"
                      value={guestEmail}
                      onChange={handleGuestEmailChange}
                      className={`w-full px-4 py-2 bg-neutral-700 border rounded-lg text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary transition-all ${guestEmailError ? 'border-red-500' : 'border-neutral-600'}`}
                      placeholder="din@email.dk"
                    />
                    <div className="absolute right-2 top-1/2 -translate-y-1/2">
                      <GoogleLoginButton
                        buttonText=""
                        redirectTo={`${window.location.origin}/booking/${productId}`}
                        bookingState={{ productId, selectedTimeSlot, address, includeEditing, guestEmail, guestName }}
                        compact={true}
                      />
                    </div>
                  </div>
                  {guestEmailError && <p className="text-red-500 text-sm mt-2">{guestEmailError}</p>}
                </div>
              </>
            ) : needsUserName ? (
              <div>
                <EditableContent
                  contentKey="booking-user-name-description"
                  as="p"
                  className="text-neutral-300 mb-4"
                  fallback="Vi har brug for dit navn for at kunne gennemføre bookingen."
                />
                <label htmlFor="userName" className="block text-sm font-medium text-neutral-300 mb-2">
                  <EditableContent contentKey="booking-user-name-label" fallback="Fulde navn *" />
                </label>
                <input
                  type="text"
                  id="userName"
                  value={userName}
                  onChange={handleUserNameChange}
                  placeholder="John Doe"
                  className={`w-full px-4 py-2 bg-neutral-700 border rounded-lg text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary transition-all ${userNameError ? 'border-red-500' : 'border-neutral-600'}`}
                />
                {userNameError && <p className="text-red-500 text-sm mt-2">{userNameError}</p>}
              </div>
            ) : (
              <div className="p-4 border border-green-500/20 rounded-lg bg-green-500/10">
                <p className="text-white font-medium">{userName || customerName}</p>
                <p className="text-neutral-300 text-sm">{user.email}</p>
              </div>
            )}
          </div>

          {/* Primary Booking Feature: user-controlled date/time */}
          <div className="bg-neutral-800 rounded-xl shadow-md p-6 mb-6 border border-neutral-700">
            <EditableContent contentKey="booking-time-selection-title" as="h2" className="text-xl font-semibold mb-4" fallback="Vælg Dato og Tid" />
            <EditableContent
              contentKey="booking-time-selection-description"
              as="p"
              className="text-neutral-300 mb-4"
              fallback="Vælg selv det tidspunkt, der passer dig bedst."
            />
            <TimeSlotPicker onSelectTimeSlot={handleSelectTimeSlot} selectedSlot={selectedTimeSlot} />
          </div>

          {/* Address */}
          <div className="bg-neutral-800 rounded-xl shadow-md p-6 mb-6 border border-neutral-700">
            <EditableContent contentKey="simple-address-label" as="h2" className="text-xl font-semibold mb-4" fallback="Din adresse" />
            <textarea
              id="address"
              rows={3}
              value={address}
              onChange={handleAddressChange}
              onBlur={() => {
                if (address.trim()) validateAddress(address);
              }}
              placeholder="Gade, husnummer, postnummer, by"
              className={`w-full px-4 py-2 bg-neutral-700 border rounded-lg text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary transition-all resize-none ${!isAddressValid ? 'border-red-500' : 'border-neutral-600'}`}
              required
            />
            {!isAddressValid && address && (
              <div className="mt-2 text-red-500 flex items-start text-sm">
                <AlertTriangle size={16} className="mr-2 mt-0.5 flex-shrink-0" />
                <span>
                  <EditableContent contentKey="simple-request-page-denne-adresse-er" fallback="Denne adresse er" /> {distance} <EditableContent contentKey="simple-request-page-fra-vores-base-og-er" fallback="fra vores base og er uden for vores dækningsområde." />
                </span>
              </div>
            )}
            {isValidatingAddress && <p className="text-neutral-400 text-sm mt-2">Validerer adresse...</p>}
          </div>

          {/* Editing — same as Simple Request, and nothing else added */}
          {product.category === 'video' && (
            <div className="bg-neutral-800 rounded-xl shadow-md p-6 mb-6 border border-neutral-700">
              <EditableContent contentKey="simple-editing-title" as="h2" className="text-xl font-semibold mb-4" fallback="Tilvalg" />
              {product.is_editing_included ? (
                <div className="flex items-start space-x-3 p-4 border border-green-500/20 rounded-lg bg-green-500/10">
                  <svg className="w-6 h-6 text-green-400 mt-1" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414-1.414l4-4z" clipRule="evenodd" />
                  </svg>
                  <div>
                    <EditableContent contentKey="booking-editing-included-title" as="h3" className="font-medium text-green-400" fallback="Redigering inkluderet" />
                    <EditableContent contentKey="booking-editing-included-description" as="p" className="text-neutral-300 mt-1" fallback="Dette produkt inkluderer redigering som farvekorrigering, klipning, baggrundsmusik og lydeffekter." />
                  </div>
                </div>
              ) : (
                <div className="flex items-start space-x-3 p-4 border border-neutral-700 rounded-lg bg-neutral-800/50">
                  <input type="checkbox" id="editing" checked={includeEditing} onChange={(e) => setIncludeEditing(e.target.checked)} className="mt-1" />
                  <div>
                    <label htmlFor="editing" className="font-medium cursor-pointer text-white">
                      <EditableContent contentKey="simple-editing-option-title" fallback="Redigering" />
                    </label>
                    <EditableContent contentKey="simple-editing-description" as="p" className="text-neutral-300 mt-1" fallback="Få redigering af dine optagelser, herunder klipning, effekter, lydeffekter og baggrundsmusik." />
                    <EditableContent contentKey="simple-editing-price" as="p" className="text-neutral-300 font-semibold mt-2" fallback="+100 kr" />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Payment Method — visible immediately; no continue/payment-step click */}
          <div id="payment-section" className="bg-neutral-800 rounded-xl shadow-md p-6 mb-6 border border-neutral-700">
            <EditableContent contentKey="payment-page-title" as="h2" className="text-xl font-semibold mb-4" fallback="Betaling" />
            <p className="text-neutral-300 text-sm mb-4">
              <EditableContent contentKey="simple-payment-section-description" fallback="Vælg betalingsmetode og gennemfør din booking direkte her." />
            </p>

            {payError && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg p-4 mb-6 text-sm">
                {payError}
              </div>
            )}

            {user && credits > 0 && (
              <div className="mb-6 p-4 border border-neutral-700 rounded-lg bg-neutral-800/50">
                <div className="flex items-center gap-2 mb-3">
                  <Coins size={20} className="text-primary" />
                  <span className="font-medium text-white">Brug Credits</span>
                </div>
                <p className="text-neutral-300 text-sm mb-3">Tilgængelige credits: <span className="font-semibold text-white">{credits}</span></p>
                <div className="space-y-3">
                  <label className="flex items-center text-sm">
                    <input type="radio" name="creditUsage" value="none" checked={creditUsageOption === 'none'} onChange={() => setCreditUsageOption('none')} className="mr-2" />
                    Brug ikke credits
                  </label>
                  <label className="flex items-center text-sm">
                    <input type="radio" name="creditUsage" value="all" checked={creditUsageOption === 'all'} onChange={() => setCreditUsageOption('all')} className="mr-2" />
                    Brug alle tilgængelige credits ({Math.min(credits, totalPrice)} credits)
                  </label>
                  <label className="flex items-center text-sm">
                    <input type="radio" name="creditUsage" value="custom" checked={creditUsageOption === 'custom'} onChange={() => setCreditUsageOption('custom')} className="mr-2" />
                    Brug tilpasset antal credits
                  </label>
                  {creditUsageOption === 'custom' && (
                    <div className="ml-6">
                      <input type="number" value={customCreditsToUseInput} onChange={(e) => setCustomCreditsToUseInput(e.target.value)} placeholder="Antal credits" min="0" max={Math.min(credits, totalPrice)} className="w-32 px-3 py-2 bg-neutral-700 border border-neutral-600 rounded-lg text-white" />
                      <span className="ml-2 text-neutral-400">(max {Math.min(credits, totalPrice)})</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="space-y-3">
              {canPayWithCreditsOnly && (
                <label className={`flex items-start space-x-3 p-4 border rounded-lg cursor-pointer transition-colors ${paymentMethod === 'credits' ? 'border-blue-500 bg-blue-500/10' : 'border-neutral-700 bg-neutral-800/50'}`}>
                  <input type="radio" id="credits" name="payment_method" className="mt-1" checked={paymentMethod === 'credits'} onChange={() => setPaymentMethod('credits')} disabled={!bookingReady} />
                  <div>
                    <span className="font-medium text-white">Betal med credits</span>
                    <p className="text-neutral-300 mt-1 text-sm">Brug dine credits til at betale for hele bookingen.</p>
                  </div>
                </label>
              )}

              <label className={`flex items-start space-x-3 p-4 border rounded-lg transition-colors ${paymentMethod === 'pay_now' ? 'border-blue-500 bg-blue-500/10' : 'border-neutral-700 bg-neutral-800/50'} ${!bookingReady ? 'opacity-70' : 'cursor-pointer'}`}>
                <input type="radio" id="pay_now" name="payment_method" className="mt-1" checked={paymentMethod === 'pay_now'} onChange={() => setPaymentMethod('pay_now')} disabled={!bookingReady || !stripeReady} />
                <div className="flex-1">
                  <span className="font-medium text-white">Betal nu</span>
                  <p className="text-neutral-300 mt-1 text-sm">Sikker betaling via Stripe.</p>
                  <div className="flex items-center gap-2 mt-2 text-sm text-neutral-400"><CreditCard size={18} /> Visa, Mastercard, Klarna o.a.</div>
                </div>
              </label>

              <label className={`flex items-start space-x-3 p-4 border rounded-lg transition-colors ${paymentMethod === 'pay_later' ? 'border-blue-500 bg-blue-500/10' : 'border-neutral-700 bg-neutral-800/50'} ${!bookingReady ? 'opacity-70' : 'cursor-pointer'}`}>
                <input type="radio" id="pay_later" name="payment_method" className="mt-1" checked={paymentMethod === 'pay_later'} onChange={() => setPaymentMethod('pay_later')} disabled={!bookingReady} />
                <div>
                  <span className="font-medium text-white">Betal efter optagelse</span>
                  <p className="text-neutral-300 mt-1 text-sm">Vi sender dig en faktura efter optagelsen.</p>
                </div>
              </label>

              <label className={`flex items-start space-x-3 p-4 border rounded-lg transition-colors ${paymentMethod === 'cash' ? 'border-blue-500 bg-blue-500/10' : 'border-neutral-700 bg-neutral-800/50'} ${!bookingReady ? 'opacity-70' : 'cursor-pointer'}`}>
                <input type="radio" id="pay_cash" name="payment_method" className="mt-1" checked={paymentMethod === 'cash'} onChange={() => setPaymentMethod('cash')} disabled={!bookingReady} />
                <div>
                  <span className="font-medium text-white">Betal med kort eller kontant ved optagelse</span>
                  <p className="text-neutral-300 mt-1 text-sm">Du betaler ved optagelsen.</p>
                  <div className="flex items-center gap-2 mt-2 text-sm text-neutral-400"><Banknote size={18} /> Kontant eller kort</div>
                </div>
              </label>
            </div>
          </div>

          {/* Stripe card form is inline; it becomes active as soon as required booking info exists. */}
          {paymentMethod === 'pay_now' && bookingReady && finalBookingDetails && stripeReady && stripePromise && finalPrice > 0 ? (
            <div className="bg-neutral-800 rounded-xl shadow-md p-6 mb-6 border border-neutral-700 space-y-4">
              <EditableContent contentKey="simple-payment-section-title" as="h2" className="text-xl font-semibold" fallback="Gennemfør betaling" />
              <Elements
                stripe={stripePromise}
                options={{
                  mode: 'payment',
                  amount: Math.round(finalPrice * 100),
                  currency: 'dkk',
                  locale: 'da',
                  loader: 'auto',
                  appearance: {
                    theme: 'night',
                    variables: {
                      colorPrimary: '#0ea5e9',
                      colorBackground: '#262626',
                      colorText: '#ffffff',
                      colorDanger: '#ef4444',
                      fontFamily: 'system-ui, -apple-system, sans-serif',
                      spacingUnit: '4px',
                      borderRadius: '8px',
                    },
                  },
                }}
              >
                <StripePaymentForm
                  amount={finalPrice}
                  customerName={customerName || guestName}
                  customerEmail={user?.email || guestEmail}
                  onCustomerNameChange={setCustomerName}
                  onSuccess={() => navigate('/booking-success')}
                  loading={payLoading}
                  setLoading={setPayLoading}
                  setError={setPayError}
                  createPaymentIntent={createPaymentIntent}
                  onPaymentComplete={handlePaymentComplete}
                  submitButtonText={`Betal ${finalPrice} kr${creditsToUse > 0 ? ` (${creditsToUse} credits + ${finalPrice} kr)` : ''}`}
                />
              </Elements>
            </div>
          ) : paymentMethod === 'pay_now' && bookingReady && finalPrice > 0 && !stripeReady ? (
            <div className="bg-neutral-800 rounded-xl shadow-md p-6 mb-6 border border-neutral-700 text-neutral-300">Betalingssystem indlæses...</div>
          ) : null}

          {paymentMethod === 'pay_now' && bookingReady && finalPrice === 0 && (
            <div className="bg-neutral-800 rounded-xl shadow-md p-6 mb-6 border border-neutral-700">
              <div className="bg-primary/10 border border-primary rounded-lg p-4 text-white">Dit beløb er fuldt dækket af dine credits.</div>
              <button onClick={handlePayWithCredits} disabled={payLoading} className="btn-primary w-full mt-4">
                {payLoading ? 'Behandler...' : `Gennemfør booking med ${creditsToUse} credits`}
              </button>
            </div>
          )}

          {paymentMethod !== 'pay_now' && bookingReady && (
            <div className="bg-neutral-800 rounded-xl shadow-md p-6 mb-6 border border-neutral-700">
              <button
                onClick={paymentMethod === 'credits' ? handlePayWithCredits : paymentMethod === 'pay_later' ? handlePayLater : handlePayCash}
                className="w-full px-6 py-3 bg-neutral-800 text-white border border-neutral-700 font-medium rounded-lg hover:bg-neutral-700 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={payLoading}
              >
                {payLoading ? 'Behandler...' : paymentMethod === 'credits' ? `Betal med ${creditsToUse} credits` : 'Gennemfør Booking'}
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};


export default BookingPage;
