import React, { useEffect, useRef, useState } from 'react';
import {
  PaymentElement,
  useElements,
  useStripe,
} from '@stripe/react-stripe-js';
import EditableContent from '../components/EditableContent';
import toast from 'react-hot-toast';

export interface MerchStripePaymentFormProps {
  amount: number;
  customerName: string;
  customerEmail: string;
  onSuccess: () => void;
  // Added the same state props as the normal form
  loading: boolean;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  createPaymentIntent: () => Promise<{ clientSecret: string; paymentIntentId: string }>;
  onPaymentComplete: (paymentIntentId: string) => Promise<void>;
}

const MerchStripePaymentForm: React.FC<MerchStripePaymentFormProps> = ({
  amount,
  customerName,
  customerEmail,
  onSuccess,
  loading,
  setLoading,
  setError,
  createPaymentIntent,
  onPaymentComplete,
}) => {
  const stripe = useStripe();
  const elements = useElements();

  const [cardholderName, setCardholderName] = useState(customerName || '');
  const [elementReady, setElementReady] = useState(false);
  const[elementLoadError, setElementLoadError] = useState(false);

  // Always read the latest email without causing PaymentElement to remount
  const customerEmailRef = useRef(customerEmail);
  useEffect(() => {
    customerEmailRef.current = customerEmail;
  }, [customerEmail]);

  // Sync name from parent when pre-filled
  useEffect(() => {
    if (customerName && !cardholderName) {
      setCardholderName(customerName);
    }
  }, [customerName]); 

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      toast.error('Betalingssystem ikke klar. Prøv igen om lidt.');
      return;
    }

    if (!cardholderName.trim()) {
      toast.error('Indtast venligst kortholders navn');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // 1. Validate Stripe Elements locally
      const { error: submitError } = await elements.submit();
      if (submitError) throw new Error(submitError.message);

      // 2. Create Payment Intent on backend
      const { clientSecret, paymentIntentId } = await createPaymentIntent();

      // 3. Confirm payment
      const { error: stripeError } = await stripe.confirmPayment({
        elements,
        clientSecret,
        confirmParams: {
          return_url: `${window.location.origin}/booking-success?payment_intent=${paymentIntentId}`,
          payment_method_data: {
            billing_details: {
              name: cardholderName,
              ...(customerEmailRef.current ? { email: customerEmailRef.current } : {}),
            },
          },
        },
        redirect: 'if_required',
      });

      if (stripeError) throw new Error(stripeError.message);

      // 4. Persist order in DB
      await onPaymentComplete(paymentIntentId);

      toast.success('Betaling gennemført!');
      onSuccess();
    } catch (err: any) {
      const msg = err.message || 'Der opstod en fejl ved oprettelse af betalingen';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* Cardholder name */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-neutral-300 mb-2">
          <EditableContent
            contentKey="payment-cardholder-name-label"
            fallback="Kortholders navn"
          />
        </label>
        <input
          type="text"
          value={cardholderName}
          onChange={(e) => setCardholderName(e.target.value)}
          placeholder="John Doe"
          className="w-full px-4 py-3 bg-neutral-700 border border-neutral-600 rounded-lg text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
          required
        />
      </div>

      {/* Payment method */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-neutral-300 mb-2">
          <EditableContent
            contentKey="payment-method-selection-label"
            fallback="Vælg betalingsmetode"
          />
        </label>

        {/* Loading skeleton */}
        {!elementReady && !elementLoadError && (
          <div className="rounded-lg border border-neutral-600 bg-neutral-700/50 p-4 space-y-3 animate-pulse">
            <div className="h-4 w-1/3 rounded bg-neutral-600" />
            <div className="h-10 rounded bg-neutral-600" />
            <div className="flex gap-3">
              <div className="h-10 flex-1 rounded bg-neutral-600" />
              <div className="h-10 flex-1 rounded bg-neutral-600" />
            </div>
          </div>
        )}

        {/* Browser shield / blocker warning */}
        {elementLoadError && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-300 space-y-2">
            <div className="flex items-start gap-2">
              <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
              <div>
                <p className="font-medium text-amber-200"><EditableContent contentKey="merch-stripe-payment-form-betalingsformular-kunne-ikke-indlaeses" fallback="Betalingsformular kunne ikke indlæses" /></p>
                <p className="mt-1 text-amber-300/80">
                  <EditableContent contentKey="merch-stripe-payment-form-din-browser-blokerer-muligvis-betalingsvinduet" fallback="Din browser blokerer muligvis betalingsvinduet. Prøv at slå skjold/shields fra for dette                   site, eller åbn siden i Chrome eller Safari." />
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setElementLoadError(false);
                setElementReady(false);
                window.location.reload();
              }}
              className="mt-2 text-xs underline text-amber-300 hover:text-amber-100"
            >
              <EditableContent contentKey="merch-stripe-payment-form-proev-igen" fallback="Prøv igen" />
            </button>
          </div>
        )}

        <div className={elementReady ? 'block' : 'hidden'}>
          <PaymentElement
            onReady={() => setElementReady(true)}
            onLoadError={() => {
              setElementLoadError(true);
              setElementReady(false);
            }}
            options={{
              layout: { type: 'tabs', defaultCollapsed: false },
              defaultValues: {
                billingDetails: {
                  name: cardholderName,
                  ...(customerEmail ? { email: customerEmail } : {}),
                },
              },
              wallets: {
                applePay: 'auto',
                googlePay: 'auto',
              },
            }}
          />
        </div>
      </div>

      {/* Submit */}
      <div className="min-h-[48px]">
        <button
          type="submit"
          disabled={!stripe || loading || !elementReady}
          className="w-full px-6 py-3 bg-neutral-800 text-white border border-neutral-700 font-medium rounded-lg hover:bg-neutral-700 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <span className="flex items-center justify-center">
              <svg
                className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              <EditableContent contentKey="payment-processing-text" fallback="Behandler..." />
            </span>
          ) : (
            <EditableContent
              contentKey="payment-pay-now-button"
              fallback={`Betal ${amount} kr`}
            />
          )}
        </button>
      </div>
    </form>
  );
};

export default MerchStripePaymentForm;
