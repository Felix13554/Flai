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

const BookingPage: React.FC = () => {
  const { productId } = useParams<{ productId: string }>();
  const navigate = useNavigate();
  const { user, credits, refreshCredits } = useAuth();
  const { createBooking } = useBookings(user?.id);

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<TimeSlot | null>(null);
  const [address, setAddress] = useState('');
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
  const [paymentMethod, setPaymentMethod] = useState<'pay_now' | 'pay_with_credits' | 'invoice-card' | 'on-site-card'>('pay_now');
  const [payLoading, setPayLoading] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [stripePromise, setStripePromise] = useState<Promise<any> | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');

  const priceAfterDiscount = finalBookingDetails?.totalPrice || totalPrice;
  const finalPrice = priceAfterDiscount;

  // Initialize Stripe exactly like Simple Request: keep the promise in
  // component state and only render the payment form once it is available.
  // Booking validation happens when the payment form is submitted, not while
  // the payment UI is rendering.
  useEffect(() => {
    const initializeStripe = async () => {
      try {
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-stripe-config`,
          { headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` } }
        );
        const data = await response.json();
        if (data.error) { console.error('Failed to get Stripe config:', data.error); return; }
        setStripePromise(loadStripe(data.publishableKey));
      } catch (error) {
        console.error('Error initializing Stripe:', error);
      }
    };
    initializeStripe();
  }, []);

  useEffect(() => {
    setPayError(null);
  }, [paymentMethod]);

  const sendBookingConfirmationEmail = async (booking: any) => {
    if (!finalBookingDetails || !product) return;
    try {
      const email = customerEmail || user?.email || finalBookingDetails.guestEmail;
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
            totalPrice: booking.price ?? finalBookingDetails.totalPrice,
            paymentMethod: booking.payment_method,
            bookingId: booking.id,
            includeEditing: finalBookingDetails.includeEditing,
            discountAmount: 0,
            creditsUsed: booking.credits_used ?? 0,
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

  const createBookingWithCredits = async (paymentStatus: string, paymentMethodType: string, creditsUsedAmount = 0) => {
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
      credits_used: creditsUsedAmount,
      customer_name: customerName,
      mode: 'normal',
    };

    if (user) bookingData.user_id = user.id;
    else bookingData.guest_email = finalBookingDetails.guestEmail;

    const booking = await createBooking(bookingData);
    if (!booking) throw new Error('Kunne ikke oprette booking');

    if (user && creditsUsedAmount > 0) {
      const { error: creditError } = await supabase
        .from('profiles')
        .update({ credits: credits - creditsUsedAmount })
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

    const total = priceAfterDiscount;
    if (!user) {
      toast.error('Du skal være logget ind for at betale med credits');
      return;
    }
    if (credits < total) {
      toast.error(`Du har ikke nok credits. Du har ${credits} credits, men bookingen koster ${total} kr.`);
      return;
    }

    setPayLoading(true);
    setPayError(null);
    try {
      const booking = await createBookingWithCredits('paid', 'credits', total);
      await sendBookingConfirmationEmail(booking);
      toast.success('🎉 Booking gennemført med credits!');
      navigate('/booking-success');
    } catch (err: any) {
      setPayError(err.message || 'Der opstod en fejl under behandling af din booking');
      toast.error(err.message || 'Der opstod en fejl under behandling af din booking');
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
      if (!customerEmail || !validateEmail(customerEmail)) throw new Error('Indtast venligst en gyldig email-adresse');
      if (!customerName.trim()) throw new Error('Indtast venligst dit navn');
    } else if (!customerName.trim()) {
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
    const userEmail = customerEmail || user?.email || finalBookingDetails.guestEmail;
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-payment-intent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          amount: priceAfterDiscount,
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
            creditsUsed: 0,
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

    const effectiveGuestName = customerName || (user ? userName : guestName);
    const effectiveGuestEmail = customerEmail || (user?.email || guestEmail);

    setFinalBookingDetails({
      bookingDate: selectedTimeSlot.date,
      bookingTime: selectedTimeSlot.time,
      address,
      includeEditing: product.is_editing_included ?? false,
      isEditingIncluded: product.is_editing_included ?? false,
      totalPrice: product.price,
      guestEmail: !user ? effectiveGuestEmail : undefined,
      guestName: !user ? effectiveGuestName : undefined,
    });
  }, [product, selectedTimeSlot, address, user, userName, customerName, customerEmail, guestName, guestEmail]);

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
          if (state.guestEmail) {
            setGuestEmail(state.guestEmail);
            setCustomerEmail(state.guestEmail);
          }
          if (state.guestName) {
            setGuestName(state.guestName);
            setUserName(state.guestName);
            setCustomerName(state.guestName);
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

  // Auto-fill the same editable personal-information fields used by Simple Request.
  // Never replace values already restored from the booking/session state.
  useEffect(() => {
    const loadUserInfo = async () => {
      if (!user) return;

      const { data: { user: authUser } } = await supabase.auth.getUser();
      const metadata = authUser?.user_metadata || {};
      const fullName = metadata.full_name || metadata.name || '';
      const savedAddress = metadata.address || metadata.customer_address || '';

      if (fullName && !customerName.trim()) {
        setUserName(fullName);
        setGuestName(fullName);
        setCustomerName(fullName);
      }

      if (user.email && !customerEmail.trim()) {
        setGuestEmail(user.email);
        setCustomerEmail(user.email);
      }

      if (savedAddress && !address.trim()) {
        setAddress(savedAddress);
      }
    };

    loadUserInfo();
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
    setCustomerEmail(email);
    setGuestEmailError(email && !validateEmail(email) ? 'Indtast venligst en gyldig email-adresse' : '');
  };

  const handleGuestNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const name = e.target.value;
    setGuestName(name);
    setUserName(name);
    setCustomerName(name);
    const error = !name.trim() ? 'Indtast venligst dit navn' : '';
    setGuestNameError(error);
    setUserNameError(error);
  };

  const handleUserNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const name = e.target.value;
    setUserName(name);
    setGuestName(name);
    setCustomerName(name);
    const error = !name.trim() ? 'Indtast venligst dit navn' : '';
    setUserNameError(error);
    setGuestNameError(error);
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

          {/* Personal Information — exact Simple Request layout */}
          <div className="bg-neutral-800 rounded-xl shadow-md p-6 mb-6 border border-neutral-700">
            <EditableContent contentKey="simple-personal-info-title" as="h2" className="text-xl font-semibold mb-4" fallback="Dine oplysninger" />

            {/* Name */}
            <div className="mb-4">
              <label htmlFor="customerName" className="block text-sm font-medium text-neutral-300 mb-2">
                <EditableContent contentKey="simple-name-label" fallback="Dit navn" />
              </label>
              <div className="relative">
                <input
                  type="text"
                  id="customerName"
                  name="customerName"
                  value={customerName}
                  onChange={user ? handleUserNameChange : handleGuestNameChange}
                  className={`w-full px-4 py-2 bg-neutral-700 border rounded-lg text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary transition-all ${(user ? userNameError : guestNameError) ? 'border-red-500' : 'border-neutral-600'}`}
                  placeholder="John Doe"
                />
                {!user && (
                  <div className="absolute right-2 top-1/2 -translate-y-1/2">
                    <GoogleLoginButton
                      buttonText=""
                      redirectTo={`${window.location.origin}/booking/${productId}`}
                      bookingState={{ productId, selectedTimeSlot, address, guestEmail: customerEmail, guestName: customerName }}
                      compact={true}
                    />
                  </div>
                )}
              </div>
              {(user ? userNameError : guestNameError) && (
                <p className="text-red-500 text-sm mt-2">{user ? userNameError : guestNameError}</p>
              )}
            </div>

            {/* Email */}
            <div className="mb-4">
              <label htmlFor="customerEmail" className="block text-sm font-medium text-neutral-300 mb-2">
                <EditableContent contentKey="simple-email-label" fallback="Din email" />
              </label>
              <div className="relative">
                <input
                  type="email"
                  id="customerEmail"
                  name="customerEmail"
                  value={customerEmail}
                  onChange={handleGuestEmailChange}
                  className={`w-full px-4 py-2 bg-neutral-700 border rounded-lg text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary transition-all ${guestEmailError ? 'border-red-500' : 'border-neutral-600'}`}
                  placeholder="din@email.dk"
                />
                {!user && (
                  <div className="absolute right-2 top-1/2 -translate-y-1/2">
                    <GoogleLoginButton
                      buttonText=""
                      redirectTo={`${window.location.origin}/booking/${productId}`}
                      bookingState={{ productId, selectedTimeSlot, address, guestEmail: customerEmail, guestName: customerName }}
                      compact={true}
                    />
                  </div>
                )}
              </div>
              {guestEmailError && <p className="text-red-500 text-sm mt-2">{guestEmailError}</p>}
            </div>

            {/* Address */}
            <div>
              <label htmlFor="customerAddress" className="block text-sm font-medium text-neutral-300 mb-2">
                <EditableContent contentKey="simple-address-label" fallback="Din adresse" />
              </label>
              <textarea
                id="customerAddress"
                name="customerAddress"
                value={address}
                onChange={handleAddressChange}
                onBlur={() => {
                  if (address.trim()) validateAddress(address);
                }}
                placeholder="Gade, husnummer, postnummer, by"
                rows={3}
                className={`w-full px-4 py-2 bg-neutral-700 border rounded-lg text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary transition-all resize-none ${
                  !isAddressValid ? 'border-red-500' : 'border-neutral-600'
                }`}
              />
              {!isAddressValid && address && (
                <div className="mt-2 text-red-500 flex items-start text-sm">
                  <AlertTriangle size={16} className="mr-2 mt-0.5 flex-shrink-0" />
                  <span>
                    <EditableContent contentKey="simple-request-page-denne-adresse-er" fallback="Denne adresse er" /> {distance} <EditableContent contentKey="simple-request-page-fra-vores-base-og-er" fallback="fra vores base og er uden for vores dækningsområde." />
                  </span>
                </div>
              )}
              {isValidatingAddress && (
                <p className="text-neutral-400 text-sm mt-2"><EditableContent contentKey="simple-request-page-validerer-adresse" fallback="Validerer adresse..." /></p>
              )}
            </div>
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

          {/* Editing — informational only; there is no extra-cost editing option to choose at booking */}
          {product.category === 'video' && product.is_editing_included && (
            <div className="bg-neutral-800 rounded-xl shadow-md p-6 mb-6 border border-neutral-700">
              <EditableContent contentKey="simple-editing-title" as="h2" className="text-xl font-semibold mb-4" fallback="Tilvalg" />
              <div className="flex items-start space-x-3 p-4 border border-green-500/20 rounded-lg bg-green-500/10">
                <svg className="w-6 h-6 text-green-400 mt-1" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414-1.414l4-4z" clipRule="evenodd" />
                </svg>
                <div>
                  <EditableContent contentKey="booking-editing-included-title" as="h3" className="font-medium text-green-400" fallback="Redigering inkluderet" />
                  <EditableContent contentKey="booking-editing-included-description" as="p" className="text-neutral-300 mt-1" fallback="Dette produkt inkluderer redigering som farvekorrigering, klipning, baggrundsmusik og lydeffekter." />
                </div>
              </div>
            </div>
          )}

          {/* Payment Method — copied from Simple Request, without a separate payment step */}
          <div className="bg-neutral-800 rounded-xl shadow-md p-6 mb-6 border border-neutral-700">
            <EditableContent contentKey="simple-payment-method-title" as="h2" className="text-xl font-semibold mb-4" fallback="Betalingsmetode" />

            <div className="space-y-3">
              {[
                { value: 'pay_now', titleKey: 'simple-payment-now-title', titleFallback: 'Betal Nu', descKey: 'simple-payment-now-description', descFallback: 'Betal med kort eller Klarna.' },
                ...(user ? [{ value: 'pay_with_credits', titleKey: 'simple-payment-credits-title', titleFallback: 'Betal med Credits', descKey: 'simple-payment-credits-description', descFallback: `Brug dine credits (${credits} tilgængelige)` }] : []),
                { value: 'invoice-card', titleKey: 'simple-payment-invoice-title', titleFallback: 'Faktura - Kort', descKey: 'simple-payment-invoice-description', descFallback: 'Betal efter levering' },
                { value: 'on-site-card', titleKey: 'simple-payment-onsite-title', titleFallback: 'Betaling ved optagelsen', descKey: 'simple-payment-onsite-description', descFallback: 'Kort eller kontant' },
              ].map(({ value, titleKey, titleFallback, descKey, descFallback }) => (
                <div
                  key={value}
                  className={`flex items-start space-x-3 p-4 border rounded-lg cursor-pointer transition-colors ${
                    paymentMethod === value ? 'border-blue-500 bg-blue-500/10' : 'border-neutral-700 bg-neutral-800/50'
                  }`}
                  onClick={() => setPaymentMethod(value as typeof paymentMethod)}
                >
                  <input
                    type="radio"
                    id={value}
                    name="paymentMethod"
                    value={value}
                    checked={paymentMethod === value}
                    onChange={() => setPaymentMethod(value as typeof paymentMethod)}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <label htmlFor={value} className="font-medium cursor-pointer text-white">
                      <EditableContent contentKey={titleKey} fallback={titleFallback} />
                    </label>
                    <EditableContent contentKey={descKey} as="p" className="text-neutral-300 mt-1 text-sm" fallback={descFallback} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Credits Payment Section — copied from Simple Request */}
          {paymentMethod === 'pay_with_credits' && (
            <div className="bg-neutral-800 rounded-xl shadow-md p-6 border border-neutral-700 mb-6">
              <div className="flex items-center gap-3 mb-4">
                <Coins size={24} className="text-primary" />
                <EditableContent contentKey="simple-credits-payment-title" as="h2" className="text-xl font-semibold" fallback="Betal med Credits" />
              </div>
              <div className="flex items-center justify-between p-4 bg-neutral-700/50 rounded-lg mb-4">
                <span className="text-neutral-300">
                  <EditableContent contentKey="simple-credits-balance-label" fallback="Din credit saldo:" />
                </span>
                <span className={`font-bold text-lg ${credits >= totalPrice ? 'text-green-400' : 'text-red-400'}`}>
                  {credits} <EditableContent contentKey="simple-request-page-credits-2" fallback="credits" />
                </span>
              </div>
              <div className="flex items-center justify-between p-4 bg-neutral-700/50 rounded-lg mb-4">
                <span className="text-neutral-300">
                  <EditableContent contentKey="simple-credits-cost-label" fallback="Ordrebeløb:" />
                </span>
                <span className="font-bold text-lg text-white">{totalPrice} <EditableContent contentKey="simple-request-page-credits" fallback="credits" /></span>
              </div>
              {credits < totalPrice && (
                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                  <EditableContent contentKey="simple-credits-insufficient" fallback="Du har ikke nok credits til at gennemføre denne betaling." />
                  {' '}
                  <button type="button" onClick={() => navigate('/buy-credits')} className="underline hover:text-red-300">
                    <EditableContent contentKey="simple-credits-buy-link" fallback="Køb flere credits" />
                  </button>
                </div>
              )}
              <div className="flex justify-between">
                <button type="button" onClick={() => navigate(-1)} className="btn-secondary" disabled={payLoading}>
                  <EditableContent contentKey="simple-cancel-button" fallback="Tilbage" />
                </button>
                <button
                  type="button"
                  onClick={handlePayWithCredits}
                  className="btn-primary flex items-center"
                  disabled={payLoading || credits < totalPrice}
                >
                  {payLoading ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                      <EditableContent contentKey="simple-submitting-button" fallback="Opretter..." />
                    </>
                  ) : (
                    <>
                      <Coins size={18} className="mr-2" />
                      <EditableContent contentKey="simple-credits-pay-button" fallback={`Betal ${totalPrice} credits`} />
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Stripe Payment Section — same render pattern as Simple Request.
              It remains available before all booking fields are completed;
              validation happens only when the customer submits payment. */}
          {paymentMethod === 'pay_now' && stripePromise && (
            <div className="bg-neutral-800 rounded-xl shadow-md p-6 border border-neutral-700 space-y-6 mb-6">
              <div>
                <EditableContent contentKey="simple-payment-section-title" as="h2" className="text-xl font-semibold mb-4" fallback="Gennemfør betaling" />
                <EditableContent contentKey="simple-payment-section-description" as="p" className="text-neutral-300 text-sm" fallback="Udfyld kortoplysninger nedenfor for at bekræfte din booking" />
              </div>

              <div>
                <Elements
                  stripe={stripePromise}
                  options={{
                    mode: 'payment',
                    amount: Math.round(totalPrice * 100),
                    currency: 'dkk',
                    locale: 'da',
                    loader: 'auto',
                    appearance: {
                      theme: 'night',
                      variables: {
                        colorPrimary: '#3b82f6',
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
                    amount={totalPrice}
                    customerName={customerName}
                    customerEmail={customerEmail || user?.email || guestEmail}
                    onSuccess={() => {
                      toast.success('🎉 Betaling gennemført! Vi kontakter dig snart.');
                      setTimeout(() => navigate('/booking-success'), 2500);
                    }}
                    loading={payLoading}
                    setLoading={setPayLoading}
                    setError={setPayError}
                    createPaymentIntent={createPaymentIntent}
                    onPaymentComplete={handlePaymentComplete}
                    showNameField={false}
                    submitButtonText={`Betal ${totalPrice} kr`}
                  />
                </Elements>

                {payError && (
                  <div className="mt-4 p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm flex items-start gap-3">
                    <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>{payError}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {(paymentMethod === 'invoice-card' || paymentMethod === 'on-site-card') && (
            <div className="flex justify-between mb-6">
              <button type="button" onClick={() => navigate(-1)} className="btn-secondary" disabled={payLoading}>
                <EditableContent contentKey="simple-cancel-button" fallback="Tilbage" />
              </button>
              <button
                type="button"
                onClick={paymentMethod === 'invoice-card' ? handlePayLater : handlePayCash}
                className="btn-primary flex items-center"
                disabled={payLoading}
              >
                {payLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                    <EditableContent contentKey="simple-submitting-button" fallback="Opretter..." />
                  </>
                ) : (
                  <EditableContent contentKey="simple-submit-button" fallback="Gennemfør booking" />
                )}
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};


export default BookingPage;
