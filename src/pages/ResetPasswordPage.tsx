import EditableContent from '../components/EditableContent';
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../utils/supabase';
import { Lock } from 'lucide-react';
import toast from 'react-hot-toast';

const ResetPasswordPage = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email) {
      setError('Indtast venligst din email adresse');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/update-password`,
      });

      if (error) throw error;

      setSuccess(true);
      toast.success('Email med nulstilling af adgangskode er sendt');
      
      // Redirect to login after 3 seconds
      setTimeout(() => {
        navigate('/login');
      }, 3000);
    } catch (err: any) {
      setError('Kunne ikke sende email. Kontroller at emailadressen er korrekt.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="pt-24 pb-16 min-h-screen bg-neutral-900">
        <div className="container max-w-md mx-auto">
          <div className="bg-neutral-800 rounded-xl shadow-md p-8 text-center">
            <div className="w-16 h-16 bg-success/10 text-success rounded-full flex items-center justify-center mx-auto mb-6">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold mb-4 text-white"><EditableContent contentKey="reset-password-page-email-sendt" fallback="Email Sendt!" /></h1>
            <p className="text-neutral-400 mb-6">
              <EditableContent contentKey="reset-password-page-check-din-email-for-instruktioner" fallback="Check din email for instruktioner om nulstilling af adgangskode." />
            </p>
            <p className="text-neutral-500">
              <EditableContent contentKey="reset-password-page-du-omdirigeres-til-login-siden" fallback="Du omdirigeres til login-siden..." />
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pt-24 pb-16 min-h-screen bg-neutral-900">
      <div className="container max-w-md mx-auto">
        <div className="bg-neutral-800 rounded-xl shadow-md p-8">
          <div className="text-center mb-8">
            <Lock size={40} className="text-primary mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-white"><EditableContent contentKey="reset-password-page-nulstil-adgangskode" fallback="Nulstil Adgangskode" /></h1>
            <p className="text-neutral-400 mt-2">
              <EditableContent contentKey="reset-password-page-indtast-din-email-for-at" fallback="Indtast din email for at nulstille din adgangskode" />
            </p>
          </div>

          {error && (
            <div className="bg-error/10 border border-error text-error rounded-lg p-4 mb-6">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="email" className="form-label"><EditableContent contentKey="reset-password-page-email" fallback="Email" /></label>
              <input
                type="email"
                id="email"
                className="form-input"
                placeholder="din@email.dk"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <button
              type="submit"
              className="btn-primary w-full"
              disabled={loading}
            >
              {loading ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <EditableContent contentKey="reset-password-page-sender" fallback="Sender..." />
                </span>
              ) : 'Send Nulstillingslink'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ResetPasswordPage;