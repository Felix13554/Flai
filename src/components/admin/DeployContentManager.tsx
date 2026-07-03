import React, { useState, useEffect, useCallback } from 'react';
import {
  GitBranch, Rocket, CheckCircle, XCircle, AlertTriangle,
  FileCode, SkipForward, RefreshCw, ExternalLink, Info, Clock, X, Globe,
  PlusSquare, Tag, Layout, Plus, ShieldAlert, FileQuestion,
} from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { getAutoDeployMsRemaining, cancelAutoDeploy } from '../../hooks/useSiteContent';
import toast from 'react-hot-toast';
import EditableContent from '../EditableContent';

// ─── Types ─────────────────────────────────────────────────────────────────────
interface DeployResult {
  totalRows: number;
  deployedKeys: string[];
  skippedKeys: string[];
  unknownKeys: string[];
  modifiedFiles: string[];
  deletedFromDB: number;
  commitSha: string | null;
  commitUrl: string | null;
  netlifyTriggered: boolean;
  errors: string[];
  message?: string;
}

interface JsxError {
  file: string;
  line: number;
  text: string;
  issue: string;
  autoFixed: boolean;
}

interface BlockedFile {
  file: string;
  reason: string;
  unfixedErrors: JsxError[];
}

interface AddEditableResult {
  scannedFiles: number;
  modifiedFiles: string[];
  addedKeys: Array<{ key: string; fallback: string; file: string }>;
  skippedFiles: string[];
  jsxErrors: JsxError[];
  blockedFiles: BlockedFile[];
  commitSha: string | null;
  commitUrl: string | null;
  errors: string[];
}

type DeployStatus = 'idle' | 'loading' | 'success' | 'error';
type AddStatus    = 'idle' | 'scanning' | 'success' | 'error';

// ─── ROUTES ───────────────────────────────────────────────────────────────────
const ROUTES: Array<{ url: string; label: string; group: string }> = [
  // Sider
  { url: '/',                label: 'Forside',              group: 'Sider' },
  { url: '/app',                label: 'Global',              group: 'Global' },
  { url: '/products',        label: 'Produkter',            group: 'Sider' },
  { url: '/product/',        label: 'Produkt-detalje',      group: 'Sider' },
  { url: '/portfolio',       label: 'Portfolio',            group: 'Sider' },
  { url: '/search',          label: 'Søg',                  group: 'Sider' },
  { url: '/coverage',        label: 'Dækningsområder',      group: 'Sider' },
  { url: '/simple-request',  label: 'Simpel forespørgsel',  group: 'Sider' },
  { url: '/booking/',        label: 'Booking',              group: 'Sider' },
  { url: '/booking-success', label: 'Booking-bekræftelse',  group: 'Sider' },
  { url: '/payment',         label: 'Betaling',             group: 'Sider' },
  { url: '/donate/',         label: 'Donation',             group: 'Sider' },
  { url: '/ratings',         label: 'Anmeldelser',          group: 'Sider' },
  { url: '/rate-booking/',   label: 'Bedøm booking',        group: 'Sider' },
  { url: '/unsubscribe',     label: 'Afmeld nyhedsbrev',    group: 'Sider' },
  // Indhold
  { url: '/terms',           label: 'Vilkår',               group: 'Indhold' },
  { url: '/policies',        label: 'Privatpolitik',        group: 'Indhold' },
  // Konto
  { url: '/auth',            label: 'Login / Opret konto',  group: 'Konto' },
  { url: '/profile',         label: 'Profil',               group: 'Konto' },
  { url: '/buy-credits',     label: 'Køb credits',          group: 'Konto' },
  { url: '/reset-password',  label: 'Nulstil adgangskode',  group: 'Konto' },
  { url: '/update-password', label: 'Opdater adgangskode',  group: 'Konto' },
  { url: '/email-confirmed', label: 'Email bekræftet',      group: 'Konto' },
  // Admin
  { url: '/admin',           label: 'Admin',                group: 'Admin' },
  // Layout
  { url: '__navbar__',       label: 'NavBar',               group: 'Layout' },
  { url: '__footer__',       label: 'Footer',               group: 'Layout' },
];

function formatMs(ms: number): string {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

async function getSupabaseUrl(): Promise<string> {
  return (supabase as any).supabaseUrl as string || import.meta.env.VITE_SUPABASE_URL;
}

// ─── Countdown ────────────────────────────────────────────────────────────────
const AutoDeployCountdown: React.FC<{ onCancel: () => void }> = ({ onCancel }) => {
  const [msLeft, setMsLeft] = useState<number | null>(getAutoDeployMsRemaining());
  useEffect(() => {
    const h = (e: Event) => setMsLeft((e as CustomEvent).detail.msRemaining);
    window.addEventListener('autoDeployTimerUpdate', h);
    const t = setInterval(() => setMsLeft(getAutoDeployMsRemaining()), 1000);
    return () => { window.removeEventListener('autoDeployTimerUpdate', h); clearInterval(t); };
  }, []);
  if (msLeft === null) return null;
  return (
    <div className="flex items-center gap-3 bg-yellow-900/30 border border-yellow-700/50 rounded-lg px-4 py-3">
      <Clock size={16} className="text-yellow-400 shrink-0 animate-pulse" />
      <div className="flex-1">
        <p className="text-sm text-yellow-300 font-medium"><EditableContent contentKey="deploy-content-manager-auto-deploy-om" fallback="Auto-deploy om" /><span className="font-mono font-bold">{formatMs(msLeft)}</span></p>
        <p className="text-xs text-yellow-500"><EditableContent contentKey="deploy-content-manager-hver-indholds-aendring-nulstiller-timeren" fallback="Hver indholds-ændring nulstiller timeren" /></p>
      </div>
      <button onClick={onCancel} className="p-1 rounded hover:bg-yellow-800/50 text-yellow-400 hover:text-yellow-200 transition-colors"><X size={14} /></button>
    </div>
  );
};

// ─── URL Picker Modal ─────────────────────────────────────────────────────────
const UrlPickerModal: React.FC<{
  onClose: () => void;
  onConfirm: (urls: string[]) => void;
}> = ({ onClose, onConfirm }) => {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [customInput, setCustomInput] = useState('');
  const [customUrls, setCustomUrls] = useState<string[]>([]);

  const toggle = (url: string) => setSelected(prev => {
    const n = new Set(prev); n.has(url) ? n.delete(url) : n.add(url); return n;
  });
  const selectAll = () => setSelected(new Set([...ROUTES.map(r => r.url), ...customUrls]));
  const clearAll  = () => setSelected(new Set());
  const selectGroup = (g: string) => setSelected(prev => {
    const n = new Set(prev);
    ROUTES.filter(r => r.group === g).forEach(r => n.add(r.url));
    return n;
  });

  const addCustomUrl = () => {
    const raw = customInput.trim();
    if (!raw) return;
    const url = raw.startsWith('/') ? raw : `/${raw}`;
    if (!customUrls.includes(url)) setCustomUrls(prev => [...prev, url]);
    setSelected(prev => new Set([...prev, url]));
    setCustomInput('');
  };

  const removeCustomUrl = (url: string) => {
    setCustomUrls(prev => prev.filter(u => u !== url));
    setSelected(prev => { const n = new Set(prev); n.delete(url); return n; });
  };

  const groups = [...new Set(ROUTES.map(r => r.group))];

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div
        className="bg-neutral-800 border border-neutral-600 rounded-xl w-full max-w-md flex flex-col shadow-2xl"
        style={{ height: 'min(95vh, 740px)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-700 shrink-0">
          <div className="flex items-center gap-2">
            <Globe size={20} className="text-primary" />
            <h3 className="text-lg font-bold text-white"><EditableContent contentKey="deploy-content-manager-vaelg-sider-at-goere-redigerbare" fallback="Vælg sider at gøre redigerbare" /></h3>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-neutral-700 text-neutral-400 hover:text-white transition-colors"><X size={18} /></button>
        </div>

        {/* Info */}
        <div className="mx-5 mt-4 bg-blue-900/20 border border-blue-700/40 rounded-lg px-4 py-3 flex gap-2 shrink-0">
          <Info size={15} className="text-blue-400 shrink-0 mt-0.5" />
          <p className="text-xs text-blue-300">
            <EditableContent contentKey="deploy-content-manager-for-hver-url-scannes-sidens" fallback="For hver URL scannes sidens fil" /><span className="text-blue-200 font-medium"><EditableContent contentKey="deploy-content-manager-og-alle-importerede-komponenter" fallback="og alle importerede komponenter" /></span> <EditableContent contentKey="deploy-content-manager-rekursivt-konverterer-automatisk-bare-jsx-tekst" fallback="rekursivt.
            Konverterer automatisk: bare JSX-tekst," /><code className="bg-neutral-800 px-1 rounded">{'{"streng"}'}</code>,{' '}
            <code className="bg-neutral-800 px-1 rounded"><EditableContent contentKey="deploy-content-manager-getcontent-2" fallback="getContent(…)" /></code> <EditableContent contentKey="deploy-content-manager-kald-og" fallback="kald og" /><code className="bg-neutral-800 px-1 rounded"><EditableContent contentKey="deploy-content-manager-label-tekst" fallback="label: &#39;Tekst&#39;" /></code> <EditableContent contentKey="deploy-content-manager-i-objekt-arrays-vaelg" fallback="i objekt-arrays.
            Vælg" /><span className="text-blue-200 font-medium"><EditableContent contentKey="deploy-content-manager-layout" fallback="Layout" /></span> <EditableContent contentKey="deploy-content-manager-for-navbar-footer-de-inkluderes" fallback="for NavBar/Footer — de inkluderes" /><em><EditableContent contentKey="deploy-content-manager-kun" fallback="kun" /></em> <EditableContent contentKey="deploy-content-manager-naar-du-vaelger-dem" fallback="når du vælger dem." /></p>
        </div>

        {/* Quick select */}
        <div className="px-5 pt-3 flex flex-wrap gap-2 shrink-0">
          <button onClick={selectAll}  className="text-xs px-2 py-1 rounded bg-primary/20 text-primary hover:bg-primary/30 transition-colors"><EditableContent contentKey="deploy-content-manager-vaelg-alle" fallback="Vælg alle" /></button>
          <button onClick={clearAll}   className="text-xs px-2 py-1 rounded bg-neutral-700 text-neutral-300 hover:bg-neutral-600 transition-colors"><EditableContent contentKey="deploy-content-manager-fravaelg-alle" fallback="Fravælg alle" /></button>
          {groups.map(g => (
            <button key={g} onClick={() => selectGroup(g)} className="text-xs px-2 py-1 rounded bg-neutral-700 text-neutral-300 hover:bg-neutral-600 transition-colors">
              + {g}
            </button>
          ))}
          <span className="ml-auto text-xs text-neutral-400 self-center">{selected.size} <EditableContent contentKey="deploy-content-manager-valgt" fallback="valgt" /></span>
        </div>

        {/* Route list */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-4 min-h-0">
          {groups.map(group => (
            <div key={group}>
              <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">{group}</p>
              <div className="space-y-1">
                {ROUTES.filter(r => r.group === group).map(route => (
                  <label key={route.url} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-neutral-700/60 cursor-pointer group border border-transparent hover:border-neutral-600 transition-all">
                    <input
                      type="checkbox"
                      checked={selected.has(route.url)}
                      onChange={() => toggle(route.url)}
                      className="rounded accent-primary shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white font-medium group-hover:text-primary transition-colors">{route.label}</p>
                      <p className="text-xs font-mono text-neutral-500">{route.url}</p>
                    </div>
                    <Layout size={13} className="text-neutral-600 group-hover:text-neutral-400 shrink-0" />
                  </label>
                ))}
              </div>
            </div>
          ))}

          {/* Custom URLs */}
          <div>
            <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2"><EditableContent contentKey="deploy-content-manager-brugerdefineret-url" fallback="Brugerdefineret URL" /></p>
            {customUrls.map(url => (
              <label key={url} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-neutral-700/60 cursor-pointer group border border-transparent hover:border-neutral-600 transition-all mb-1">
                <input
                  type="checkbox"
                  checked={selected.has(url)}
                  onChange={() => toggle(url)}
                  className="rounded accent-primary shrink-0"
                />
                <p className="flex-1 text-xs font-mono text-neutral-300">{url}</p>
                <button
                  onClick={e => { e.preventDefault(); removeCustomUrl(url); }}
                  className="p-1 rounded hover:bg-red-900/40 text-neutral-600 hover:text-red-400 transition-colors shrink-0"
                >
                  <X size={12} />
                </button>
              </label>
            ))}
            <div className="flex gap-2 mt-2">
              <input
                type="text"
                value={customInput}
                onChange={e => setCustomInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomUrl(); } }}
                placeholder="/min-side eller /produkt/123"
                className="flex-1 text-xs font-mono bg-neutral-900 border border-neutral-600 rounded-lg px-3 py-2.5 text-neutral-200 placeholder-neutral-600 focus:outline-none focus:border-primary/60 transition-colors"
              />
              <button
                onClick={addCustomUrl}
                disabled={!customInput.trim()}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors shrink-0
                  ${!customInput.trim() ? 'bg-neutral-700 text-neutral-500 cursor-not-allowed' : 'bg-primary/20 hover:bg-primary/30 text-primary'}`}
              >
                <Plus size={13} /> <EditableContent contentKey="deploy-content-manager-tilfoej" fallback="Tilføj" /></button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-neutral-700 flex gap-3 shrink-0">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-white text-sm font-medium transition-colors"><EditableContent contentKey="deploy-content-manager-annuller" fallback="Annuller" /></button>
          <button
            disabled={selected.size === 0}
            onClick={() => onConfirm([...selected])}
            className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2
              ${selected.size === 0 ? 'bg-neutral-600 text-neutral-500 cursor-not-allowed' : 'bg-primary hover:bg-primary/90 text-white'}`}
          >
            <PlusSquare size={15} />
            <EditableContent contentKey="deploy-content-manager-scan" fallback="Scan" />{selected.size} <EditableContent contentKey="deploy-content-manager-side" fallback="side" />{selected.size !== 1 ? 'r' : ''}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Add Result Panel ─────────────────────────────────────────────────────────
const AddResultPanel: React.FC<{ result: AddEditableResult }> = ({ result }) => {
  const [open, setOpen] = useState<Record<string, boolean>>({ keys: true });
  const toggle = (k: string) => setOpen(p => ({ ...p, [k]: !p[k] }));

  const hasBlocked  = (result.blockedFiles ?? []).length > 0;
  const hasCommit   = result.addedKeys.length > 0;
  const hasErr      = result.errors.length > 0;

  // Header tone: blocked-only = amber, committed = green, pure-error = red
  const headerStyle = hasBlocked && !hasCommit
    ? 'bg-amber-900/30 border-amber-700/40'
    : hasErr && !hasCommit
      ? 'bg-red-900/30 border-red-700/40'
      : 'bg-green-900/20 border-green-700/30';

  const HeaderIcon = hasBlocked && !hasCommit
    ? <ShieldAlert size={20} className="text-amber-400" />
    : hasErr && !hasCommit
      ? <XCircle size={20} className="text-red-400" />
      : <CheckCircle size={20} className="text-green-400" />;

  return (
    <div className="border border-neutral-600 rounded-xl overflow-hidden">
      <div className={`px-5 py-4 flex items-center gap-3 border-b ${headerStyle}`}>
        {HeaderIcon}
        <div className="flex-1">
          <p className="font-semibold text-white">
            {hasCommit
              ? `${result.addedKeys.length} tekst-node${result.addedKeys.length !== 1 ? 'r' : ''} gjort redigerbar${result.addedKeys.length !== 1 ? 'e' : ''} i ${result.modifiedFiles.length} fil${result.modifiedFiles.length !== 1 ? 'er' : ''}`
              : hasBlocked
                ? `Ingen filer committed — ${result.blockedFiles.length} fil${result.blockedFiles.length !== 1 ? 'er' : ''} blokeret pga. JSX-fejl`
                : 'Ingen hardkodet tekst fundet — alt er allerede redigerbart'}
          </p>
          {hasBlocked && hasCommit && (
            <p className="text-xs text-amber-400 mt-0.5">
              {result.blockedFiles.length} <EditableContent contentKey="deploy-content-manager-fil" fallback="fil" />{result.blockedFiles.length !== 1 ? 'er' : ''} <EditableContent contentKey="deploy-content-manager-kunne-ikke-committes-kraever-manuel" fallback="kunne ikke committes — kræver manuel ret" /></p>
          )}
          {result.commitSha && (
            <a href={result.commitUrl ?? '#'} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-400 hover:underline mt-0.5">
              <ExternalLink size={11} /> <EditableContent contentKey="deploy-content-manager-commit" fallback="Commit:" />{result.commitSha.slice(0, 7)}
            </a>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3 p-5">
        <div className="bg-neutral-800 rounded-lg p-3 text-center">
          <Globe size={15} className="text-neutral-400 mx-auto mb-1" />
          <p className="text-xl font-bold text-neutral-300">{result.scannedFiles}</p>
          <p className="text-xs text-neutral-500"><EditableContent contentKey="deploy-content-manager-scannet" fallback="Scannet" /></p>
        </div>
        <div className="bg-neutral-800 rounded-lg p-3 text-center">
          <FileCode size={15} className="text-blue-400 mx-auto mb-1" />
          <p className="text-xl font-bold text-blue-400">{result.modifiedFiles.length}</p>
          <p className="text-xs text-neutral-500"><EditableContent contentKey="deploy-content-manager-aendret" fallback="Ændret" /></p>
        </div>
        <div className="bg-neutral-800 rounded-lg p-3 text-center">
          <Tag size={15} className="text-green-400 mx-auto mb-1" />
          <p className="text-xl font-bold text-green-400">{result.addedKeys.length}</p>
          <p className="text-xs text-neutral-500"><EditableContent contentKey="deploy-content-manager-noegler" fallback="Nøgler" /></p>
        </div>
        <div className="bg-neutral-800 rounded-lg p-3 text-center">
          <ShieldAlert size={15} className={hasBlocked ? 'text-amber-400 mx-auto mb-1' : 'text-neutral-600 mx-auto mb-1'} />
          <p className={`text-xl font-bold ${hasBlocked ? 'text-amber-400' : 'text-neutral-600'}`}>{(result.blockedFiles ?? []).length}</p>
          <p className="text-xs text-neutral-500"><EditableContent contentKey="deploy-content-manager-blokeret" fallback="Blokeret" /></p>
        </div>
      </div>

      <div className="px-5 pb-5 space-y-3">
        {result.addedKeys.length > 0 && (
          <Collapsible title={`Tilføjede nøgler (${result.addedKeys.length})`} color="green" open={!!open['keys']} onToggle={() => toggle('keys')}>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {result.addedKeys.map(({ key, fallback }) => (
                <div key={key} className="flex items-start gap-2 text-xs py-0.5">
                  <span className="font-mono text-green-300 shrink-0">{key}</span>
                  <span className="text-neutral-600">→</span>
                  <span className="text-neutral-400 italic truncate">"{fallback.slice(0, 70)}{fallback.length > 70 ? '…' : ''}"</span>
                </div>
              ))}
            </div>
          </Collapsible>
        )}

        {result.modifiedFiles.length > 0 && (
          <Collapsible title={`Ændrede filer (${result.modifiedFiles.length})`} color="blue" open={!!open['files']} onToggle={() => toggle('files')}>
            <TagList items={result.modifiedFiles} color="blue" mono />
          </Collapsible>
        )}

        {/* Blocked files — most important, always open */}
        {(result.blockedFiles ?? []).length > 0 && (
          <Collapsible
            title={`Blokerede filer — kræver manuel ret (${result.blockedFiles.length})`}
            color="amber"
            open
            onToggle={() => toggle('blocked')}
          >
            <div className="space-y-3">
              <p className="text-xs text-amber-400/80">
                <EditableContent contentKey="deploy-content-manager-disse-filer-indeholder-jsx-fejl-der" fallback="Disse filer indeholder JSX-fejl der ikke kunne auto-rettes (fx" /><code className="bg-neutral-800 px-1 rounded"><EditableContent contentKey="deploy-content-manager-editablecontent-2" fallback="<EditableContent>" /></code> <EditableContent contentKey="deploy-content-manager-inde-i" fallback="inde i" />{' '}
                <code className="bg-neutral-800 px-1 rounded"><EditableContent contentKey="deploy-content-manager-code" fallback="<code>" /></code> <EditableContent contentKey="deploy-content-manager-eller-ved-siden-af-et" fallback="eller ved siden af et" /><code className="bg-neutral-800 px-1 rounded">{'{'}</code><EditableContent contentKey="deploy-content-manager-udtryk" fallback="-udtryk)." />{' '}
                <EditableContent contentKey="deploy-content-manager-resten-af-filerne-er-committed" fallback="Resten af filerne er committed normalt. Ret disse manuelt og kør scanningen igen." /></p>
              {result.blockedFiles.map((bf, i) => (
                <div key={i} className="bg-neutral-900/60 rounded-lg p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <ShieldAlert size={13} className="text-amber-400 shrink-0" />
                    <span className="text-xs font-mono font-medium text-amber-300 truncate">{bf.file}</span>
                  </div>
                  <p className="text-xs text-neutral-400 pl-5">{bf.reason}</p>
                  {bf.unfixedErrors.map((e, j) => (
                    <div key={j} className="pl-5 space-y-0.5">
                      <p className="text-xs text-red-300 font-medium"><EditableContent contentKey="deploy-content-manager-linje" fallback="Linje" />{e.line}</p>
                      <p className="text-xs text-yellow-200/70 font-mono break-all">{e.issue}</p>
                      <p className="text-xs text-neutral-500 font-mono truncate">"{e.text}"</p>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </Collapsible>
        )}

        {result.jsxErrors && result.jsxErrors.filter(e => e.autoFixed).length > 0 && (
          <Collapsible
            title={`Auto-rettede JSX-fejl (${result.jsxErrors.filter(e => e.autoFixed).length})`}
            color="yellow"
            open={!!open['jsxFixed']}
            onToggle={() => toggle('jsxFixed')}
          >
            <div className="space-y-2">
              <p className="text-xs text-yellow-400/80 mb-2">
                <EditableContent contentKey="deploy-content-manager-disse-tekst-noder-var-i-ugyldige" fallback="Disse tekst-noder var i ugyldige JSX-placeringer og er automatisk rullet tilbage til original tekst." /></p>
              {result.jsxErrors.filter(e => e.autoFixed).map((e, i) => (
                <div key={i} className="bg-neutral-900/60 rounded p-2 space-y-0.5">
                  <div className="flex items-center gap-2">
                    <CheckCircle size={12} className="text-green-400 shrink-0" />
                    <span className="text-xs font-medium text-green-300"><EditableContent contentKey="deploy-content-manager-auto-rettet-linje" fallback="Auto-rettet — linje" />{e.line}</span>
                    <span className="text-xs text-neutral-500 font-mono ml-auto truncate max-w-[140px]">{e.file.split('/').pop()}</span>
                  </div>
                  <p className="text-xs text-yellow-200/70 font-mono break-all pl-4">{e.issue}</p>
                  <p className="text-xs text-neutral-500 font-mono truncate pl-4">"{e.text}"</p>
                </div>
              ))}
            </div>
          </Collapsible>
        )}

        {result.errors.length > 0 && (
          <Collapsible title={`Log (${result.errors.length})`} color="red" open={!!open['errors']} onToggle={() => toggle('errors')}>
            <ul className="space-y-1">{result.errors.map((e, i) => (
              <li key={i} className="flex gap-2 text-xs text-red-300"><AlertTriangle size={13} className="shrink-0 mt-0.5" /><span className="font-mono break-all">{e}</span></li>
            ))}</ul>
          </Collapsible>
        )}
      </div>
    </div>
  );
};

// ─── Shared sub-components ────────────────────────────────────────────────────
const colorMap = {
  green:  { bg: 'bg-green-900/20',  border: 'border-green-700/40',  text: 'text-green-400',  badge: 'bg-green-900/40 text-green-300'  },
  blue:   { bg: 'bg-blue-900/20',   border: 'border-blue-700/40',   text: 'text-blue-400',   badge: 'bg-blue-900/40 text-blue-300'    },
  yellow: { bg: 'bg-yellow-900/20', border: 'border-yellow-700/40', text: 'text-yellow-400', badge: 'bg-yellow-900/40 text-yellow-300' },
  amber:  { bg: 'bg-amber-900/20',  border: 'border-amber-700/40',  text: 'text-amber-400',  badge: 'bg-amber-900/40 text-amber-300'  },
  orange: { bg: 'bg-orange-900/20', border: 'border-orange-700/40', text: 'text-orange-400', badge: 'bg-orange-900/40 text-orange-300' },
  red:    { bg: 'bg-red-900/20',    border: 'border-red-700/40',    text: 'text-red-400',    badge: 'bg-red-900/40 text-red-300'      },
};

const Collapsible: React.FC<{ title: string; color: keyof typeof colorMap; open: boolean; onToggle: () => void; children: React.ReactNode }> = ({ title, color, open, onToggle, children }) => {
  const c = colorMap[color];
  return (
    <div className={`rounded-lg border ${c.border} overflow-hidden`}>
      <button onClick={onToggle} className={`w-full flex items-center justify-between px-4 py-2.5 ${c.bg} text-sm font-medium ${c.text} hover:brightness-110 transition-all`}>
        <span>{title}</span><span className="text-xs opacity-60">{open ? '▲' : '▼'}</span>
      </button>
      {open && <div className="px-4 py-3 bg-neutral-800/50">{children}</div>}
    </div>
  );
};

const TagList: React.FC<{ items: string[]; color: keyof typeof colorMap; mono?: boolean }> = ({ items, color, mono }) => {
  const c = colorMap[color];
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map(item => <span key={item} className={`text-xs px-2 py-0.5 rounded ${c.badge} ${mono ? 'font-mono' : ''}`}>{item}</span>)}
    </div>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────
const DeployContentManager: React.FC = () => {
  const [contentCount, setContentCount] = useState<number | null>(null);
  const [deployStatus, setDeployStatus] = useState<DeployStatus>('idle');
  const [deployResult, setDeployResult] = useState<DeployResult | null>(null);
  const [expanded, setExpanded]         = useState<Record<string, boolean>>({});
  const [hasTimer, setHasTimer]         = useState(false);
  const [showUrlPicker, setShowUrlPicker]   = useState(false);
  const [addStatus, setAddStatus]           = useState<AddStatus>('idle');
  const [addResult, setAddResult]           = useState<AddEditableResult | null>(null);
  const [scanningUrls, setScanningUrls]     = useState<string[]>([]);

  useEffect(() => {
    const h = (e: Event) => setHasTimer((e as CustomEvent).detail.msRemaining !== null);
    window.addEventListener('autoDeployTimerUpdate', h);
    setHasTimer(getAutoDeployMsRemaining() !== null);
    return () => window.removeEventListener('autoDeployTimerUpdate', h);
  }, []);

  const [excludedCount, setExcludedCount] = useState<number | null>(null);

  const loadCount = useCallback(async () => {
    // "or" covers legacy rows where no_deploy was never set (NULL treated as false).
    const { count } = await supabase.from('site_content').select('*', { count: 'exact', head: true })
      .or('no_deploy.is.null,no_deploy.eq.false');
    setContentCount(count ?? 0);
    const { count: excluded } = await supabase.from('site_content').select('*', { count: 'exact', head: true })
      .eq('no_deploy', true);
    setExcludedCount(excluded ?? 0);
  }, []);
  useEffect(() => { loadCount(); }, [loadCount]);

  const handleDeploy = async () => {
    if (deployStatus === 'loading') return;
    if (!window.confirm(
      `Deploy ${contentCount ?? 'all'} editable content row(s) til GitHub?\n\n` +
      `Dette vil:\n  • Opdatere fallback-værdier i kildefiler\n  • Committe til dit repository\n  • Slette de deployede rækker fra databasen`
    )) return;

    cancelAutoDeploy(); setHasTimer(false);
    setDeployStatus('loading'); setDeployResult(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');
      const base = await getSupabaseUrl();
      const res = await fetch(`${base}/functions/v1/deploy-content-to-github`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      });
      const data: DeployResult = await res.json();
      setDeployResult(data);
      if (data.errors.length > 0 && data.deployedKeys.length === 0) {
        setDeployStatus('error'); toast.error('Deploy fejlede');
      } else {
        setDeployStatus('success');
        toast.success(data.deployedKeys.length > 0
          ? `Deployed ${data.deployedKeys.length} nøgle(r)${data.netlifyTriggered ? ' · Netlify triggered ✓' : ''}`
          : (data.message ?? 'Intet at deploye'));
        await loadCount();
      }
    } catch (err: any) {
      setDeployStatus('error');
      setDeployResult({ totalRows: 0, deployedKeys: [], skippedKeys: [], unknownKeys: [], modifiedFiles: [], deletedFromDB: 0, commitSha: null, commitUrl: null, netlifyTriggered: false, errors: [err.message] });
      toast.error('Deploy fejlede');
    }
  };

  const handleAddEditable = async (urls: string[]) => {
    setShowUrlPicker(false);
    setScanningUrls(urls);
    setAddStatus('scanning'); setAddResult(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');
      const base = await getSupabaseUrl();
      const res = await fetch(`${base}/functions/v1/add-editable-content-to-github`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ urls, includeLayout: false }),
      });
      const data: AddEditableResult = await res.json();
      setAddResult(data);

      const hasBlocked = (data.blockedFiles ?? []).length > 0;
      const hasCommit  = data.addedKeys.length > 0;

      if (data.errors.length > 0 && !hasCommit && !hasBlocked) {
        setAddStatus('error'); toast.error('Tilføjelse fejlede');
      } else {
        setAddStatus('success');
        if (hasCommit && hasBlocked) {
          toast(`${data.addedKeys.length} nøgle(r) committed · ${data.blockedFiles.length} fil(er) blokeret`, { icon: '⚠️' });
        } else if (hasCommit) {
          toast.success(`${data.addedKeys.length} tekst-node(r) gjort redigerbare, committed til GitHub`);
        } else if (hasBlocked) {
          toast(`${data.blockedFiles.length} fil(er) blokeret — kræver manuel ret`, { icon: '🚫' });
        } else {
          toast.success('Ingen hardkodet tekst fundet');
        }
      }
    } catch (err: any) {
      setAddStatus('error');
      setAddResult({ scannedFiles: 0, modifiedFiles: [], addedKeys: [], skippedFiles: [], jsxErrors: [], blockedFiles: [], commitSha: null, commitUrl: null, errors: [err.message] });
      toast.error('Tilføjelse fejlede');
    }
  };

  const handleCancelTimer = () => { cancelAutoDeploy(); setHasTimer(false); toast('Auto-deploy annulleret', { icon: '⏹' }); };
  const toggle = (s: string) => setExpanded(p => ({ ...p, [s]: !p[s] }));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <GitBranch size={24} className="text-primary" />
        <div>
          <h2 className="text-xl font-bold text-white"><EditableContent contentKey="deploy-content-manager-deploy-til-github" fallback="Deploy til GitHub" /></h2>
          <p className="text-sm text-neutral-400"><EditableContent contentKey="deploy-content-manager-bager-redigerbart-indhold-ind-i" fallback="Bager redigerbart indhold ind i kildekoden som hardcoded værdier" /></p>
        </div>
      </div>

      <div className="bg-neutral-700/40 border border-neutral-600 rounded-lg p-4 flex gap-3">
        <Info size={18} className="text-blue-400 shrink-0 mt-0.5" />
        <div className="text-sm text-neutral-300 space-y-1">
          <p><EditableContent contentKey="deploy-content-manager-deploy-funktionen-synkroniser-aendret-indhold-fra" fallback="Deploy-funktionen synkroniser ændret indhold fra databasen tilbage til kildekoden:" /></p>
          <ol className="list-decimal list-inside space-y-0.5 text-neutral-400">
            <li><EditableContent contentKey="deploy-content-manager-henter-alle-raekker-fra" fallback="Henter alle rækker fra" /><code className="text-xs bg-neutral-800 px-1 rounded"><EditableContent contentKey="deploy-content-manager-site-content" fallback="site_content" /></code></li>
            <li><EditableContent contentKey="deploy-content-manager-opdaterer" fallback="Opdaterer" /><code className="text-xs bg-neutral-800 px-1 rounded"><EditableContent contentKey="deploy-content-manager-fallback-2" fallback="fallback" /></code><EditableContent contentKey="deploy-content-manager-vaerdier-i-kildefilerne" fallback="-værdier i kildefilerne" /></li>
            <li><EditableContent contentKey="deploy-content-manager-committer-til-github-trigger-netlify" fallback="Committer til GitHub + trigger Netlify rebuild" /></li>
          </ol>
          <p className="text-neutral-500 text-xs mt-1"><EditableContent contentKey="deploy-content-manager-auto-deploy-sker-8-minutter-efter" fallback="Auto-deploy sker 8 minutter efter den seneste ændring." /></p>
        </div>
      </div>

      {hasTimer && <AutoDeployCountdown onCancel={handleCancelTimer} />}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-neutral-700/50 rounded-lg p-4 border border-neutral-600">
          <p className="text-xs text-neutral-400 uppercase tracking-wider mb-1"><EditableContent contentKey="deploy-content-manager-klar-til-deploy" fallback="Klar til deploy" /></p>
          <p className="text-3xl font-bold text-white">{contentCount === null ? '…' : contentCount}</p>
          <p className="text-xs text-neutral-500 mt-1"><EditableContent contentKey="deploy-content-manager-raekker-i-site-content" fallback="rækker i site_content" /></p>
        </div>
        <div className="bg-neutral-700/50 rounded-lg p-4 border border-neutral-600 flex flex-col justify-between">
          <p className="text-xs text-neutral-400 uppercase tracking-wider mb-2"><EditableContent contentKey="deploy-content-manager-status" fallback="Status" /></p>
          {deployStatus === 'idle'    && <span className="text-sm text-neutral-400"><EditableContent contentKey="deploy-content-manager-klar" fallback="Klar" /></span>}
          {deployStatus === 'loading' && <span className="flex items-center gap-2 text-sm text-yellow-400"><RefreshCw size={14} className="animate-spin" /> <EditableContent contentKey="deploy-content-manager-deployer" fallback="Deployer…" /></span>}
          {deployStatus === 'success' && <span className="flex items-center gap-2 text-sm text-green-400"><CheckCircle size={14} /> <EditableContent contentKey="deploy-content-manager-gennemfoert" fallback="Gennemført" /></span>}
          {deployStatus === 'error'   && <span className="flex items-center gap-2 text-sm text-red-400"><XCircle size={14} /> <EditableContent contentKey="deploy-content-manager-fejl" fallback="Fejl" /></span>}
        </div>
      </div>

      {!!excludedCount && (
        <p className="text-xs text-neutral-500 -mt-2 flex items-center gap-1.5">
          <ShieldAlert size={12} className="text-amber-500" />
          {excludedCount} nøgle{excludedCount !== 1 ? 'r' : ''} er markeret &ldquo;kun database&rdquo; og udelades fra deploy.
        </p>
      )}

      {/* Action buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button
          onClick={handleDeploy}
          disabled={deployStatus === 'loading' || contentCount === 0}
          className={`flex items-center justify-center gap-2 px-5 py-3 rounded-lg font-semibold transition-all text-white
            ${deployStatus === 'loading' ? 'bg-neutral-600 cursor-not-allowed'
              : contentCount === 0 ? 'bg-neutral-700 cursor-not-allowed text-neutral-500'
              : 'bg-primary hover:bg-primary/90 active:scale-[0.98]'}`}
        >
          {deployStatus === 'loading' ? <><RefreshCw size={17} className="animate-spin" /> <EditableContent contentKey="deploy-content-manager-deployer-2" fallback="Deployer…" /></> : <><Rocket size={17} /> <EditableContent contentKey="deploy-content-manager-deploy-til-github-2" fallback="Deploy til GitHub" /></>}
        </button>

        <button
          onClick={() => setShowUrlPicker(true)}
          disabled={addStatus === 'scanning'}
          className={`flex items-center justify-center gap-2 px-5 py-3 rounded-lg font-semibold transition-all border
            ${addStatus === 'scanning'
              ? 'bg-neutral-700 border-neutral-600 text-neutral-400 cursor-not-allowed'
              : 'bg-neutral-700/60 border-neutral-500 hover:bg-neutral-600 hover:border-primary/60 text-white active:scale-[0.98]'}`}
        >
          {addStatus === 'scanning'
            ? <><RefreshCw size={17} className="animate-spin" /> <EditableContent contentKey="deploy-content-manager-scanner" fallback="Scanner" />{scanningUrls.length} <EditableContent contentKey="deploy-content-manager-side-2" fallback="side" />{scanningUrls.length !== 1 ? 'r' : ''}…</>
            : <><PlusSquare size={17} className="text-primary" /> <EditableContent contentKey="deploy-content-manager-goer-tekst-redigerbar" fallback="Gør tekst redigerbar" /></>}
        </button>
      </div>

      {contentCount === 0 && deployStatus !== 'loading' && (
        <p className="text-center text-sm text-neutral-500"><EditableContent contentKey="deploy-content-manager-ingen-redigerbart-indhold-at-deploye" fallback="Ingen redigerbart indhold at deploye – databasen er ren." /></p>
      )}

      {/* Hint */}
      <div className="bg-neutral-800/50 border border-neutral-700 rounded-lg px-4 py-3 flex gap-2">
        <Globe size={14} className="text-primary shrink-0 mt-0.5" />
        <p className="text-xs text-neutral-400">
          <span className="text-neutral-200 font-medium"><EditableContent contentKey="deploy-content-manager-goer-tekst-redigerbar-2" fallback="Gør tekst redigerbar" /></span> <EditableContent contentKey="deploy-content-manager-vaelg-sider-via-url-og" fallback="— Vælg sider via URL, og backend'en scanner siden og alle importerede komponenter rekursivt.
          Konverterer bare JSX-tekst," /><code className="bg-neutral-900 px-1 rounded text-neutral-300">{"streng"}</code><EditableContent contentKey="deploy-content-manager-udtryk-2" fallback="-udtryk," />{' '}
          <code className="bg-neutral-900 px-1 rounded text-neutral-300"><EditableContent contentKey="deploy-content-manager-getcontent" fallback="getContent()" /></code> <EditableContent contentKey="deploy-content-manager-kald-og-objekt-labels-til" fallback="kald og objekt-labels til" />{' '}
          <code className="bg-neutral-900 px-1 rounded text-neutral-300"><EditableContent contentKey="deploy-content-manager-editablecontent" fallback="<EditableContent />" /></code><EditableContent contentKey="deploy-content-manager-filer-med-ikke-auto-rettelige-jsx-fejl-committes" fallback=".
          Filer med ikke-auto-rettelige JSX-fejl committes" /><em><EditableContent contentKey="deploy-content-manager-ikke" fallback="ikke" /></em> <EditableContent contentKey="deploy-content-manager-resten-fortsaetter-normalt" fallback="— resten fortsætter normalt." /></p>
      </div>

      {addResult && <AddResultPanel result={addResult} />}

      {/* Deploy result */}
      {deployResult && (
        <div className="space-y-4 border border-neutral-600 rounded-xl overflow-hidden">
          <div className={`px-5 py-4 flex items-center gap-3 ${deployResult.errors.length > 0 && !deployResult.deployedKeys.length ? 'bg-red-900/30 border-b border-red-700/40' : 'bg-green-900/20 border-b border-green-700/30'}`}>
            {deployResult.errors.length > 0 && !deployResult.deployedKeys.length ? <XCircle size={20} className="text-red-400" /> : <CheckCircle size={20} className="text-green-400" />}
            <div className="flex-1">
              <p className="font-semibold text-white">
                {deployResult.message ?? (deployResult.deployedKeys.length > 0 ? `${deployResult.deployedKeys.length} nøgle(r) deployed og committed til GitHub` : 'Ingen ændringer foretaget')}
              </p>
              {deployResult.commitSha && (
                <a href={deployResult.commitUrl ?? '#'} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-400 hover:underline mt-0.5">
                  <ExternalLink size={11} /> <EditableContent contentKey="deploy-content-manager-commit-2" fallback="Commit:" />{deployResult.commitSha.slice(0, 7)}
                </a>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-5">
            {[
              { label: 'Deployed',      value: deployResult.deployedKeys.length,  color: 'text-green-400',  icon: CheckCircle },
              { label: 'Sprunget over', value: deployResult.skippedKeys.length,   color: 'text-yellow-400', icon: SkipForward  },
              { label: 'Filer ændret',  value: deployResult.modifiedFiles.length, color: 'text-blue-400',   icon: FileCode     },
              { label: 'Netlify', value: deployResult.netlifyTriggered ? '✓' : '–', color: deployResult.netlifyTriggered ? 'text-green-400' : 'text-neutral-500', icon: Globe },
            ].map(({ label, value, color, icon: Icon }) => (
              <div key={label} className="bg-neutral-800 rounded-lg p-3 text-center">
                <Icon size={16} className={`${color} mx-auto mb-1`} />
                <p className={`text-xl font-bold ${color}`}>{value}</p>
                <p className="text-xs text-neutral-500">{label}</p>
              </div>
            ))}
          </div>
          {(deployResult.unknownKeys ?? []).length > 0 && (
            <div className="mx-5 bg-orange-900/20 border border-orange-700/40 rounded-lg px-4 py-3 flex gap-2">
              <FileQuestion size={15} className="text-orange-400 shrink-0 mt-0.5" />
              <p className="text-xs text-orange-300">
                <span className="font-semibold">{deployResult.unknownKeys.length} <EditableContent contentKey="deploy-content-manager-ukendte-noegle" fallback="ukendte nøgle" />{deployResult.unknownKeys.length !== 1 ? 'r' : ''}</span> <EditableContent contentKey="deploy-content-manager-blev-ikke-fundet-i-kildekoden" fallback="blev ikke fundet i kildekoden og er skrevet til" />{' '}
                <code className="bg-neutral-800 px-1 rounded text-orange-200"><EditableContent contentKey="deploy-content-manager-src-content-unknown-keys-ts-2" fallback="src/content/unknown-keys.ts" /></code> <EditableContent contentKey="deploy-content-manager-i-stedet" fallback="i stedet." />
              </p>
            </div>
          )}
          <div className="px-5 pb-5 space-y-3">
            {deployResult.deployedKeys.length > 0 && (
              <Collapsible title={`Deployed nøgler (${deployResult.deployedKeys.length})`} color="green" open={!!expanded['deployed']} onToggle={() => toggle('deployed')}>
                <TagList items={deployResult.deployedKeys} color="green" />
              </Collapsible>
            )}
            {deployResult.modifiedFiles.length > 0 && (
              <Collapsible title={`Ændrede filer (${deployResult.modifiedFiles.length})`} color="blue" open={!!expanded['files']} onToggle={() => toggle('files')}>
                <TagList items={deployResult.modifiedFiles} color="blue" mono />
              </Collapsible>
            )}
            {deployResult.skippedKeys.length > 0 && (
              <Collapsible title={`Sprunget over (${deployResult.skippedKeys.length})`} color="yellow" open={!!expanded['skipped']} onToggle={() => toggle('skipped')}>
                <p className="text-xs text-neutral-400 mb-2"><EditableContent contentKey="deploy-content-manager-disse-noegler-er-i-databasen" fallback="Disse nøgler er i databasen men mangler i kildekoden som" /><code className="bg-neutral-800 px-1 rounded"><EditableContent contentKey="deploy-content-manager-fallback" fallback="fallback" /></code>.</p>
                <TagList items={deployResult.skippedKeys} color="yellow" />
              </Collapsible>
            )}
            {(deployResult.unknownKeys ?? []).length > 0 && (
              <Collapsible title={`Ukendte nøgler (${deployResult.unknownKeys.length})`} color="orange" open={!!expanded['unknown']} onToggle={() => toggle('unknown')}>
                <p className="text-xs text-neutral-400 mb-2">
                  <EditableContent contentKey="deploy-content-manager-disse-noegler-er-deployed-og" fallback="Disse nøgler er deployed og slettet fra databasen, men var ikke tilgængelige til at indsætte direkte i kildekoden.                   De er i stedet skrevet til" />{' '}
                  <code className="bg-neutral-800 px-1 rounded"><EditableContent contentKey="deploy-content-manager-src-content-unknown-keys-ts" fallback="src/content/unknown-keys.ts" /></code>{' '}
                  <EditableContent contentKey="deploy-content-manager-som-eksporterede-konstanter-og-kan" fallback="som eksporterede konstanter, og kan bruges manuelt fra den fil." />
                </p>
                <TagList items={deployResult.unknownKeys} color="orange" />
              </Collapsible>
            )}
            {deployResult.errors.length > 0 && (
              <Collapsible title={`Fejl (${deployResult.errors.length})`} color="red" open={expanded['errors'] !== false} onToggle={() => toggle('errors')}>
                <ul className="space-y-1">{deployResult.errors.map((e, i) => (
                  <li key={i} className="flex gap-2 text-xs text-red-300"><AlertTriangle size={13} className="shrink-0 mt-0.5" /><span className="font-mono break-all">{e}</span></li>
                ))}</ul>
              </Collapsible>
            )}
          </div>
        </div>
      )}

      {showUrlPicker && <UrlPickerModal onClose={() => setShowUrlPicker(false)} onConfirm={handleAddEditable} />}
    </div>
  );
};

export default DeployContentManager;
