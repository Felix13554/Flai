import EditableContent from '../components/EditableContent';
import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Mail, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

const UnsubscribePage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState<string>('');
  const [status, setStatus] = useState<'loading' | 'confirm' | 'success' | 'error' | 'not-found'>('loading');
  const [isUnsubscribing, setIsUnsubscribing] = useState(false);

  useEffect(() => {
    const emailParam = searchParams.get('email');
    if (emailParam) {
      setEmail(decodeURIComponent(emailParam));
      setStatus('confirm');
    } else {
      setStatus('not-found');
    }
  }, [searchParams]);

  const handleUnsubscribe = async () => {
    if (!email) return;

    setIsUnsubscribing(true);
    
    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/unsubscribe-newsletter`;
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (response.ok) {
        setStatus('success');
        toast.success('Du er nu afmeldt fra nyhedsbrevet');
      } else {
        throw new Error(data.error || 'Fejl ved afmelding');
      }
    } catch (error) {
      console.error('Unsubscribe error:', error);
      setStatus('error');
      toast.error('Der opstod en fejl ved afmelding. Prøv venligst igen.');
    } finally {
      setIsUnsubscribing(false);
    }
  };

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-neutral-900 flex items-center justify-center px-4">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-neutral-400"><EditableContent contentKey="unsubscribe-page-indlaeser" fallback="Indlæser..." /></p>
        </div>
      </div>
    );
  }

  if (status === 'not-found') {
    return (
      <div className="min-h-screen bg-neutral-900 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-neutral-800 rounded-xl shadow-md p-8 text-center border border-neutral-700">
          <XCircle className="w-16 h-16 text-error mx-auto mb-6" />
          <h1 className="text-2xl font-bold text-white mb-4">
            <EditableContent contentKey="unsubscribe-page-ugyldig-link" fallback="Ugyldig link" />
          </h1>
          <p className="text-neutral-300 mb-6">
            <EditableContent contentKey="unsubscribe-page-dette-afmeldingslink-er-ikke-gyldigt" fallback="Dette afmeldingslink er ikke gyldigt. Kontakt os venligst, hvis du har brug for hjælp med at afmelde dig fra nyhedsbrevet." />
          </p>
          <a href="/contact" className="btn-primary inline-block">
            <EditableContent contentKey="unsubscribe-page-kontakt-os-2" fallback="Kontakt os" />
          </a>
        </div>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className="min-h-screen bg-neutral-900 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-neutral-800 rounded-xl shadow-md p-8 text-center border border-neutral-700">
          <CheckCircle className="w-16 h-16 text-success mx-auto mb-6" />
          <h1 className="text-2xl font-bold text-white mb-4">
            <EditableContent contentKey="unsubscribe-page-afmelding-gennemfoert" fallback="Afmelding gennemført" />
          </h1>
          <p className="text-neutral-300 mb-2">
            <strong className="text-white">{email}</strong> <EditableContent contentKey="unsubscribe-page-er-nu-afmeldt-fra-vores" fallback="er nu afmeldt fra vores nyhedsbrev." />
          </p>
          <p className="text-neutral-300 mb-6">
            <EditableContent contentKey="unsubscribe-page-du-vil-ikke-laengere-modtage-2" fallback="Du vil ikke længere modtage emails fra os. Vi beklager at se dig forlade os!" />
          </p>
          <a href="/" className="btn-primary inline-block">
            <EditableContent contentKey="unsubscribe-page-tilbage-til-forsiden" fallback="Tilbage til forsiden" />
          </a>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen bg-neutral-900 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-neutral-800 rounded-xl shadow-md p-8 text-center border border-neutral-700">
          <XCircle className="w-16 h-16 text-error mx-auto mb-6" />
          <h1 className="text-2xl font-bold text-white mb-4">
            <EditableContent contentKey="unsubscribe-page-fejl-ved-afmelding" fallback="Fejl ved afmelding" />
          </h1>
          <p className="text-neutral-300 mb-6">
            <EditableContent contentKey="unsubscribe-page-der-opstod-en-fejl-ved" fallback="Der opstod en fejl ved afmelding af din email. Prøv venligst igen, eller kontakt os for hjælp." />
          </p>
          <div className="space-y-3">
            <button
              onClick={handleUnsubscribe}
              disabled={isUnsubscribing}
              className="btn-primary w-full"
            >
              <EditableContent contentKey="unsubscribe-page-proev-igen" fallback="Prøv igen" />
            </button>
            <a href="/contact" className="btn-secondary inline-block w-full">
              <EditableContent contentKey="unsubscribe-page-kontakt-os" fallback="Kontakt os" />
            </a>
          </div>
        </div>
      </div>
    );
  }

  // Confirm status
  return (
    <div className="min-h-screen bg-neutral-900 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-neutral-800 rounded-xl shadow-md p-8 text-center border border-neutral-700">
        <Mail className="w-16 h-16 text-primary mx-auto mb-6" />
        <h1 className="text-2xl font-bold text-white mb-4">
          <EditableContent contentKey="unsubscribe-page-afmeld-nyhedsbrev" fallback="Afmeld nyhedsbrev" />
        </h1>
        <p className="text-neutral-300 mb-2">
          <EditableContent contentKey="unsubscribe-page-er-du-sikker-paa-at" fallback="Er du sikker på, at du vil afmelde følgende email fra vores nyhedsbrev?" />
        </p>
        <p className="text-lg font-semibold text-white mb-6">
          {email}
        </p>
        <p className="text-sm text-neutral-400 mb-8">
          <EditableContent contentKey="unsubscribe-page-du-vil-ikke-laengere-modtage" fallback="Du vil ikke længere modtage opdateringer om nye produkter, tilbud og nyheder fra os." />
        </p>
        <div className="space-y-3">
          <button
            onClick={handleUnsubscribe}
            disabled={isUnsubscribing}
            className="btn-primary w-full flex items-center justify-center gap-2"
          >
            {isUnsubscribing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <EditableContent contentKey="unsubscribe-page-afmelder" fallback="Afmelder..." />
              </>
            ) : (
              'Ja, afmeld mig'
            )}
          </button>
          <a href="/" className="btn-secondary inline-block w-full">
            <EditableContent contentKey="unsubscribe-page-nej-behold-mig-paa-listen" fallback="Nej, behold mig på listen" />
          </a>
        </div>
      </div>
    </div>
  );
};

export default UnsubscribePage;
