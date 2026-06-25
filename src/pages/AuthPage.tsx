import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { Mail, Lock, UserPlus, LogIn, Eye, EyeOff, ArrowLeft, CheckCircle, User, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import EditableContent from '../components/EditableContent';
import GoogleLoginButton from '../components/GoogleLoginButton';
import { supabase } from '../utils/supabase';
import toast from 'react-hot-toast';

// idle     = email not yet typed / not valid
// checking = querying profiles table
// login    = email found in profiles → existing account
// signup   = email not found in profiles → new account
type Mode = 'idle' | 'checking' | 'login' | 'signup';
type Step = 'options' | 'form' | 'done';

const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

const AuthPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn, signUp, user } = useAuth();

  const [step, setStep]                       = useState<Step>('options');
  const [mode, setMode]                       = useState<Mode>('idle');
  const [email, setEmail]                     = useState('');
  const [fullName, setFullName]               = useState('');
  const [password, setPassword]               = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword]       = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading]                 = useState(false);
  const [error, setError]                     = useState('');

  const searchParams = new URLSearchParams(location.search);
  const redirectUrl  = searchParams.get('redirect') || '/';

  const debounceRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const passwordRef  = useRef<HTMLInputElement>(null);
  const nameRef      = useRef<HTMLInputElement>(null);

  useEffect(() => { if (user) navigate(redirectUrl); }, [user, navigate, redirectUrl]);

  // Auto-focus the right field once mode is resolved
  useEffect(() => {
    if (mode === 'login')  setTimeout(() => passwordRef.current?.focus(), 50);
    if (mode === 'signup') setTimeout(() => nameRef.current?.focus(), 50);
  }, [mode]);

  // Query profiles table — no email sent, no side effects
  const checkEmail = useCallback(async (value: string) => {
    setMode('checking');
    setError('');
    try {
      const { data, error: dbError } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', value)
        .maybeSingle();

      if (dbError) {
        // If query fails fall back to signup so user can still create account
        setMode('signup');
        return;
      }
      setMode(data ? 'login' : 'signup');
    } catch {
      setMode('signup');
    }
  }, []);

  // Debounce: check 600ms after user stops typing a valid email
  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setEmail(value);
    setError('');
    setPassword('');
    setConfirmPassword('');
    setMode('idle');

    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (isValidEmail(value)) {
      debounceRef.current = setTimeout(() => checkEmail(value), 600);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (mode === 'login') {
      if (!password) { setError('Indtast venligst din adgangskode'); return; }
      setLoading(true);
      const { error: signInError } = await signIn(email, password);
      if (signInError) {
        if (signInError.message.includes('Invalid login credentials')) setError('Forkert adgangskode');
        else if (signInError.message.includes('Email not confirmed')) setError('Email er ikke bekræftet. Tjek din indbakke.');
        else setError(signInError.message);
        setLoading(false);
        return;
      }
      toast.success('Velkommen tilbage!');
      navigate(redirectUrl);

    } else if (mode === 'signup') {
      if (!fullName.trim())             { setError('Indtast venligst dit navn'); return; }
      if (!password)                    { setError('Vælg venligst en adgangskode'); return; }
      if (password.length < 6)          { setError('Adgangskoden skal være mindst 6 tegn'); return; }
      if (password !== confirmPassword) { setError('Adgangskoderne matcher ikke'); return; }
      setLoading(true);
      const { error: signUpError } = await signUp(email, password, redirectUrl, fullName.trim());
      if (signUpError) {
        setError(signUpError.message);
        setLoading(false);
        return;
      }
      setLoading(false);
      setStep('done');
    }
  };

  const goBack = () => {
    setStep('options');
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setFullName('');
    setError('');
    setMode('idle');
    if (debounceRef.current) clearTimeout(debounceRef.current);
  };

  const inputClass = [
    'w-full bg-neutral-900 border border-neutral-700 rounded-lg py-2.5 text-white',
    'placeholder-neutral-600 transition-colors [color-scheme:dark]',
    'focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30',
  ].join(' ');

  // ── Confirmation screen ───────────────────────────────────────────────────
  if (step === 'done') {
    return (
      <div className="min-h-screen pt-24 pb-16 bg-neutral-900">
        <div className="container max-w-md mx-auto">
          <div className="bg-neutral-800 rounded-xl shadow-lg p-8 border border-neutral-700 text-center">
            <div className="flex justify-center mb-5">
              <div className="w-16 h-16 rounded-full bg-green-500/15 border border-green-500/30 flex items-center justify-center">
                <CheckCircle size={32} className="text-green-400" />
              </div>
            </div>
            <EditableContent contentKey="auth-confirm-title" as="h2"
              className="text-2xl font-bold text-white mb-2" fallback="Bekræft din email" />
            <EditableContent contentKey="auth-confirm-sent" as="p"
              className="text-neutral-400 text-sm mb-1" fallback="Vi har sendt en bekræftelsesmail til" />
            <p className="text-white font-semibold mb-4">{email}</p>
            <EditableContent contentKey="auth-confirm-instructions" as="p"
              className="text-neutral-400 text-sm mb-8"
              fallback="Klik på linket i mailen for at aktivere din konto. Tjek også din spam-mappe, hvis du ikke kan finde den." />
            <button
              onClick={() => { setStep('form'); setMode('login'); setPassword(''); setConfirmPassword(''); }}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-primary text-white rounded-lg font-medium hover:bg-primary/90 transition-colors"
            >
              <LogIn size={18} />
              <EditableContent contentKey="auth-confirm-back-btn" as="span" fallback="Tilbage til login" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-24 pb-16 bg-neutral-900">
      <div className="container max-w-md mx-auto">
        <div className="bg-neutral-800 rounded-xl shadow-lg border border-neutral-700 overflow-hidden">

          <div className="px-8 pt-8 pb-6">
            <EditableContent contentKey="auth-page-title" as="h1"
              className="text-2xl font-bold text-center text-white mb-1" fallback="Log ind" />
            <EditableContent contentKey="auth-page-subtitle" as="p"
              className="text-neutral-400 text-center text-sm"
              fallback="Log ind eller opret en konto for at fortsætte" />
          </div>

          <div className="px-8 pb-8">

            {/* ── Options ─────────────────────────────────────────────────── */}
            {step === 'options' && (
              <div className="space-y-3">
                <div className="relative">
                  <GoogleLoginButton
                    redirectTo={`${window.location.origin}${redirectUrl}`}
                    buttonText="Fortsæt med Google"
                  />
                  <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-primary text-white text-[10px] font-semibold px-2.5 py-0.5 rounded-full uppercase tracking-wider whitespace-nowrap pointer-events-none">
                    <EditableContent contentKey="auth-google-badge" as="span" fallback="Anbefalet" />
                  </span>
                </div>

                <div className="flex items-center gap-3 py-1">
                  <div className="flex-1 border-t border-neutral-700" />
                  <EditableContent contentKey="auth-or-divider" as="span"
                    className="text-xs text-neutral-600 uppercase tracking-wider" fallback="eller" />
                  <div className="flex-1 border-t border-neutral-700" />
                </div>

                <button
                  onClick={() => setStep('form')}
                  className="w-full flex items-center justify-center gap-2.5 px-6 py-3 bg-neutral-700 text-neutral-200 rounded-lg font-medium hover:bg-neutral-600 transition-colors border border-neutral-600"
                >
                  <Mail size={18} />
                  <EditableContent contentKey="auth-email-btn" as="span" fallback="Fortsæt med Email" />
                </button>
              </div>
            )}

            {/* ── Form ────────────────────────────────────────────────────── */}
            {step === 'form' && (
              <form onSubmit={handleSubmit} className="space-y-4">

                {error && (
                  <p className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg text-sm">
                    {error}
                  </p>
                )}

                {/* Email — always shown, with live status indicator */}
                <div>
                  <EditableContent contentKey="auth-label-email" as="label"
                    className="block text-sm font-medium text-neutral-400 mb-1.5" fallback="Email" />
                  <div className="relative">
                    <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-600 pointer-events-none" />
                    <input
                      type="email" value={email} autoFocus disabled={loading}
                      onChange={handleEmailChange}
                      className={`${inputClass} pl-9 pr-9`}
                      placeholder="din@email.dk"
                    />
                    {/* Status indicator inside email field */}
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                      {mode === 'checking' && <Loader2 size={15} className="animate-spin text-neutral-500" />}
                      {mode === 'login'    && <CheckCircle size={15} className="text-green-500" />}
                      {mode === 'signup'   && <UserPlus size={15} className="text-primary" />}
                    </div>
                  </div>
                  {/* Hint text below email */}
                  {mode === 'login' && (
                    <EditableContent contentKey="auth-hint-existing" as="p"
                      className="text-xs text-neutral-600 mt-1.5"
                      fallback="Konto fundet — indtast din adgangskode" />
                  )}
                  {mode === 'signup' && (
                    <EditableContent contentKey="auth-hint-new" as="p"
                      className="text-xs text-neutral-600 mt-1.5"
                      fallback="Ingen konto fundet — udfyld felterne herunder" />
                  )}
                </div>

                {/* Signup only: full name */}
                {mode === 'signup' && (
                  <div>
                    <EditableContent contentKey="auth-label-name" as="label"
                      className="block text-sm font-medium text-neutral-400 mb-1.5" fallback="Fulde navn" />
                    <div className="relative">
                      <User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-600 pointer-events-none" />
                      <input
                        ref={nameRef}
                        type="text" value={fullName} required disabled={loading}
                        onChange={(e) => setFullName(e.target.value)}
                        className={`${inputClass} pl-9 pr-4`}
                        placeholder="Dit fulde navn"
                      />
                    </div>
                  </div>
                )}

                {/* Password — shown once mode is login or signup */}
                {(mode === 'login' || mode === 'signup') && (
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <EditableContent
                        contentKey={mode === 'login' ? 'auth-label-password' : 'auth-label-choose-password'}
                        as="label" className="block text-sm font-medium text-neutral-400"
                        fallback={mode === 'login' ? 'Adgangskode' : 'Vælg adgangskode'} />
                      {mode === 'login' && (
                        <Link to="/reset-password" className="text-xs text-neutral-500 hover:text-primary transition-colors">
                          <EditableContent contentKey="auth-forgot-password" as="span" fallback="Glemt adgangskode?" />
                        </Link>
                      )}
                    </div>
                    <div className="relative">
                      <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-600 pointer-events-none" />
                      <input
                        ref={passwordRef}
                        type={showPassword ? 'text' : 'password'} value={password} required disabled={loading}
                        onChange={(e) => setPassword(e.target.value)}
                        className={`${inputClass} pl-9 pr-10`}
                        placeholder={mode === 'signup' ? 'Mindst 6 tegn' : '••••••••'}
                      />
                      <button type="button" onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-600 hover:text-neutral-400 transition-colors">
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                )}

                {/* Signup only: confirm password */}
                {mode === 'signup' && (
                  <div>
                    <EditableContent contentKey="auth-label-confirm-password" as="label"
                      className="block text-sm font-medium text-neutral-400 mb-1.5" fallback="Bekræft adgangskode" />
                    <div className="relative">
                      <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-600 pointer-events-none" />
                      <input
                        type={showConfirmPassword ? 'text' : 'password'} value={confirmPassword} required disabled={loading}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className={`${inputClass} pl-9 pr-10`}
                        placeholder="••••••••"
                      />
                      <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-600 hover:text-neutral-400 transition-colors">
                        {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                )}

                {/* Submit — only when mode is resolved */}
                {(mode === 'login' || mode === 'signup') && (
                  <button type="submit" disabled={loading}
                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-primary text-white rounded-lg font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors !mt-5">
                    {loading
                      ? <><Loader2 size={17} className="animate-spin" /><EditableContent contentKey="auth-btn-processing" as="span" fallback="Behandler..." /></>
                      : mode === 'login'
                        ? <><LogIn size={17} /><EditableContent contentKey="auth-btn-login" as="span" fallback="Log ind" /></>
                        : <><UserPlus size={17} /><EditableContent contentKey="auth-btn-signup" as="span" fallback="Opret konto" /></>
                    }
                  </button>
                )}

                <button type="button" onClick={goBack}
                  className="w-full flex items-center justify-center gap-1.5 text-sm text-neutral-600 hover:text-neutral-400 transition-colors mt-2">
                  <ArrowLeft size={14} />
                  <EditableContent contentKey="auth-btn-back" as="span" fallback="Tilbage" />
                </button>
              </form>
            )}

          </div>
        </div>

        <EditableContent contentKey="auth-page-footer-text" as="p"
          className="text-center text-neutral-600 text-xs mt-5"
          fallback="Ved at fortsætte accepterer du vores servicevilkår og privatlivspolitik" />
      </div>
    </div>
  );
};

export default AuthPage;