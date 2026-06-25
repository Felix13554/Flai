import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../utils/supabase';
import { formatDate, formatTime, checkSlotAvailability } from '../utils/booking';
import { useBookings } from '../hooks/useBookings';
import { CreditCard, Banknote, Coins, AlertCircle } from 'lucide-react';
import EditableContent from '../components/EditableContent';
import StripePaymentForm from '../components/StripePaymentForm';
import toast from 'react-hot-toast';
import { isAddressWithinRange, getFormattedDistance } from '../utils/location';
import { loadStripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';

interface PaymentPageState {
  productId: number;
  productName: string;
  productPrice: number;
  bookingDate: string;
  bookingTime: string;
  address: string;
  includeEditing: boolean;
  /** True when editing was already included in the product at no extra cost */
  isEditingIncluded: boolean;
  totalPrice: number;
  guestEmail?: string;
  guestName?: string;
}

// Initialize Stripe
let stripePromise: Promise<any> | null = null;
let isTestMode = false;

const initializeStripe = async () => {
  if (stripePromise) return stripePromise;

  try {
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-stripe-config`,
      {
        headers: {
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
      }
    );

    const data = await response.json();

    if (data.error) {
      console.error('Failed to get Stripe config:', data.error);
      return null;
    }

    isTestMode = data.publishableKey?.startsWith('pk_test');
    stripePromise = loadStripe(data.publishableKey);
    return stripePromise;
  } catch (error) {
    console.error('Error initializing Stripe:', error);
    return null;
  }
};

// Main PaymentPage component
const PaymentPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, credits, refreshCredits } = useAuth();
  const { createBooking } = useBookings(user?.id);

  const [paymentMethod, setPaymentMethod] = useState<'pay_now' | 'pay_later' | 'cash' | 'credits'>('pay_now');
  const [creditUsageOption, setCreditUsageOption] = useState<'none' | 'all' | 'custom'>('none');
  const [customCreditsToUseInput, setCustomCreditsToUseInput] = useState<string>('');
  const [creditsToUse, setCreditsToUse] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stripeReady, setStripeReady] = useState(false);
  const [customerName, setCustomerName] = useState('');

  const bookingDetails = location.state as PaymentPageState;

  // Derive whether the editing add-on was a paid choice:
  // - includeEditing true + isEditingIncluded false → user paid +100 kr
  // - includeEditing true + isEditingIncluded true  → free, already in product price
  const editingIsPaidAddon =
    bookingDetails?.includeEditing && !bookingDetails?.isEditingIncluded;

  // Get customer name from booking details or auth
  useEffect(() => {
    const fetchCustomerName = async () => {
      if (bookingDetails?.guestName) {
        setCustomerName(bookingDetails.guestName);
      } else if (user) {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        
        const fullName = authUser?.user_metadata?.full_name || 
                        authUser?.user_metadata?.name || 
                        '';
        
        setCustomerName(fullName);
      }
    };
    
    fetchCustomerName();
  }, [user, bookingDetails]);

  useEffect(() => {
    const setupStripe = async () => {
      const promise = await initializeStripe();
      setStripeReady(!!promise);
    };
    setupStripe();
  }, []);

  useEffect(() => {
    if (!bookingDetails) {
      toast.error('Ingen booking data fundet');
      navigate('/products');
    }
  }, [bookingDetails, navigate]);

  if (!bookingDetails) {
    return (
      <div className="pt-24 pb-16">
        <div className="container">
          <div className="max-w-3xl mx-auto text-center">
            <div className="flex items-center justify-center">
              <svg className="animate-spin h-8 w-8 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const priceAfterDiscount = bookingDetails.totalPrice;

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

  const finalPrice = Math.max(0, priceAfterDiscount - creditsToUse);
  const canPayWithCreditsOnly = creditsToUse >= priceAfterDiscount;

  useEffect(() => {
    if (!bookingDetails) { navigate('/products'); return; }

    const validateBooking = async () => {
      try {
        const isAvailable = await checkSlotAvailability(bookingDetails.bookingDate, bookingDetails.bookingTime);
        if (!isAvailable) {
          toast.error('Dette tidspunkt er desværre ikke længere ledigt');
          navigate('/booking/' + bookingDetails.productId);
          return;
        }
        const isValid = await isAddressWithinRange(bookingDetails.address);
        if (!isValid) {
          const distance = await getFormattedDistance(bookingDetails.address);
          toast.error(`Adressen er ${distance} fra vores base`);
          navigate('/booking/' + bookingDetails.productId);
        }
      } catch (error) {
        console.error('Error validating booking:', error);
        toast.error('Der opstod en fejl ved validering af booking');
        navigate('/booking/' + bookingDetails.productId);
      }
    };

    validateBooking();
  }, [bookingDetails, navigate]);

  useEffect(() => {
    if (!stripeReady && paymentMethod === 'pay_now') {
      setError('Betalingssystem indlæses...');
    } else {
      setError(null);
    }
  }, [paymentMethod, stripeReady]);

  useEffect(() => {
    if (finalPrice === 0 && paymentMethod === 'pay_now') {
      setPaymentMethod('credits');
    }
  }, [finalPrice, paymentMethod]);

  const sendBookingConfirmationEmail = async (booking: any) => {
    try {
      const email = user?.email || bookingDetails.guestEmail;
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
            productName: bookingDetails.productName,
            bookingDate: bookingDetails.bookingDate,
            bookingTime: bookingDetails.bookingTime,
            address: bookingDetails.address,
            totalPrice: finalPrice,
            paymentMethod: booking.payment_method,
            bookingId: booking.id,
            includeEditing: bookingDetails.includeEditing,
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
    const bookingData: any = {
      product_id: bookingDetails.productId,
      booking_date: bookingDetails.bookingDate,
      booking_time: bookingDetails.bookingTime,
      address: bookingDetails.address,
      include_editing: bookingDetails.includeEditing,
      payment_status: paymentStatus,
      payment_method: paymentMethodType,
      payment_intent_id: null,
      discount_code_id: null,
      discount_amount: 0,
      original_price: bookingDetails.totalPrice,
      price: finalPrice,
      credits_used: creditsToUse,
      customer_name: customerName,
      mode: 'normal',
    };

    if (user) bookingData.user_id = user.id;
    else bookingData.guest_email = bookingDetails.guestEmail;

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
    if (!canPayWithCreditsOnly) { toast.error('Du har ikke nok credits til at dække hele beløbet'); return; }

    setLoading(true);
    setError(null);
    try {
      const booking = await createBookingWithCredits('paid', 'credits');
      await sendBookingConfirmationEmail(booking);
      toast.success('Booking bekræftet! Betalt med credits.');
      navigate('/booking-success');
    } catch (err: any) {
      setError(err.message || 'Der opstod en fejl under behandling af din bestilling');
      toast.error(err.message || 'Der opstod en fejl under behandling af din bestilling');
    } finally {
      setLoading(false);
    }
  };

  const handlePayLater = async () => {
    setLoading(true);
    setError(null);
    try {
      const booking = await createBookingWithCredits('pending', 'invoice');
      await sendBookingConfirmationEmail(booking);
      toast.success('Booking bekræftet! Du vil modtage en faktura når bookingen er gennemført.');
      navigate('/booking-success');
    } catch (err: any) {
      setError(err.message || 'Der opstod en fejl under behandling af din bestilling');
      toast.error(err.message || 'Der opstod en fejl under behandling af din bestilling');
    } finally {
      setLoading(false);
    }
  };

  const handlePayCash = async () => {
    setLoading(true);
    setError(null);
    try {
      const booking = await createBookingWithCredits('pending', 'cash');
      await sendBookingConfirmationEmail(booking);
      toast.success('Booking bekræftet! Du betaler kontant ved optagelsen.');
      navigate('/booking-success');
    } catch (err: any) {
      setError(err.message || 'Der opstod en fejl under behandling af din bestilling');
      toast.error(err.message || 'Der opstod en fejl under behandling af din bestilling');
    } finally {
      setLoading(false);
    }
  };

  const createPaymentIntent = async () => {
    const userEmail = user?.email || bookingDetails.guestEmail;
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
            productId: bookingDetails.productId,
            productName: bookingDetails.productName,
            bookingDate: bookingDetails.bookingDate,
            bookingTime: bookingDetails.bookingTime,
            address: bookingDetails.address,
            includeEditing: bookingDetails.includeEditing,
            discountCodeId: null,
            discountAmount: 0,
            originalPrice: bookingDetails.totalPrice,
            creditsUsed: creditsToUse,
            guestEmail: !user ? bookingDetails.guestEmail : null,
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

  return (
    <div className="pt-24 pb-16">
      <div className="container">
        <div className="max-w-3xl mx-auto">
          <EditableContent
            contentKey="payment-page-title"
            as="h1"
            className="text-3xl font-bold mb-8"
            fallback="Gennemfør Din Booking"
          />

          {error && (
            <div className="bg-red-500/10 border border-red-500 text-red-500 rounded-lg p-4 mb-6">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
            <div className="lg:col-span-3">
              {user && credits > 0 && (
                <div className="bg-neutral-800 rounded-xl shadow-md p-6 mb-6 border border-neutral-700">
                  <EditableContent contentKey="credits_payment_section_title" as="h2" className="text-xl font-semibold mb-4 flex items-center" fallback="Brug Credits" />
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center">
                      <Coins size={20} className="text-primary mr-2" />
                      <span className="text-neutral-300 flex items-center gap-1">
                        <EditableContent contentKey="credits_payment_available_text" fallback="Tilgængelige credits:" />
                        <span className="font-semibold text-white">{credits}</span>
                      </span>
                    </div>
                  </div>
                  <div className="space-y-3 mb-4">
                    <label className="flex items-center">
                      <input type="radio" name="creditUsage" value="none" checked={creditUsageOption === 'none'} onChange={(e) => setCreditUsageOption(e.target.value as any)} className="mr-2" />
                      <EditableContent contentKey="credits_payment_option_none" fallback="Brug ikke credits" />
                    </label>
                    <label className="flex items-center">
                      <input type="radio" name="creditUsage" value="all" checked={creditUsageOption === 'all'} onChange={(e) => setCreditUsageOption(e.target.value as any)} className="mr-2" />
                      <span className="flex items-center gap-1">
                        <EditableContent contentKey="credits_payment_option_all" fallback="Brug alle tilgængelige credits" />
                        <span>({Math.min(credits, priceAfterDiscount)} <EditableContent contentKey="payment-page-credits" fallback="credits)" /></span>
                      </span>
                    </label>
                    <label className="flex items-center">
                      <input type="radio" name="creditUsage" value="custom" checked={creditUsageOption === 'custom'} onChange={(e) => setCreditUsageOption(e.target.value as any)} className="mr-2" />
                      <EditableContent contentKey="credits_payment_option_custom" fallback="Brug tilpasset antal credits" />
                    </label>
                    {creditUsageOption === 'custom' && (
                      <div className="ml-6">
                        <input
                          type="number"
                          value={customCreditsToUseInput}
                          onChange={(e) => setCustomCreditsToUseInput(e.target.value)}
                          placeholder="Antal credits"
                          min="0"
                          max={Math.min(credits, priceAfterDiscount)}
                          className="w-32 px-3 py-2 bg-neutral-700 border border-neutral-600 rounded-lg text-white"
                        />
                        <span className="ml-2 text-neutral-400"><EditableContent contentKey="payment-page-max" fallback="(max" /> {Math.min(credits, priceAfterDiscount)})</span>
                      </div>
                    )}
                  </div>
                  {creditsToUse > 0 && (
                    <div className="bg-neutral-700/50 rounded-lg p-4">
                      <div className="flex justify-between items-center mb-2">
                        <EditableContent contentKey="credits_payment_using_text" as="span" className="text-neutral-300" fallback="Bruger credits:" />
                        <span className="text-primary font-semibold">{creditsToUse}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <EditableContent contentKey="credits_payment_remaining_text" as="span" className="text-neutral-300" fallback="Credits tilbage:" />
                        <span className="text-neutral-300">{credits - creditsToUse}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="bg-neutral-800 rounded-xl shadow-md p-6 mb-6 border border-neutral-700">
                <EditableContent contentKey="payment-method-title" as="h2" className="text-xl font-semibold mb-4" fallback="Vælg Betalingsmetode" />
                <div className="space-y-4">
                  {canPayWithCreditsOnly && (
                    <div className="flex items-start space-x-3 p-4 border border-primary rounded-lg cursor-pointer hover:border-primary/80 transition-colors bg-primary/10">
                      <input type="radio" id="credits" name="payment_method" className="mt-1" checked={paymentMethod === 'credits'} onChange={() => setPaymentMethod('credits')} />
                      <div className="flex-1">
                        <EditableContent contentKey="payment-credits-option-title" as="label" className="font-medium cursor-pointer text-white" fallback="Betal med credits" />
                        <EditableContent contentKey="payment-credits-option-description" as="p" className="text-neutral-300 mt-1" fallback="Brug dine credits til at betale for hele bestillingen. Ingen yderligere betaling nødvendig." />
                        <div className="flex space-x-2 mt-2">
                          <Coins size={20} className="text-primary" />
                          <EditableContent contentKey="payment-credits-instant" as="span" className="text-sm text-primary" fallback="Øjeblikkelig betaling" />
                        </div>
                      </div>
                    </div>
                  )}

                  {finalPrice > 0 && (
                    <>
                      <div className="flex items-start space-x-3 p-4 border border-neutral-700 rounded-lg cursor-pointer hover:border-neutral-600 transition-colors bg-neutral-800/50">
                        <input type="radio" id="pay_now" name="payment_method" className="mt-1" checked={paymentMethod === 'pay_now'} onChange={() => setPaymentMethod('pay_now')} disabled={!stripeReady} required />
                        <div className="flex-1">
                          <EditableContent contentKey="payment-card-option-title" as="label" className="font-medium cursor-pointer text-white" fallback="Betal nu" />
                          <EditableContent contentKey="payment-card-option-description" as="p" className="text-neutral-300 mt-1" fallback="Sikker betaling via Stripe." />
                          <div className="flex space-x-2 mt-2">
                            <CreditCard size={20} className="text-neutral-400" />
                            <EditableContent contentKey="payment-card-types" as="span" className="text-sm text-neutral-400" fallback="Visa, Mastercard, Klarna o.a." />
                          </div>
                        </div>
                      </div>

                      <div className="flex items-start space-x-3 p-4 border border-neutral-700 rounded-lg cursor-pointer hover:border-neutral-600 transition-colors bg-neutral-800/50">
                        <input type="radio" id="pay_later" name="payment_method" className="mt-1" checked={paymentMethod === 'pay_later'} onChange={() => setPaymentMethod('pay_later')} />
                        <div>
                          <EditableContent contentKey="payment-invoice-option-title" as="label" className="font-medium cursor-pointer text-white" fallback="Betal efter optagelse" />
                          <EditableContent contentKey="payment-invoice-option-description" as="p" className="text-neutral-300 mt-1" fallback="Vi sender dig en faktura. Du kan betale, når du er tilfreds med resultatet – vi garanterer 100% tilfredshed!" />
                        </div>
                      </div>

                      <div className="flex items-start space-x-3 p-4 border border-neutral-700 rounded-lg cursor-pointer hover:border-neutral-600 transition-colors bg-neutral-800/50">
                        <input type="radio" id="pay_cash" name="payment_method" className="mt-1" checked={paymentMethod === 'cash'} onChange={() => setPaymentMethod('cash')} />
                        <div>
                          <EditableContent contentKey="payment-cash-option-title" as="label" className="font-medium cursor-pointer text-white" fallback="Betal med kort eller kontant ved optagelse" />
                          <EditableContent contentKey="payment-cash-option-description" as="p" className="text-neutral-300 mt-1" fallback="Du betaler med kort eller kontant ved optagelsen." />
                          <div className="flex space-x-2 mt-2">
                            <Banknote size={20} className="text-neutral-400" />
                            <EditableContent contentKey="payment-cash-types" as="span" className="text-sm text-neutral-400" fallback="Kontant eller kort" />
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {paymentMethod === 'pay_now' && finalPrice > 0 && stripeReady && stripePromise && (
                <div className="bg-neutral-800 rounded-xl shadow-md p-6 mb-6 border border-neutral-700">
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
                          colorBackground: '#404040',
                          colorText: '#ffffff',
                          colorDanger: '#ef4444',
                          fontFamily: '"Helvetica Neue", Helvetica, sans-serif',
                          spacingUnit: '4px',
                          borderRadius: '8px',
                        },
                      },
                    }}
                  >
                    <StripePaymentForm
                      amount={finalPrice}
                      customerName={customerName}
                      customerEmail={user?.email || bookingDetails.guestEmail || ''}
                      onCustomerNameChange={setCustomerName}
                      onSuccess={() => navigate('/booking-success')}
                      loading={loading}
                      setLoading={setLoading}
                      setError={setError}
                      createPaymentIntent={createPaymentIntent}
                      onPaymentComplete={handlePaymentComplete}
                      submitButtonText={`Betal ${finalPrice} kr${creditsToUse > 0 ? ` (${creditsToUse} credits + ${finalPrice} kr)` : ''}`}
                    />
                  </Elements>
                </div>
              )}

              {paymentMethod === 'pay_now' && finalPrice === 0 && (
                <div className="bg-neutral-800 rounded-xl shadow-md p-6 mb-6 border border-neutral-700">
                  <div className="bg-primary/10 border border-primary rounded-lg p-4 mb-4">
                    <div className="flex items-center">
                      <AlertCircle size={20} className="text-primary mr-2" />
                      <p className="text-white">
                        <EditableContent contentKey="payment-page-dit-beloeb-er-daekket-af" fallback="Dit beløb er dækket af credits. Vælg venligst &quot;Betal med credits&quot; betalingsmetoden nedenfor." />
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {paymentMethod !== 'pay_now' && (
                <div className="bg-neutral-800 rounded-xl shadow-md p-6 mb-6 border border-neutral-700">
                  <div className="min-h-[48px]">
                    <button
                      onClick={
                        paymentMethod === 'credits' ? handlePayWithCredits :
                        paymentMethod === 'pay_later' ? handlePayLater :
                        handlePayCash
                      }
                      className="w-full px-6 py-3 bg-neutral-800 text-white border border-neutral-700 font-medium rounded-lg hover:bg-neutral-700 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={loading}
                    >
                      {loading ? (
                        <span className="flex items-center justify-center">
                          <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          <EditableContent contentKey="payment-processing-text" fallback="Behandler..." />
                        </span>
                      ) : paymentMethod === 'credits' ? (
                        <EditableContent contentKey="credits_payment_pay_credits_button" fallback={`Betal med ${creditsToUse} credits`} />
                      ) : paymentMethod === 'pay_later' ? (
                        <EditableContent contentKey="payment-complete-booking-button" fallback="Gennemfør Booking" />
                      ) : (
                        <EditableContent contentKey="payment-cash-booking-button" fallback="Gennemfør Booking" />
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Order summary sidebar */}
            <div className="lg:col-span-2">
              <div className="bg-neutral-800 rounded-xl shadow-md p-6 sticky top-24 border border-neutral-700">
                <EditableContent contentKey="payment-order-summary-title" as="h2" className="text-xl font-semibold mb-4" fallback="Din booking" />
                <div className="space-y-4 mb-6">
                  <div className="flex justify-between">
                    <EditableContent contentKey="payment-summary-product-label" as="span" className="text-neutral-300" fallback="Produkt" />
                    <span className="text-white">{bookingDetails.productName}</span>
                  </div>
                  <div className="flex justify-between">
                    <EditableContent contentKey="payment-summary-date-label" as="span" className="text-neutral-300" fallback="Dato" />
                    <span className="text-white">{formatDate(bookingDetails.bookingDate)}</span>
                  </div>
                  <div className="flex justify-between">
                    <EditableContent contentKey="payment-summary-time-label" as="span" className="text-neutral-300" fallback="Tidspunkt" />
                    <span className="text-white">{formatTime(bookingDetails.bookingTime)}</span>
                  </div>
                  <div className="flex justify-between">
                    <EditableContent contentKey="payment-summary-address-label" as="span" className="text-neutral-300" fallback="Adresse" />
                    <span className="text-white text-right">{bookingDetails.address}</span>
                  </div>
                  <div className="flex justify-between">
                    <EditableContent contentKey="payment-summary-base-price-label" as="span" className="text-neutral-300" fallback="Basis pris" />
                    <span className="text-white">{bookingDetails.productPrice} <EditableContent contentKey="payment-page-kr-4" fallback="kr" /></span>
                  </div>

                  {/* Editing line: only show +100 kr if user paid for it (not if it was included in the product) */}
                  {editingIsPaidAddon && (
                    <div className="flex justify-between">
                      <EditableContent contentKey="payment-summary-editing-label" as="span" className="text-neutral-300" fallback="Redigering" />
                      <span className="text-white"><EditableContent contentKey="payment-page-100-kr" fallback="100 kr" /></span>
                    </div>
                  )}

                  {/* Show "Included" badge if editing came free with the product */}
                  {bookingDetails.isEditingIncluded && (
                    <div className="flex justify-between">
                      <EditableContent contentKey="payment-summary-editing-label" as="span" className="text-neutral-300" fallback="Redigering" />
                      <span className="text-green-400">
                        <EditableContent contentKey="payment-summary-editing-included" fallback="Inkluderet" />
                      </span>
                    </div>
                  )}

                  {creditsToUse > 0 && (
                    <div className="flex justify-between">
                      <EditableContent contentKey="payment-summary-credits-label" as="span" className="text-primary" fallback="Credits brugt" />
                      <span className="text-primary">-{creditsToUse} <EditableContent contentKey="payment-page-kr-3" fallback="kr" /></span>
                    </div>
                  )}
                </div>
                <div className="border-t border-neutral-700 pt-4 mb-4">
                  <div className="flex justify-between items-center">
                    <EditableContent contentKey="payment-summary-total-label" as="span" className="font-semibold text-white" fallback="Total" />
                    <div className="text-right">
                      {creditsToUse > 0 && (
                        <div className="text-sm text-neutral-400 line-through">{bookingDetails.totalPrice} <EditableContent contentKey="payment-page-kr-2" fallback="kr" /></div>
                      )}
                      <span className="text-xl font-bold text-white">{finalPrice} <EditableContent contentKey="payment-page-kr" fallback="kr" /></span>
                    </div>
                  </div>
                </div>
                <EditableContent contentKey="payment-terms-notice" as="p" className="text-sm text-neutral-400" fallback="Opsummering" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PaymentPage;
