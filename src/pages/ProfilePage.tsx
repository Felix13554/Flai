import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import SEO from '../components/SEO';
import {
  Calendar, Clock, MapPin, Edit, Star, Download,
  Coins, CreditCard, Camera, Lock, Trash2, Tag, FileText,
  Eye, EyeOff, RefreshCw, Share2, User, Info,
  ChevronDown, ChevronUp
} from 'lucide-react';
import { formatDate, formatTime } from '../utils/booking';
import EditableContent from '../components/EditableContent';
import { supabase } from '../utils/supabase';
import toast from 'react-hot-toast';

const GOOGLE_REVIEW_URL =
  'https://www.google.com/search?hl=da-DK&gl=dk&q=Flai,+Kringsager+36,+6000+Kolding&ludocid=8867645150835786564&lsig=AB86z5VmZcarOVjwuiG3MM6T3H-m#lrd=0xdb90508976492ab:0x7b10344829c84344,3';

const ensureHttps = (url: string): string => {
  if (!url) return url;
  if (/^https?:\/\//i.test(url)) return url;
  return `https://${url}`;
};

const ProfilePage: React.FC = () => {
  const { user, signOut, credits } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Bookings fetched directly so we control the join
  const [bookings, setBookings] = useState<any[]>([]);
  const [loadingBookings, setLoadingBookings] = useState(true);
  const [bookingsError, setBookingsError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'bookings' | 'settings'>('bookings');
  const [bookingFilter, setBookingFilter] = useState<'all' | 'confirmed' | 'completed'>('all');
  const [collapsedBookings, setCollapsedBookings] = useState<Set<number>>(new Set());

  // Settings
  const [activeSettingsSection, setActiveSettingsSection] = useState<'profile' | 'security'>('profile');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // ─── Fetch bookings with product name via join ────────────────────────────

  const fetchBookings = useCallback(async () => {
    if (!user?.id) return;
    setLoadingBookings(true);
    setBookingsError(null);
    try {
      const { data, error } = await supabase
        .from('bookings')
        .select(`
          id,
          booking_date,
          booking_time,
          address,
          include_editing,
          payment_status,
          payment_method,
          is_completed,
          price,
          original_price,
          discount_amount,
          credits_used,
          zip_file_url,
          share_project_url,
          send_invoice_on_completion,
          mode,
          products ( name )
        `)
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .order('booking_date', { ascending: false });

      if (error) throw error;

      // Flatten product name onto each booking
      const enriched = (data || []).map((b: any) => ({
        ...b,
        product_name: b.products?.name ?? '',
      }));
      setBookings(enriched);
    } catch (err: any) {
      setBookingsError(err.message || 'Kunne ikke hente bookinger');
    } finally {
      setLoadingBookings(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  useEffect(() => {
    if (user) {
      const meta = user.user_metadata || {};
      setAvatarUrl(meta.avatar_url || null);
      setDisplayName(meta.display_name || meta.full_name || '');
    }
  }, [user]);

  useEffect(() => {
    const sessionId = searchParams.get('session_id');
    const creditsPurchased = searchParams.get('credits_purchased');
    if (sessionId) {
      toast.success('Betaling gennemført! Din booking er bekræftet.');
      window.history.replaceState({}, '', window.location.pathname);
      fetchBookings();
    }
    if (creditsPurchased === 'true') {
      toast.success('Credits købt succesfuldt!');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [searchParams, fetchBookings]);

  // ─── Handlers ────────────────────────────────────────────────────────────────

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) { toast.error('De nye adgangskoder matcher ikke'); return; }
    if (newPassword.length < 8) { toast.error('Adgangskoden skal være mindst 8 tegn'); return; }
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast.success('Adgangskode opdateret!');
      setNewPassword(''); setConfirmPassword('');
    } catch (err: any) {
      toast.error(err.message || 'Kunne ikke opdatere adgangskode');
    }
  };

  const handleUpdateEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail) { toast.error('Indtast en ny e-mail'); return; }
    try {
      const { error } = await supabase.auth.updateUser({ email: newEmail });
      if (error) throw error;
      toast.success('Bekræftelses-e-mail sendt! Tjek begge indbakker.');
      setNewEmail('');
    } catch (err: any) {
      toast.error(err.message || 'Kunne ikke opdatere e-mail');
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const { error } = await supabase.auth.updateUser({
        data: { display_name: displayName, full_name: displayName }
      });
      if (error) throw error;
      toast.success('Profil opdateret!');
    } catch (err: any) {
      toast.error(err.message || 'Kunne ikke opdatere profil');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (file.size > 2 * 1024 * 1024) { toast.error('Billedet må maks være 2MB'); return; }
    setAvatarUploading(true);
    try {
      // Convert to base64 and store directly in Supabase auth user_metadata
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const { error } = await supabase.auth.updateUser({
        data: { avatar_url: base64 }
      });
      if (error) throw error;
      setAvatarUrl(base64);
      toast.success('Profilbillede opdateret!');
    } catch (err: any) {
      toast.error(err.message || 'Kunne ikke uploade billede');
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== 'SLET') { toast.error('Skriv SLET for at bekræfte'); return; }
    try {
      const { error } = await supabase.functions.invoke('delete-account', { body: { user_id: user?.id } });
      if (error) throw error;
      await signOut();
      navigate('/');
      toast.success('Din konto er slettet.');
    } catch (err: any) {
      toast.error(err.message || 'Kontakt support for at slette din konto.');
    }
  };

  const getCleanDownloadUrl = (url: string) => {
    if (!url) return url;
    const stripped = url.replace(/^https?:\/\/flai\.dk\//, '');
    return ensureHttps(stripped);
  };

  const toggleBookingCollapse = (id: number) => {
    setCollapsedBookings(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // ─── Derived ─────────────────────────────────────────────────────────────────

  const isCompleted = (b: any) => b.is_completed === true;
  const isConfirmed = (b: any) => b.is_completed === false && b.payment_status === 'paid';

  const sortedBookings = [...bookings].sort((a, b) => {
    const da = new Date(`${a.booking_date}T${a.booking_time}`);
    const db = new Date(`${b.booking_date}T${b.booking_time}`);
    return db.getTime() - da.getTime();
  });

  const filteredBookings = sortedBookings.filter(b => {
    if (bookingFilter === 'completed') return isCompleted(b);
    if (bookingFilter === 'confirmed') return isConfirmed(b);
    return true;
  });

  if (!user) return null;

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="pt-24 pb-16">
      <SEO canonical="/profile" title="Min Profil" description="Se og administrer din Flai-profil, bookinger og kontoindstillinger." />
      <div className="container">
        <div className="max-w-4xl mx-auto">

          {/* Page title */}
          <EditableContent
            contentKey="profile-page-title"
            as="h1"
            className="text-3xl font-bold mb-4"
            fallback="Min Profil"
          />

          {/* User identity card */}
          <div className="bg-neutral-800 rounded-xl p-6 mb-6 border border-neutral-700 flex items-center gap-5">
            <div className="relative shrink-0">
              <div className="w-16 h-16 rounded-full bg-neutral-700 border-2 border-neutral-600 overflow-hidden flex items-center justify-center">
                {avatarUrl
                  ? <img src={avatarUrl} alt="Profilbillede" className="w-full h-full object-cover" />
                  : <User size={28} className="text-neutral-400" />
                }
              </div>
            </div>
            <div className="min-w-0">
              <p className="text-lg font-semibold text-white truncate">
                {displayName || user.email?.split('@')[0] || 'Bruger'}
              </p>
              <p className="text-neutral-400 text-sm truncate">{user.email}</p>
            </div>
          </div>

          {/* Credits card */}
          <div className="bg-neutral-800 rounded-xl p-6 mb-6 border border-neutral-700">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <Coins size={24} className="text-primary mr-3" />
                <div>
                  <EditableContent contentKey="credits_profile_balance_label" as="h3" className="text-lg font-semibold" fallback="Credit Balance" />
                  <EditableContent contentKey="credits_profile_balance_subtitle" as="p" className="text-neutral-400" fallback="Brug credits til at betale for tjenester" />
                </div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-primary">{credits}</div>
                <EditableContent contentKey="credits_profile_credits_label" as="div" className="text-sm text-neutral-400" fallback="credits" />
              </div>
            </div>
            <div className="mt-4">
              <Link
                to="/buy-credits"
                className="inline-flex items-center px-4 py-2 bg-primary text-neutral-900 rounded-lg hover:bg-primary/90 transition-colors font-medium"
              >
                <CreditCard size={18} className="mr-2" />
                <EditableContent contentKey="credits_profile_buy_button" fallback="Køb Credits" />
              </Link>
            </div>
          </div>

          {/* Main card */}
          <div className="bg-neutral-800 rounded-xl shadow-md overflow-hidden border border-neutral-700">

            {/* Top tabs */}
            <div className="flex border-b border-neutral-700">
              <button
                className={`flex-1 py-4 text-center font-medium ${activeTab === 'bookings' ? 'text-primary border-b-2 border-primary' : 'text-neutral-400 hover:text-white'}`}
                onClick={() => setActiveTab('bookings')}
              >
                <EditableContent contentKey="profile-bookings-tab" fallback="Mine Bookinger" />
              </button>
              <button
                className={`flex-1 py-4 text-center font-medium ${activeTab === 'settings' ? 'text-primary border-b-2 border-primary' : 'text-neutral-400 hover:text-white'}`}
                onClick={() => setActiveTab('settings')}
              >
                <EditableContent contentKey="profile-settings-tab" fallback="Indstillinger" />
              </button>
            </div>

            <div className="p-6">

              {/* ══ SETTINGS ══ */}
              {activeTab === 'settings' && (
                <div className="max-w-md mx-auto">
                  <div className="flex border-b border-neutral-700 mb-6 -mt-1">
                    <button
                      onClick={() => setActiveSettingsSection('profile')}
                      className={`flex-1 py-2.5 text-sm font-medium transition-colors ${activeSettingsSection === 'profile' ? 'text-primary border-b-2 border-primary' : 'text-neutral-400 hover:text-white'}`}
                    >
                      <EditableContent contentKey="settings-profile-tab" fallback="Profil" />
                    </button>
                    <button
                      onClick={() => setActiveSettingsSection('security')}
                      className={`flex-1 py-2.5 text-sm font-medium transition-colors ${activeSettingsSection === 'security' ? 'text-primary border-b-2 border-primary' : 'text-neutral-400 hover:text-white'}`}
                    >
                      <EditableContent contentKey="settings-security-tab" fallback="Sikkerhed & Login" />
                    </button>
                  </div>

                  {/* Profil */}
                  {activeSettingsSection === 'profile' && (
                    <div className="bg-neutral-700/20 rounded-lg p-6">
                      <EditableContent contentKey="settings-profile-title" as="h3" className="text-xl font-semibold mb-4" fallback="Profil" />

                      <div className="flex items-center gap-4 mb-6">
                        <div className="relative">
                          <div className="w-16 h-16 rounded-full bg-neutral-700 border border-neutral-600 overflow-hidden flex items-center justify-center">
                            {avatarUrl
                              ? <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                              : <User size={28} className="text-neutral-400" />
                            }
                            {avatarUploading && (
                              <div className="absolute inset-0 bg-black/60 rounded-full flex items-center justify-center">
                                <RefreshCw size={16} className="text-white animate-spin" />
                              </div>
                            )}
                          </div>
                        </div>
                        <div>
                          <EditableContent contentKey="settings-avatar-label" as="p" className="text-sm text-neutral-300 mb-1" fallback="Profilbillede" />
                          <EditableContent contentKey="settings-avatar-hint" as="p" className="text-xs text-neutral-500 mb-2" fallback="JPG eller PNG, maks 2MB" />
                          <input type="file" ref={fileInputRef} accept="image/*" className="hidden" onChange={handleAvatarUpload} />
                          <button
                            onClick={() => fileInputRef.current?.click()}
                            disabled={avatarUploading}
                            className="btn-secondary text-sm py-1.5 inline-flex items-center gap-2 disabled:opacity-50"
                          >
                            <Camera size={14} />
                            {avatarUploading
                              ? <EditableContent contentKey="settings-avatar-uploading" fallback="Uploader..." />
                              : <EditableContent contentKey="settings-avatar-button" fallback="Skift billede" />
                            }
                          </button>
                        </div>
                      </div>

                      <form onSubmit={handleSaveProfile} className="space-y-4">
                        <div>
                          <EditableContent contentKey="settings-name-label" as="label" className="block text-sm font-medium text-neutral-300 mb-1" fallback="Navn" />
                          <input
                            type="text"
                            value={displayName}
                            onChange={e => setDisplayName(e.target.value)}
                            placeholder="Dit navn"
                            className="form-input"
                          />
                        </div>
                        <button type="submit" disabled={savingProfile} className="btn-primary disabled:opacity-50">
                          {savingProfile
                            ? <EditableContent contentKey="settings-saving" fallback="Gemmer..." />
                            : <EditableContent contentKey="settings-save-button" fallback="Gem ændringer" />
                          }
                        </button>
                      </form>
                    </div>
                  )}

                  {/* Sikkerhed & Login */}
                  {activeSettingsSection === 'security' && (
                    <div className="space-y-4">

                      {/* Change email */}
                      <div className="bg-neutral-700/20 rounded-lg p-6">
                        <EditableContent contentKey="settings-email-title" as="h3" className="text-xl font-semibold mb-1" fallback="Skift E-mail" />
                        <p className="text-sm text-neutral-400 mb-4">
                          <EditableContent contentKey="settings-email-current-label" fallback="Nuværende:" />{' '}
                          <span className="text-neutral-200">{user.email}</span>
                        </p>
                        <form onSubmit={handleUpdateEmail} className="space-y-4">
                          <div>
                            <EditableContent contentKey="settings-new-email-label" as="label" className="block text-sm font-medium text-neutral-300 mb-1" fallback="Ny e-mail" />
                            <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="ny@email.dk" className="form-input" required />
                          </div>
                          <button type="submit" className="btn-primary">
                            <EditableContent contentKey="settings-email-submit" fallback="Send bekræftelse" />
                          </button>
                        </form>
                      </div>

                      {/* Change password */}
                      <div className="bg-neutral-700/20 rounded-lg p-6">
                        <EditableContent contentKey="profile-change-password-title" as="h3" className="text-xl font-semibold mb-4" fallback="Skift adgangskode" />
                        <form onSubmit={handleUpdatePassword} className="space-y-4">
                          <div>
                            <EditableContent contentKey="profile-new-password-label" as="label" className="block text-sm font-medium text-neutral-300 mb-1" fallback="Ny adgangskode" />
                            <div className="relative">
                              <input
                                type={showNewPassword ? 'text' : 'password'}
                                value={newPassword}
                                onChange={e => setNewPassword(e.target.value)}
                                className="form-input pr-10"
                                required
                              />
                              <button type="button" onClick={() => setShowNewPassword(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-200">
                                {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                              </button>
                            </div>
                          </div>
                          <div>
                            <EditableContent contentKey="profile-confirm-password-label" as="label" className="block text-sm font-medium text-neutral-300 mb-1" fallback="Bekræft ny adgangskode" />
                            <div className="relative">
                              <input
                                type={showConfirmPassword ? 'text' : 'password'}
                                value={confirmPassword}
                                onChange={e => setConfirmPassword(e.target.value)}
                                className="form-input pr-10"
                                required
                              />
                              <button type="button" onClick={() => setShowConfirmPassword(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-200">
                                {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                              </button>
                            </div>
                            {confirmPassword && newPassword !== confirmPassword && (
                              <EditableContent contentKey="settings-password-mismatch" as="p" className="text-xs text-error mt-1" fallback="Adgangskoderne matcher ikke" />
                            )}
                          </div>
                          <button type="submit" className="btn-primary">
                            <EditableContent contentKey="profile-update-password-button" fallback="Opdater adgangskode" />
                          </button>
                        </form>
                      </div>

                      {/* Delete account */}
                      <div className="bg-neutral-700/20 rounded-lg p-6 border border-error/20">
                        <EditableContent contentKey="settings-delete-title" as="h3" className="text-xl font-semibold mb-1 text-error" fallback="Slet konto" />
                        <EditableContent contentKey="settings-delete-description" as="p" className="text-sm text-neutral-400 mb-4" fallback="Permanent sletning af din konto og alle tilknyttede data. Kan ikke fortrydes." />
                        {!showDeleteConfirm ? (
                          <button onClick={() => setShowDeleteConfirm(true)} className="inline-flex items-center gap-2 px-4 py-2 bg-error/10 text-error rounded-lg hover:bg-error/20 transition-colors font-medium">
                            <Trash2 size={16} />
                            <EditableContent contentKey="settings-delete-button" fallback="Slet konto" />
                          </button>
                        ) : (
                          <div className="space-y-3">
                            <p className="text-sm text-neutral-300">
                              <EditableContent contentKey="settings-delete-type-prompt" fallback="Skriv" />{' '}
                              <span className="font-mono bg-neutral-700 px-1.5 py-0.5 rounded text-error"><EditableContent contentKey="profile-page-slet" fallback="SLET" /></span>{' '}
                              <EditableContent contentKey="settings-delete-type-suffix" fallback="for at bekræfte" />
                            </p>
                            <input type="text" value={deleteConfirmText} onChange={e => setDeleteConfirmText(e.target.value)} placeholder="SLET" className="form-input" />
                            <div className="flex gap-2">
                              <button onClick={handleDeleteAccount} disabled={deleteConfirmText !== 'SLET'} className="inline-flex items-center gap-2 px-4 py-2 bg-error text-white rounded-lg hover:bg-error/90 transition-colors font-medium disabled:opacity-30 disabled:cursor-not-allowed">
                                <Trash2 size={16} />
                                <EditableContent contentKey="settings-delete-confirm-button" fallback="Bekræft sletning" />
                              </button>
                              <button onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText(''); }} className="btn-secondary">
                                <EditableContent contentKey="settings-delete-cancel" fallback="Annuller" />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                    </div>
                  )}
                </div>
              )}

              {/* ══ BOOKINGS ══ */}
              {activeTab === 'bookings' && (
                <>
                  {/* Filter tabs */}
                  {!loadingBookings && !bookingsError && sortedBookings.length > 0 && (
                    <div className="flex gap-2 mb-6">
                      {[
                        { id: 'all',       contentKey: 'booking-filter-all',       count: sortedBookings.length,                        fallback: 'Alle' },
                        { id: 'confirmed', contentKey: 'booking-filter-confirmed',  count: sortedBookings.filter(isConfirmed).length,    fallback: 'Bekræftet' },
                        { id: 'completed', contentKey: 'booking-filter-completed',  count: sortedBookings.filter(isCompleted).length,    fallback: 'Gennemført' },
                      ].map(f => (
                        <button
                          key={f.id}
                          onClick={() => setBookingFilter(f.id as any)}
                          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${bookingFilter === f.id ? 'bg-primary text-neutral-900' : 'bg-neutral-700 text-neutral-300 hover:bg-neutral-600'}`}
                        >
                          <EditableContent contentKey={f.contentKey} fallback={f.fallback} /> ({f.count})
                        </button>
                      ))}
                    </div>
                  )}

                  {loadingBookings ? (
                    <div className="text-center py-12">
                      <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                      <EditableContent contentKey="profile-loading-bookings-text" as="p" className="mt-2 text-neutral-400" fallback="Indlæser bookinger..." />
                    </div>
                  ) : bookingsError ? (
                    <div className="text-center py-12 text-error"><p>{bookingsError}</p></div>
                  ) : filteredBookings.length === 0 ? (
                    <div className="text-center py-12">
                      <Calendar size={40} className="text-neutral-500 mx-auto mb-4" />
                      <EditableContent contentKey="profile-no-bookings-title" as="h2" className="text-xl font-semibold mb-2" fallback="Ingen bookinger fundet" />
                      <EditableContent contentKey="profile-no-bookings-message" as="p" className="text-neutral-400 mb-6" fallback="Du har ingen kommende bookinger. Book din første droneoptagelse nu!" />
                      {bookingFilter === 'all' && (
                        <Link to="/products" className="btn-primary">
                          <EditableContent contentKey="profile-book-now-button" fallback="Book Nu" />
                        </Link>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {filteredBookings.map(booking => {
                        const completed   = isCompleted(booking);
                        const confirmed   = isConfirmed(booking);
                        const collapsed   = collapsedBookings.has(booking.id);
                        const creditsUsed = Number(booking.credits_used) || 0;

                        // Discount calculation
                        const rawPrice    = Number(booking.price) || 0;
                        const rawOriginal = Number(booking.original_price) || 0;
                        const rawDiscount = Number(booking.discount_amount) || 0;
                        const hasDiscount = rawDiscount > 0;
                        // The price field already stores the final paid amount
                        const finalPrice    = rawPrice;
                        const originalPrice = hasDiscount && rawOriginal > 0 ? rawOriginal : rawPrice + rawDiscount;

                        return (
                          <div key={booking.id} className="border border-neutral-700 rounded-lg overflow-hidden bg-neutral-800/50">

                            {/* ── Header ── */}
                            <div className="p-4 bg-neutral-800 border-b border-neutral-700 flex justify-between items-start gap-4">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2 mb-1">
                                  <h3 className="font-medium text-white">{booking.product_name}</h3>
                                  {completed && (
                                    <span className="text-xs px-2 py-0.5 rounded-full bg-success/10 text-success">
                                      <EditableContent contentKey="booking-badge-completed" fallback="Gennemført" />
                                    </span>
                                  )}
                                  {confirmed && (
                                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400">
                                      <EditableContent contentKey="booking-badge-confirmed" fallback="Bekræftet" />
                                    </span>
                                  )}
                                  {!completed && !confirmed && (
                                    <span className="text-xs px-2 py-0.5 rounded-full bg-warning/10 text-warning">
                                      {booking.payment_status === 'pending'
                                        ? <EditableContent contentKey="profile-payment-status-pending" fallback="Afventer betaling" />
                                        : booking.payment_status}
                                    </span>
                                  )}
                                  {booking.mode === 'smart' && (
                                    <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400">
                                      <EditableContent contentKey="booking-badge-smart" fallback="Smart" />
                                    </span>
                                  )}
                                </div>
                                <p className="text-sm text-neutral-400">
                                  <EditableContent contentKey="booking-id-prefix" fallback="Booking" /> #{booking.id}
                                </p>
                              </div>

                              <div className="flex items-center gap-3 shrink-0">
                                <div className="text-right">
                                  {/* Final paid price */}
                                  <div className="font-bold text-primary">
                                    {finalPrice} <EditableContent contentKey="booking-currency" fallback="kr" />
                                  </div>
                                  {/* If discount: show original crossed out + saving */}
                                  {hasDiscount && (
                                    <div className="text-sm text-neutral-400 leading-tight">
                                      <span className="line-through">{originalPrice} <EditableContent contentKey="booking-currency" fallback="kr" /></span>
                                      <span className="text-success ml-1">−{rawDiscount} <EditableContent contentKey="booking-currency" fallback="kr" /></span>
                                    </div>
                                  )}
                                  {creditsUsed > 0 && (
                                    <div className="text-sm text-neutral-400">
                                      {creditsUsed} <EditableContent contentKey="booking-credits-used-suffix" fallback="credits brugt" />
                                    </div>
                                  )}
                                  {/* Payment badge */}
                                  <span className={`text-sm px-2 py-0.5 rounded-full ${
                                    booking.payment_status === 'paid' ? 'bg-success/10 text-success'
                                    : booking.payment_status === 'failed' ? 'bg-error/10 text-error'
                                    : 'bg-warning/10 text-warning'
                                  }`}>
                                    {booking.payment_status === 'paid'
                                      ? <EditableContent contentKey="profile-payment-status-paid" fallback="Betalt" />
                                      : booking.payment_status === 'failed'
                                      ? <EditableContent contentKey="profile-payment-status-failed" fallback="Betaling fejlet" />
                                      : <EditableContent contentKey="profile-payment-status-pending" fallback="Afventer betaling" />
                                    }
                                  </span>
                                </div>
                                <button onClick={() => toggleBookingCollapse(booking.id)} className="text-neutral-400 hover:text-white transition-colors p-1">
                                  {collapsed ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
                                </button>
                              </div>
                            </div>

                            {/* ── Body (expanded by default) ── */}
                            {!collapsed && (
                              <div className="p-4 space-y-4">

                                {/* Details grid */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                                  <div className="flex items-start gap-2">
                                    <Calendar size={18} className="text-primary mt-0.5 shrink-0" />
                                    <div>
                                      <EditableContent contentKey="profile-booking-date-label" as="div" className="text-sm text-neutral-400" fallback="Dato" />
                                      <div className="text-neutral-100">{formatDate(booking.booking_date)}</div>
                                    </div>
                                  </div>

                                  <div className="flex items-start gap-2">
                                    <Clock size={18} className="text-primary mt-0.5 shrink-0" />
                                    <div>
                                      <EditableContent contentKey="profile-booking-time-label" as="div" className="text-sm text-neutral-400" fallback="Tidspunkt" />
                                      <div className="text-neutral-100">{formatTime(booking.booking_time)}</div>
                                    </div>
                                  </div>

                                  <div className="flex items-start gap-2">
                                    <MapPin size={18} className="text-primary mt-0.5 shrink-0" />
                                    <div>
                                      <EditableContent contentKey="profile-booking-address-label" as="div" className="text-sm text-neutral-400" fallback="Adresse" />
                                      <div className="text-neutral-100">{booking.address}</div>
                                    </div>
                                  </div>

                                  <div className="flex items-start gap-2">
                                    <Edit size={18} className="text-primary mt-0.5 shrink-0" />
                                    <div>
                                      <EditableContent contentKey="profile-booking-editing-label" as="div" className="text-sm text-neutral-400" fallback="Redigering" />
                                      <div className="text-neutral-100">
                                        {booking.include_editing
                                          ? <EditableContent contentKey="profile-booking-editing-yes" fallback="Ja" />
                                          : <EditableContent contentKey="profile-booking-editing-no" fallback="Nej" />
                                        }
                                      </div>
                                    </div>
                                  </div>

                                  {booking.payment_method && (
                                    <div className="flex items-start gap-2">
                                      <CreditCard size={18} className="text-primary mt-0.5 shrink-0" />
                                      <div>
                                        <EditableContent contentKey="booking-payment-method-label" as="div" className="text-sm text-neutral-400" fallback="Betalingsmetode" />
                                        <div className="text-neutral-100 capitalize">
                                          <EditableContent contentKey={`booking-payment-method-${booking.payment_method}`} fallback={booking.payment_method} />
                                        </div>
                                      </div>
                                    </div>
                                  )}

                                  {hasDiscount && (
                                    <div className="flex items-start gap-2">
                                      <Tag size={18} className="text-primary mt-0.5 shrink-0" />
                                      <div>
                                        <EditableContent contentKey="booking-discount-label" as="div" className="text-sm text-neutral-400" fallback="Rabat anvendt" />
                                        <div className="text-neutral-100">
                                          <span className="line-through text-neutral-400 mr-2">{originalPrice} <EditableContent contentKey="booking-currency" fallback="kr" /></span>
                                          <span className="text-success font-medium">−{rawDiscount} <EditableContent contentKey="booking-currency" fallback="kr" /></span>
                                          <span className="ml-2 font-medium">= {finalPrice} <EditableContent contentKey="booking-currency" fallback="kr" /></span>
                                        </div>
                                      </div>
                                    </div>
                                  )}

                                  {creditsUsed > 0 && (
                                    <div className="flex items-start gap-2">
                                      <Coins size={18} className="text-primary mt-0.5 shrink-0" />
                                      <div>
                                        <EditableContent contentKey="booking-credits-used-label" as="div" className="text-sm text-neutral-400" fallback="Credits brugt" />
                                        <div className="text-neutral-100">
                                          {creditsUsed} <EditableContent contentKey="booking-credits-unit" fallback="credits" />
                                        </div>
                                      </div>
                                    </div>
                                  )}

                                  {booking.send_invoice_on_completion && (
                                    <div className="flex items-start gap-2">
                                      <FileText size={18} className="text-primary mt-0.5 shrink-0" />
                                      <div>
                                        <EditableContent contentKey="booking-invoice-label" as="div" className="text-sm text-neutral-400" fallback="Faktura" />
                                        <EditableContent contentKey="booking-invoice-value" as="div" className="text-neutral-100" fallback="Sendes ved afslutning" />
                                      </div>
                                    </div>
                                  )}
                                </div>

                                {/* Action buttons */}
                                <div className="flex flex-wrap gap-2">
                                  {booking.zip_file_url && (
                                    <a
                                      href={getCleanDownloadUrl(booking.zip_file_url)}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="btn-secondary text-sm inline-flex items-center gap-2"
                                    >
                                      <Download size={15} />
                                      {`Download dine ${booking.product_name}`}
                                    </a>
                                  )}
                                  {booking.share_project_url && (
                                    <a
                                      href={ensureHttps(booking.share_project_url)}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="btn-secondary text-sm inline-flex items-center gap-2"
                                    >
                                      <Share2 size={15} />
                                      <EditableContent contentKey="booking-share-button" fallback="Se projekt" />
                                    </a>
                                  )}
                                  <a
                                    href={GOOGLE_REVIEW_URL}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="btn-secondary text-sm inline-flex items-center gap-2"
                                  >
                                    <Star size={15} />
                                    <EditableContent contentKey="booking-review-button" fallback="Anmeld os på Google" />
                                  </a>
                                </div>

                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}

            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;
