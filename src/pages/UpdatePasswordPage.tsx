import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../utils/supabase';
import { Lock } from 'lucide-react';
import EditableContent from '../components/EditableContent';
import toast from 'react-hot-toast';

const UpdatePasswordPage = () => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Supabase sends the recovery token in the URL hash as:
    // #access_token=...&type=recovery
    // We need to let Supabase process it via onAuthStateChange
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setSessionReady(true);
        setVerifying(false);
      } else if (event === 'SIGNED_IN' && session) {
        setSessionReady(true);
        setVerifying(false);
      }
    });

    // Fallback: check if we already have a valid session (e.g. page refresh)
    const fallback = setTimeout(async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setSessionReady(true);
      } else {
        setError('Linket er ugyldigt eller udløbet. Anmod venligst om et nyt nulstillingslink.');
      }
      setVerifying(false);
    }, 3000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(fallback);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      setError('Adgangskoderne matcher ikke');
      return;
    }

    if (password.length < 6) {
      setError('Adgangskoden skal være mindst 6 tegn lang');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const { error } = await supabase.auth.updateUser({ password });

      if (error) throw error;

      toast.success('Din adgangskode er blevet opdateret');
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Kunne ikke opdatere adgangskode');
      toast.error('Kunne ikke opdatere adgangskode');
    } finally {
      setLoading(false);
    }
  };

  if (verifying) {
    return (
      <div className="pt-24 pb-16 min-h-screen bg-neutral-900">
        <div className="container max-w-md mx-auto">
          <div className="bg-neutral-800 rounded-xl shadow-md p-8 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-neutral-400"><EditableContent contentKey="update-password-page-bekraefter-nulstillingslink" fallback="Bekræfter nulstillingslink..." /></p>
          </div>
        </div>
      </div>
    );
  }

  if (!sessionReady) {
    return (
      <div className="pt-24 pb-16 min-h-screen bg-neutral-900">
        <div className="container max-w-md mx-auto">
          <div className="bg-neutral-800 rounded-xl shadow-md p-8 text-center">
            <div className="w-16 h-16 bg-error/10 text-error rounded-full flex items-center justify-center mx-auto mb-6">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold mb-4 text-white"><EditableContent contentKey="update-password-page-ugyldigt-link" fallback="Ugyldigt Link" /></h1>
            <p className="text-neutral-400 mb-6">{error}</p>
            <button
              onClick={() => navigate('/reset-password')}
              className="btn-primary"
            >
              <EditableContent contentKey="update-password-page-anmod-om-nyt-link" fallback="Anmod om nyt link" />
            </button>
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
            <EditableContent
              contentKey="update-password-page-title"
              as="h1"
              className="text-2xl font-bold text-white"
              fallback="Opdater Adgangskode"
            />
            <EditableContent
              contentKey="update-password-page-subtitle"
              as="p"
              className="text-neutral-400 mt-2"
              fallback="Indtast din nye adgangskode nedenfor"
            />
          </div>

          {error && (
            <div className="bg-error/10 border border-error text-error rounded-lg p-4 mb-6">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <EditableContent
                contentKey="update-password-new-password-label"
                as="label"
                className="form-label"
                fallback="Ny adgangskode"
              />
              <input
                type="password"
                id="password"
                className="form-input"
                placeholder="Mindst 6 tegn"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <div>
              <EditableContent
                contentKey="update-password-confirm-password-label"
                as="label"
                className="form-label"
                fallback="Bekræft ny adgangskode"
              />
              <input
                type="password"
                id="confirmPassword"
                className="form-input"
                placeholder="Gentag adgangskode"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
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
                  <EditableContent
                    contentKey="update-password-updating-text"
                    fallback="Opdaterer..."
                  />
                </span>
              ) : (
                <EditableContent
                  contentKey="update-password-button"
                  fallback="Opdater Adgangskode"
                />
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default UpdatePasswordPage;
