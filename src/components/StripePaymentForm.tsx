import React, { useState, useEffect, useRef } from 'react';
import {
  useStripe,
  useElements,
  PaymentElement,
} from '@stripe/react-stripe-js';
import EditableContent from './EditableContent';
import toast from 'react-hot-toast';

interface StripePaymentFormProps {
  amount: number;
  customerName: string;
  customerEmail?: string;
  onCustomerNameChange?: (name: string) => void;
  onSuccess: () => void;
  loading: boolean;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  createPaymentIntent: () => Promise<{ clientSecret: string; paymentIntentId: string }>;
  onPaymentComplete: (paymentIntentId: string) => Promise<void>;
  showNameField?: boolean;
  submitButtonText?: string;
}

const StripePaymentForm: React.FC<StripePaymentFormProps> = ({
  amount,
  customerName,
  customerEmail = '',
  onCustomerNameChange,
  onSuccess,
  loading,
  setLoading,
  setError,
  createPaymentIntent,
  onPaymentComplete,
  showNameField = true,
  submitButtonText,
}) => {
  const stripe = useStripe();
  const elements = useElements();
  const [cardholderName, setCardholderName] = useState(customerName || '');
  const [elementReady, setElementReady] = useState(false);
  const [elementLoadError, setElementLoadError] = useState(false);

  // Always holds the latest email — avoids stale closure in handleSubmit
  const customerEmailRef = useRef(customerEmail);
  useEffect(() => {
    customerEmailRef.current = customerEmail;
  }, [customerEmail]);

  useEffect(() => {
    if (customerName && !cardholderName) {
      setCardholderName(customerName);
    }
  }, [customerName]);

  useEffect(() => {
    if (onCustomerNameChange) {
      onCustomerNameChange(cardholderName);
    }
  }, [cardholderName, onCustomerNameChange]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!stripe || !elements) {
      toast.error('Betalingssystem ikke klar. Prøv igen om lidt.');
      return;
    }

    if (showNameField && !cardholderName.trim()) {
      toast.error('Indtast venligst kortholders navn');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { error: submitError } = await elements.submit();
      if (submitError) throw new Error(submitError.message);

      const { clientSecret, paymentIntentId } = await createPaymentIntent();

      // Always read email from the ref so we get the latest value even if the
      // user edited the email field after the Stripe Elements component mounted.
      const currentEmail = customerEmailRef.current;

      const { error: stripeError } = await stripe.confirmPayment({
        elements,
        clientSecret,
        confirmParams: {
          return_url: `${window.location.origin}/booking-success?payment_intent=${paymentIntentId}`,
          payment_method_data: {
            billing_details: {
              name: cardholderName,
              ...(currentEmail ? { email: currentEmail } : {}),
            },
          },
        },
        redirect: 'if_required',
      });

      if (stripeError) throw new Error(stripeError.message);

      await onPaymentComplete(paymentIntentId);

      toast.success('Betaling gennemført!');
      onSuccess();
    } catch (err: any) {
      const errorMessage = err.message || 'Der opstod en fejl ved oprettelse af betalingen';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {showNameField && (
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
      )}

      <div className="mb-4">
        <label className="block text-sm font-medium text-neutral-300 mb-2">
          <EditableContent
            contentKey="payment-method-selection-label"
            fallback="Vælg betalingsmetode"
          />
        </label>

        {/* Loading skeleton — shown until PaymentElement fires onReady */}
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

        {/* Brave / shield blocker warning */}
        {elementLoadError && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-300 space-y-2">
            <div className="flex items-start gap-2">
              <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
              <div>
                <p className="font-medium text-amber-200"><EditableContent contentKey="stripe-payment-form-betalingsformular-kunne-ikke-indlaeses" fallback="Betalingsformular kunne ikke indlæses" /></p>
                <p className="mt-1 text-amber-300/80">
                  <EditableContent contentKey="stripe-payment-form-din-browser-blokerer-muligvis-betalingsvinduet" fallback="Din browser blokerer muligvis betalingsvinduet. Prøv at slå skjold/shields fra for dette site, eller åbn siden i Chrome eller Safari." />
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => { setElementLoadError(false); setElementReady(false); window.location.reload(); }}
              className="mt-2 text-xs underline text-amber-300 hover:text-amber-100"
            >
              <EditableContent contentKey="stripe-payment-form-proev-igen" fallback="Prøv igen" />
            </button>
          </div>
        )}

        {/*
          Seed defaultValues with the email on first mount so Stripe Link can
          recognise returning customers. Email changes after mount are handled
          via customerEmailRef and applied at confirmPayment time.
          All wallets stay on 'auto' — Stripe decides per-browser what's available.
        */}
        <div className={elementReady ? 'block' : 'hidden'}>
          <PaymentElement
            onReady={() => setElementReady(true)}
            onLoadError={() => { setElementLoadError(true); setElementReady(false); }}
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
            submitButtonText || (
              <EditableContent
                contentKey="payment-pay-now-button"
                fallback={`Betal ${amount} kr`}
              />
            )
          )}
        </button>
      </div>
    </form>
  );
};

export default StripePaymentForm;
