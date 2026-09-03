import React, { useState, useEffect, useCallback } from 'react';
import {
  Users, Search, Shield, Coins, Eye, X, RefreshCw,
  Check, Edit, Calendar, Loader, XCircle, ChevronDown,
  ChevronUp, Mail, Clock, Phone, UserCheck, ExternalLink,
} from 'lucide-react';
import { createClient } from '@supabase/supabase-js';
import { supabase, supabaseUrl } from '../../utils/supabase';
import { useAuth } from '../../contexts/AuthContext';
import EditableContent from '../EditableContent';
import toast from 'react-hot-toast';

// ─── Service-role client ──────────────────────────────────────────────────────
const supabaseAdmin = createClient(
  supabaseUrl,
  import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// ─── Types ────────────────────────────────────────────────────────────────────
interface UserProfile {
  id: string;
  email: string;
  is_admin: boolean;
  credits: number;
  created_at: string;
  display_name?: string;
  avatar_url?: string;
  phone?: string;
  last_sign_in?: string;
  provider?: string;
}

interface UserBooking {
  id: number;
  booking_date: string;
  booking_time: string;
  address: string;
  price: number;
  payment_status: string;
  is_completed: boolean;
  products?: { name: string };
}

// ─── Inline Details Card ──────────────────────────────────────────────────────
// Small dropdown that appears below the row — not a fullscreen overlay.

const DetailsCard: React.FC<{ user: UserProfile; onClose: () => void }> = ({ user, onClose }) => {
  const [bookings, setBookings] = useState<UserBooking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('bookings')
      .select('id, booking_date, booking_time, address, price, payment_status, is_completed, products(name)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => { setBookings(data || []); setLoading(false); });
  }, [user.id]);

  return (
    <div className="border-t border-neutral-600 bg-neutral-900 rounded-b-lg px-4 py-4 space-y-3">
      {/* Stats row */}
      <div className="grid grid-cols-4 gap-2">
        <div className="bg-neutral-800 rounded-lg p-2 text-center">
          <p className="text-neutral-500 text-xs"><EditableContent contentKey="admin-users-panel-credits" fallback="Credits" /></p>
          <p className="font-bold text-primary">{user.credits}</p>
        </div>
        <div className="bg-neutral-800 rounded-lg p-2 text-center">
          <p className="text-neutral-500 text-xs"><EditableContent contentKey="admin-users-panel-bookinger" fallback="Bookinger" /></p>
          <p className="font-bold">{loading ? '…' : bookings.length}</p>
        </div>
        <div className="bg-neutral-800 rounded-lg p-2 text-center">
          <p className="text-neutral-500 text-xs"><EditableContent contentKey="admin-users-panel-login" fallback="Login" /></p>
          <p className="font-bold capitalize text-xs">{user.provider || '—'}</p>
        </div>
        <div className="bg-neutral-800 rounded-lg p-2 text-center">
          <p className="text-neutral-500 text-xs"><EditableContent contentKey="admin-users-panel-sidst-aktiv" fallback="Sidst aktiv" /></p>
          <p className="font-bold text-xs">
            {user.last_sign_in
              ? new Date(user.last_sign_in).toLocaleDateString('da-DK', { day: 'numeric', month: 'short' })
              : '—'}
          </p>
        </div>
      </div>

      {/* Bookings */}
      {loading ? (
        <div className="flex justify-center py-3">
          <Loader size={16} className="animate-spin text-primary" />
        </div>
      ) : bookings.length === 0 ? (
        <p className="text-neutral-500 text-xs text-center py-2">
          <EditableContent contentKey="admin-users-no-bookings" as="span" fallback="Ingen bookinger" />
        </p>
      ) : (
        <div className="space-y-1.5 max-h-48 overflow-y-auto">
          {bookings.map((b) => (
            <div key={b.id} className="flex items-center justify-between bg-neutral-800 rounded px-3 py-2 gap-3">
              <div className="min-w-0">
                <p className="text-xs font-medium truncate">{b.products?.name || 'Ukendt produkt'}</p>
                <p className="text-xs text-neutral-500">{b.booking_date} · {b.booking_time}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-xs font-semibold">{b.price} <EditableContent contentKey="admin-users-panel-kr" fallback="kr" /></span>
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                  b.is_completed ? 'bg-success/20 text-success'
                  : b.payment_status === 'paid' ? 'bg-primary/20 text-primary'
                  : 'bg-warning/20 text-warning'
                }`}>
                  {b.is_completed ? 'Afsluttet' : b.payment_status === 'paid' ? 'Betalt' : 'Afventer'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── User Row ─────────────────────────────────────────────────────────────────

const UserRow: React.FC<{
  user: UserProfile;
  onUpdate: (id: string, updates: Partial<UserProfile>) => Promise<void>;
}> = ({ user, onUpdate }) => {
  const { user: currentUser } = useAuth();
  const [showDetails, setShowDetails] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [editingCredits, setEditingCredits] = useState(false);
  const [creditInput, setCreditInput] = useState(String(user.credits));
  const [saving, setSaving] = useState(false);
  const isSelf = currentUser?.id === user.id;

  const initials = (user.display_name || user.email).slice(0, 2).toUpperCase();

  const [supportLoading, setSupportLoading] = useState(false);
  const [popupBlocked, setPopupBlocked] = useState(false);

  const isBrave = typeof (navigator as any).brave !== 'undefined';
  const isFirefox = navigator.userAgent.toLowerCase().includes('firefox');

  const handleSupportClick = () => {
    setPopupBlocked(false);

    // ── Popup HTML ────────────────────────────────────────────────────────────
    // Opens as a blob URL so it shares the same origin as the admin window.
    // 1. Sets support-mode=1 in sessionStorage BEFORE anything else so that
    //    supabase.ts creates its client with sessionStorage instead of localStorage.
    // 2. Posts 'ready' to the opener once the message listener is registered.
    // 3. Receives already-valid tokens via postMessage and calls setSession,
    //    then navigates to the app — fully isolated from the admin's session.
    const popupHtml = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Support session…</title>
<style>
  *{margin:0;box-sizing:border-box}
  body{display:flex;flex-direction:column;align-items:center;justify-content:center;
    height:100vh;font-family:system-ui,sans-serif;background:#171717;color:#aaa;gap:16px;font-size:14px}
  .spinner{width:32px;height:32px;border:3px solid #333;border-top-color:#aaa;
    border-radius:50%;animation:spin .8s linear infinite}
  @keyframes spin{to{transform:rotate(360deg)}}
  .err{color:#f87171;text-align:center;padding:0 24px;line-height:1.5}
</style></head>
<body>
<div class="spinner"></div>
<span id="msg">Forbereder session…</span>
<script type="module">
  import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

  // Mark this window as support mode BEFORE anything else so supabase.ts
  // picks it up when the app bundle loads.
  sessionStorage.setItem('support-mode', '1');

  const supabase = createClient(
    '${supabaseUrl}',
    '${import.meta.env.VITE_SUPABASE_ANON_KEY}',
    { auth: { storage: sessionStorage, storageKey: 'support-session',
               autoRefreshToken: true, persistSession: true, detectSessionInUrl: false } }
  );

  window.addEventListener('message', async (e) => {
    if (e.origin !== '${window.location.origin}') return;
    const { access_token, refresh_token } = e.data || {};
    if (!access_token) return;
    document.getElementById('msg').textContent = 'Logger ind…';
    const { error } = await supabase.auth.setSession({ access_token, refresh_token });
    if (error) {
      document.querySelector('.spinner').style.display = 'none';
      document.getElementById('msg').className = 'err';
      document.getElementById('msg').textContent = 'Fejl: ' + error.message;
      return;
    }
    window.location.href = '${window.location.origin}';
  });

  // Tell the opener our listener is ready — it will send tokens immediately.
  if (window.opener) window.opener.postMessage('ready', '${window.location.origin}');
<\/script>
</body></html>`;

    const blob = new Blob([popupHtml], { type: 'text/html' });
    const blobUrl = URL.createObjectURL(blob);

    const popup = window.open(
      blobUrl,
      `support_${user.id}`,
      'width=500,height=720,scrollbars=yes,resizable=yes,toolbar=no,menubar=no,location=yes'
    );

    if (!popup) {
      URL.revokeObjectURL(blobUrl);
      setPopupBlocked(true);
      return;
    }

    setSupportLoading(true);

    // ── Call the Edge Function ────────────────────────────────────────────────
    // The Edge Function runs server-side with the service role key and does:
    //   generateLink → verifyOtp (both in the same function, no expiry race)
    // It returns ready-to-use access_token + refresh_token.
    // The browser never touches generateLink or verifyOtp directly, so no 403.
    (async () => {
      try {
        const { data: { session: adminSession } } = await supabase.auth.getSession();
        if (!adminSession) throw new Error('Ikke logget ind som admin');

        const resp = await fetch(
          `${supabaseUrl}/functions/v1/create-support-session`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${adminSession.access_token}`,
            },
            body: JSON.stringify({ userId: user.id }),
          }
        );

        const json = await resp.json();
        setSupportLoading(false);

        if (!resp.ok || !json.access_token) {
          popup.close();
          toast.error(`Kunne ikke oprette session: ${json.error || resp.statusText}`);
          return;
        }

        // Send the already-valid tokens to the popup.
        // Wait for its 'ready' signal first (3 s fallback).
        const send = () => popup.postMessage(
          { access_token: json.access_token, refresh_token: json.refresh_token },
          window.location.origin
        );

        let sent = false;
        const onReady = (e: MessageEvent) => {
          if (e.source !== popup) return;
          if (e.data === 'ready' && !sent) {
            sent = true;
            window.removeEventListener('message', onReady);
            send();
          }
        };
        window.addEventListener('message', onReady);
        setTimeout(() => {
          if (!sent) { sent = true; window.removeEventListener('message', onReady); send(); }
        }, 3000);

        URL.revokeObjectURL(blobUrl);
        toast.success('Supportvindue åbnet');
      } catch (err: any) {
        setSupportLoading(false);
        popup.close();
        toast.error(`Fejl: ${err.message}`);
      }
    })();
  };

  const PopupBlockedBanner = () => (
    <div className="border-t border-warning/30 bg-warning/10 px-4 py-3 rounded-b-lg">
      <p className="text-xs font-semibold text-warning mb-2 flex items-center gap-1.5">
        <span>⚠</span> <EditableContent contentKey="admin-users-panel-popup-blev-blokeret-foelg-disse" fallback="Popup blev blokeret — følg disse trin:" /></p>
      {isBrave ? (
        <ol className="text-xs text-neutral-300 space-y-1 list-decimal list-inside">
          <li><EditableContent contentKey="admin-users-panel-klik-paa" fallback="Klik på" /><strong><EditableContent contentKey="admin-users-panel-brave-ikonet-loeve" fallback="Brave-ikonet (løve)" /></strong> <EditableContent contentKey="admin-users-panel-i-adresselinjen-oeverst-til-hoejre" fallback="i adresselinjen øverst til højre" /></li>
          <li><EditableContent contentKey="admin-users-panel-rul-ned-og-slaa" fallback="Rul ned og slå" /><strong><EditableContent contentKey="admin-users-panel-block-popups" fallback="&quot;Block popups&quot;" /></strong> <EditableContent contentKey="admin-users-panel-fra-for-denne-side" fallback="fra for denne side" /></li>
          <li><EditableContent contentKey="admin-users-panel-klik-paa-knappen-herunder-for" fallback="Klik på knappen herunder for at prøve igen" /></li>
        </ol>
      ) : isFirefox ? (
        <ol className="text-xs text-neutral-300 space-y-1 list-decimal list-inside">
          <li><EditableContent contentKey="admin-users-panel-klik-paa-2" fallback="Klik på" /><strong><EditableContent contentKey="admin-users-panel-popup-ikonet" fallback="popup-ikonet" /></strong> <EditableContent contentKey="admin-users-panel-i-adresselinjen-til-hoejre" fallback="i adresselinjen (til højre)" /></li>
          <li><EditableContent contentKey="admin-users-panel-vaelg" fallback="Vælg" /><strong><EditableContent contentKey="admin-users-panel-tillad-popups-fra-denne-side" fallback="&quot;Tillad popups fra denne side&quot;" /></strong></li>
          <li><EditableContent contentKey="admin-users-panel-klik-paa-knappen-herunder-for-2" fallback="Klik på knappen herunder for at prøve igen" /></li>
        </ol>
      ) : (
        <ol className="text-xs text-neutral-300 space-y-1 list-decimal list-inside">
          <li><EditableContent contentKey="admin-users-panel-klik-paa" fallback="Klik på" /> <strong><EditableContent contentKey="admin-users-panel-popup-blokeret-ikonet" fallback="popup-blokeret-ikonet" /></strong> <EditableContent contentKey="admin-users-panel-i-adresselinjen-til-hoejre-2" fallback="i adresselinjen (til højre)" /></li>
          <li><EditableContent contentKey="admin-users-panel-vaelg-2" fallback="Vælg" /><strong><EditableContent contentKey="admin-users-panel-tillad-altid-popups-fra-denne" fallback="&quot;Tillad altid popups fra denne side&quot;" /></strong></li>
          <li><EditableContent contentKey="admin-users-panel-klik-paa-knappen-herunder-for" fallback="Klik på knappen herunder for at prøve igen" /></li>
        </ol>
      )}
      <button
        onClick={handleSupportClick}
        className="mt-2.5 flex items-center gap-1.5 px-3 py-1.5 text-xs rounded bg-warning/20 hover:bg-warning/30 text-warning transition-colors font-medium"
      >
        <ExternalLink size={12} /> <EditableContent contentKey="admin-users-panel-proev-igen" fallback="Prøv igen" /></button>
    </div>
  );

  return (
    <div className={`bg-neutral-700/30 rounded-lg border transition-colors ${showDetails || showEdit || popupBlocked ? 'border-primary/40' : 'border-neutral-700'}`}>
      {/* Main row */}
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Avatar */}
        {user.avatar_url ? (
          <img src={user.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0 border border-neutral-600" />
        ) : (
          <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold flex-shrink-0">
            {initials}
          </div>
        )}

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate leading-tight">
            {user.display_name || <span className="text-neutral-500"><EditableContent contentKey="admin-users-panel-intet-navn" fallback="Intet navn" /></span>}
          </p>
          <p className="text-xs text-neutral-400 truncate">{user.email}</p>
        </div>

        {/* Badges */}
        <div className="hidden sm:flex items-center gap-1.5 flex-shrink-0">
          {user.last_sign_in && (
            <span className="text-xs text-neutral-600 flex items-center gap-1">
              <Clock size={10} />
              {new Date(user.last_sign_in).toLocaleDateString('da-DK')}
            </span>
          )}
          {user.is_admin && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-primary/20 text-primary font-medium flex items-center gap-1">
              <Shield size={10} /> <EditableContent contentKey="admin-users-panel-admin" fallback="Admin" /></span>
          )}
          <span className="text-xs px-2 py-0.5 rounded-full bg-neutral-700 text-neutral-300 flex items-center gap-1">
            <Coins size={10} /> {user.credits}
          </span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={() => { setShowDetails(v => !v); setShowEdit(false); }}
            className={`flex items-center gap-1 px-2.5 py-1.5 text-xs rounded transition-colors ${
              showDetails
                ? 'bg-primary/20 text-primary'
                : 'bg-neutral-700 hover:bg-neutral-600 text-neutral-300 hover:text-white'
            }`}
          >
            <Eye size={12} /> <EditableContent contentKey="admin-users-panel-detaljer" fallback="Detaljer" /></button>
          <button
            onClick={handleSupportClick}
            disabled={supportLoading}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded bg-neutral-700 hover:bg-neutral-600 text-neutral-300 hover:text-white transition-colors disabled:opacity-50"
          >
            {supportLoading ? <Loader size={12} className="animate-spin" /> : <ExternalLink size={12} />}
            <EditableContent contentKey="admin-users-panel-support" fallback="Support" /></button>
          <button
            onClick={() => { setShowEdit(v => !v); setShowDetails(false); }}
            className={`p-1.5 rounded transition-colors ${
              showEdit
                ? 'bg-primary/20 text-primary'
                : 'bg-neutral-700 hover:bg-neutral-600 text-neutral-400'
            }`}
          >
            {showEdit ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      {/* Inline Details Card */}
      {showDetails && <DetailsCard user={user} onClose={() => setShowDetails(false)} />}

      {/* Popup blocked instructions */}
      {popupBlocked && <PopupBlockedBanner />}

      {/* Edit Panel — credits only */}
      {showEdit && (
        <div className="border-t border-neutral-700 px-4 py-3 space-y-3">
          <div>
            <label className="block text-xs font-medium text-neutral-400 mb-1.5">
              <EditableContent contentKey="admin-users-credits-label" as="span" fallback="Credits" />
            </label>
            {editingCredits ? (
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={creditInput}
                  onChange={(e) => setCreditInput(e.target.value)}
                  className="form-input flex-1 py-1.5 text-sm"
                  min={0}
                  autoFocus
                />
                <button
                  onClick={async () => {
                    const val = parseInt(creditInput, 10);
                    if (isNaN(val) || val < 0) return toast.error('Ugyldig creditværdi');
                    setSaving(true);
                    await onUpdate(user.id, { credits: val });
                    setEditingCredits(false);
                    setSaving(false);
                  }}
                  disabled={saving}
                  className="btn-primary px-2.5 py-1.5"
                >
                  {saving ? <Loader size={12} className="animate-spin" /> : <Check size={12} />}
                </button>
                <button
                  onClick={() => { setEditingCredits(false); setCreditInput(String(user.credits)); }}
                  className="p-1.5 rounded bg-neutral-700 hover:bg-neutral-600 text-neutral-400 transition-colors"
                >
                  <X size={12} />
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between bg-neutral-700/50 rounded px-3 py-1.5">
                <span className="font-semibold text-sm">{user.credits}</span>
                <button
                  onClick={() => setEditingCredits(true)}
                  className="p-1 rounded hover:bg-neutral-600 text-neutral-400 hover:text-white transition-colors"
                >
                  <Edit size={12} />
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Main Panel ───────────────────────────────────────────────────────────────

const AdminUsersPanel: React.FC = () => {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'admin' | 'regular'>('all');

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, email, is_admin, credits, created_at')
        .order('created_at', { ascending: false });

      if (profilesError) throw profilesError;

      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
      if (authError) console.warn('Auth users fetch failed:', authError.message);

      const authMap = new Map<string, Partial<UserProfile>>();
      for (const u of authData?.users || []) {
        authMap.set(u.id, {
          display_name: u.user_metadata?.full_name || u.user_metadata?.name || u.user_metadata?.display_name,
          avatar_url: u.user_metadata?.avatar_url || u.user_metadata?.picture,
          phone: u.phone || undefined,
          last_sign_in: u.last_sign_in_at || undefined,
          provider: u.app_metadata?.provider || undefined,
        });
      }

      setUsers((profiles || []).map(p => ({ ...p, ...authMap.get(p.id) })));
    } catch (err: any) {
      setError(err.message);
      toast.error('Kunne ikke hente brugere');
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const handleUpdate = useCallback(async (id: string, updates: Partial<UserProfile>) => {
    const { error: err } = await supabase
      .from('profiles')
      .update({ is_admin: updates.is_admin, credits: updates.credits })
      .eq('id', id);
    if (err) { toast.error('Opdatering mislykkedes'); return; }
    toast.success('Bruger opdateret');
    setUsers(prev => prev.map(u => u.id === id ? { ...u, ...updates } : u));
  }, []);

  const filtered = users.filter((u) => {
    const q = search.toLowerCase();
    const matchSearch = !q || u.email.toLowerCase().includes(q) || (u.display_name || '').toLowerCase().includes(q);
    const matchFilter = filter === 'all' || (filter === 'admin' ? u.is_admin : !u.is_admin);
    return matchSearch && matchFilter;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <Loader size={40} className="mx-auto mb-3 animate-spin text-primary" />
          <EditableContent contentKey="admin-users-loading" as="p" className="text-neutral-400 text-sm" fallback="Henter brugere…" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-error/10 border border-error/20 rounded-lg p-6 text-center">
        <XCircle size={40} className="text-error mx-auto mb-3" />
        <EditableContent contentKey="admin-users-error-title" as="p" className="text-lg font-semibold mb-1 text-error" fallback="Kunne ikke hente brugere" />
        <p className="text-neutral-400 text-sm mb-4">{error}</p>
        <button onClick={fetchUsers} className="btn-primary">
          <EditableContent contentKey="admin-users-retry" as="span" fallback="Prøv igen" />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <EditableContent
            contentKey="admin-users-title"
            as="h2"
            className="text-2xl font-bold"
            fallback="Brugere"
          />
          <p className="text-neutral-400 text-sm mt-0.5">
            {users.length} <EditableContent contentKey="admin-users-count-label" as="span" fallback="brugere" />
            {' · '}
            {users.filter(u => u.is_admin).length} <EditableContent contentKey="admin-users-admin-count-label" as="span" fallback="administratorer" />
          </p>
        </div>
        <button
          onClick={fetchUsers}
          className="flex items-center gap-2 px-3 py-2 rounded bg-neutral-700 hover:bg-neutral-600 text-neutral-300 transition-colors text-sm"
        >
          <RefreshCw size={14} />
          <EditableContent contentKey="admin-users-refresh" as="span" fallback="Opdater" />
        </button>
      </div>

      {/* Search + filter */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            placeholder="Søg på navn eller e-mail…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="form-input pl-9 w-full"
          />
        </div>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as typeof filter)}
          className="form-input w-full sm:w-44"
        >
          <option value="all"><EditableContent contentKey="admin-users-panel-alle-brugere" fallback="Alle brugere" /></option>
          <option value="admin"><EditableContent contentKey="admin-users-panel-kun-administratorer" fallback="Kun administratorer" /></option>
          <option value="regular"><EditableContent contentKey="admin-users-panel-kun-almindelige" fallback="Kun almindelige" /></option>
        </select>
      </div>

      {/* User list */}
      {filtered.length === 0 ? (
        <div className="text-center py-10 text-neutral-400">
          <Users size={28} className="mx-auto mb-2 opacity-30" />
          <EditableContent contentKey="admin-users-empty" as="p" className="text-sm" fallback="Ingen brugere fundet" />
        </div>
      ) : (
        <div className="space-y-1.5">
          {filtered.map((user) => (
            <UserRow
              key={user.id}
              user={user}
              onUpdate={handleUpdate}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminUsersPanel;