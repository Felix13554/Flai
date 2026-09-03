// DonationPage.tsx
import EditableContent from '../components/EditableContent';
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../utils/supabase';
import { DonationLink } from './index';
import { CreditCard, AlertCircle, CheckCircle } from 'lucide-react';
import toast from 'react-hot-toast';

const DonationPage: React.FC = () => {
  const { linkId } = useParams<{ linkId: string }>();
  const navigate = useNavigate();
  const [donationLink, setDonationLink] = useState<DonationLink | null>(null);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState('');
  const [processing, setProcessing] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    loadDonationLink();
  }, [linkId]);

  const loadDonationLink = async () => {
    try {
      setLoading(true);

      if (!linkId) {
        throw new Error('Betalingslink ID mangler');
      }

      let query = supabase
        .from('donation_links')
        .select('*');

      if (linkId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
        query = query.eq('id', linkId);
      } else {
        query = query.eq('slug', linkId);
      }

      const { data, error } = await query.maybeSingle();

      if (error) throw error;
      if (!data) {
        throw new Error('Betalingslink ikke fundet');
      }
      if (!data.is_active) {
        throw new Error('Dette betalingslink er ikke aktivt');
      }

      setDonationLink(data);
    } catch (err: any) {
      console.error('Error loading donation link:', err);
      toast.error(err.message || 'Fejl ved indlæsning af betalingslink');
    } finally {
      setLoading(false);
    }
  };

  const handleDonate = async (e: React.FormEvent) => {
    e.preventDefault();

    const donationAmount = parseInt(amount);
    const minAmount = donationLink?.min_amount || 10;
    if (!donationAmount || donationAmount < minAmount) {
      toast.error(`Minimumsbeløb er ${minAmount} kr`);
      return;
    }

    try {
      setProcessing(true);

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-donation-checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          donationLinkId: linkId,
          amount: donationAmount,
        }),
      });

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      window.location.href = data.url;
    } catch (err: any) {
      console.error('Error creating donation checkout:', err);
      toast.error(err.message || 'Fejl ved oprettelse af betaling');
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="pt-24 pb-16 min-h-screen">
        <div className="container max-w-md mx-auto">
          <div className="bg-neutral-800 rounded-xl shadow-md p-8 text-center">
            <p className="text-neutral-400"><EditableContent contentKey="donation-page-indlaeser" fallback="Indlæser..." /></p>
          </div>
        </div>
      </div>
    );
  }

  if (!donationLink) {
    return (
      <div className="pt-24 pb-16 min-h-screen">
        <div className="container max-w-md mx-auto">
          <div className="bg-neutral-800 rounded-xl shadow-md p-8 text-center border border-neutral-700">
            <AlertCircle size={48} className="text-red-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold mb-4 text-white"><EditableContent contentKey="donation-page-betalingslink-ikke-tilgaengeligt" fallback="Betalingslink ikke tilgængeligt" /></h1>
            <p className="text-neutral-400 mb-6"><EditableContent contentKey="donation-page-dette-betalingslink-er-ikke-aktivt" fallback="Dette betalingslink er ikke aktivt eller eksisterer ikke." /></p>
            <button
              onClick={() => navigate('/')}
              className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
            >
              <EditableContent contentKey="donation-page-tilbage-til-forsiden-2" fallback="Tilbage til forsiden" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="pt-24 pb-16 min-h-screen">
        <div className="container max-w-md mx-auto">
          <div className="bg-neutral-800 rounded-xl shadow-md p-8 text-center border border-neutral-700">
            <CheckCircle size={48} className="text-green-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold mb-4 text-white"><EditableContent contentKey="donation-page-betaling-gennemfoert" fallback="Betaling gennemført!" /></h1>
            <p className="text-neutral-400 mb-6"><EditableContent contentKey="donation-page-din-betaling-er-modtaget" fallback="Din betaling er modtaget." /></p>
            <button
              onClick={() => navigate('/')}
              className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
            >
              <EditableContent contentKey="donation-page-tilbage-til-forsiden" fallback="Tilbage til forsiden" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pt-24 pb-16 min-h-screen">
      <div className="container max-w-md mx-auto">
        <div className="bg-neutral-800 rounded-xl shadow-md p-8 border border-neutral-700">
          <div className="flex justify-center mb-6">
            <CreditCard size={48} className="text-primary" />
          </div>

          <h1 className="text-2xl font-bold text-center mb-6 text-white">{donationLink.title}</h1>

          {donationLink.description && (
            <div className="bg-neutral-700/20 rounded-lg p-4 mb-6">
              <p className="text-neutral-300 text-sm text-center">{donationLink.description}</p>
            </div>
          )}

          <form onSubmit={handleDonate} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-2">
                <EditableContent contentKey="donation-page-beloeb" fallback="Beløb (" />{donationLink.currency})
              </label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={String(donationLink.min_amount)}
                min={donationLink.min_amount}
                step="10"
                className="w-full px-4 py-2 bg-neutral-700 border border-neutral-600 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:border-primary"
              />
              <p className="text-xs text-neutral-400 mt-1"><EditableContent contentKey="donation-page-minimum" fallback="Minimum" /> {donationLink.min_amount} {donationLink.currency}</p>
            </div>

            <button
              type="submit"
              disabled={processing || !amount}
              className="w-full px-4 py-3 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-semibold"
            >
              {processing ? 'Behandler...' : `Betal ${amount ? amount + ' kr' : ''}`}
            </button>
          </form>

          <p className="text-xs text-neutral-400 text-center mt-4">
            <EditableContent contentKey="donation-page-betalingen-behandles-sikkert-via-stripe" fallback="Betalingen behandles sikkert via Stripe" />
          </p>
        </div>
      </div>
    </div>
  );
};

export default DonationPage;
