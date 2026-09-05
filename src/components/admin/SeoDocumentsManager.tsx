import EditableContent from '../EditableContent';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  FileText, Plus, Trash2, Globe, Eye, EyeOff, Save,
  ExternalLink, RefreshCw, CheckCircle, XCircle, AlertTriangle,
  ChevronLeft, Search, Tag, BookOpen, Rocket, Clock, Code,
} from 'lucide-react';
import { supabase } from '../../utils/supabase';
import toast from 'react-hot-toast';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SeoDocument {
  id: string;
  title: string;
  slug: string;
  deployed_slug: string | null;
  description: string;
  keywords: string;
  content: string;
  og_image: string | null;
  canonical: string | null;
  robots: string;
  status: 'draft' | 'published';
  deployed_at: string | null;
  commit_sha: string | null;
  created_at: string;
  updated_at: string;
}

type SaveStatus = 'idle' | 'saving-draft' | 'publishing' | 'success' | 'error';

const ROBOTS_OPTIONS = [
  'index, follow',
  'index, nofollow',
  'noindex, follow',
  'noindex, nofollow',
];

async function getSupabaseUrl(): Promise<string> {
  return (supabase as any).supabaseUrl as string || import.meta.env.VITE_SUPABASE_URL;
}

// ─── Slug generator ───────────────────────────────────────────────────────────

function titleToSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/æ/g, 'ae').replace(/ø/g, 'oe').replace(/å/g, 'aa')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60);
}

// ─── Description meter ───────────────────────────────────────────────────────

const DescMeter: React.FC<{ value: string }> = ({ value }) => {
  const len = value.length;
  const pct = Math.min((len / 160) * 100, 100);
  const color = len < 50 ? '#f97316' : len <= 160 ? '#22c55e' : '#ef4444';
  return (
    <div className="mt-1 flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-neutral-700 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <span className="text-xs font-mono" style={{ color }}>
        {len}/160
      </span>
    </div>
  );
};

// ─── Rich text toolbar ────────────────────────────────────────────────────────

const ToolbarBtn: React.FC<{
  title: string;
  onClick: () => void;
  children: React.ReactNode;
  active?: boolean;
}> = ({ title, onClick, children, active }) => (
  <button
    type="button"
    title={title}
    onClick={onClick}
    className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
      active
        ? 'bg-primary text-white'
        : 'bg-neutral-700 text-neutral-300 hover:bg-neutral-600 hover:text-white'
    }`}
  >
    {children}
  </button>
);

interface RichEditorProps {
  value: string;
  onChange: (v: string) => void;
}

const RichEditor: React.FC<RichEditorProps> = ({ value, onChange }) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<'visual' | 'html'>('visual');
  const [htmlValue, setHtmlValue] = useState(value);

  // Sync from parent on mount / when switching to visual
  useEffect(() => {
    if (mode === 'visual' && editorRef.current) {
      editorRef.current.innerHTML = value;
    }
  }, [mode]);

  useEffect(() => {
    setHtmlValue(value);
  }, [value]);

  const exec = (cmd: string, val?: string) => {
    document.execCommand(cmd, false, val);
    if (editorRef.current) onChange(editorRef.current.innerHTML);
  };

  const insertHeading = (tag: string) => {
    exec('formatBlock', tag);
  };

  const insertLink = () => {
    const url = prompt('URL (inkl. https://):');
    if (url) exec('createLink', url);
  };

  const insertTable = () => {
    const rows = parseInt(prompt('Antal rækker:', '3') || '3');
    const cols = parseInt(prompt('Antal kolonner:', '3') || '3');
    let html = '<table><tbody>';
    for (let r = 0; r < rows; r++) {
      html += '<tr>';
      for (let c = 0; c < cols; c++) {
        html += r === 0 ? `<th>Overskrift ${c + 1}</th>` : `<td>Celle</td>`;
      }
      html += '</tr>';
    }
    html += '</tbody></table>';
    exec('insertHTML', html);
  };

  const handleHtmlChange = (raw: string) => {
    setHtmlValue(raw);
    onChange(raw);
  };

  return (
    <div className="border border-neutral-600 rounded-lg overflow-hidden bg-neutral-900">
      {/* Mode toggle */}
      <div className="flex items-center justify-between bg-neutral-800 border-b border-neutral-700 px-2 py-1.5">
        <div className="flex flex-wrap gap-1">
          {mode === 'visual' && (
            <>
              <ToolbarBtn title="Fed" onClick={() => exec('bold')}><strong><EditableContent contentKey="seo-documents-manager-f" fallback="F" /></strong></ToolbarBtn>
              <ToolbarBtn title="Kursiv" onClick={() => exec('italic')}><em><EditableContent contentKey="seo-documents-manager-k" fallback="K" /></em></ToolbarBtn>
              <ToolbarBtn title="Understreg" onClick={() => exec('underline')}><u><EditableContent contentKey="seo-documents-manager-u" fallback="U" /></u></ToolbarBtn>
              <div className="w-px bg-neutral-600 mx-1" />
              <ToolbarBtn title="H1" onClick={() => insertHeading('h1')}><EditableContent contentKey="seo-documents-manager-h1" fallback="H1" /></ToolbarBtn>
              <ToolbarBtn title="H2" onClick={() => insertHeading('h2')}><EditableContent contentKey="seo-documents-manager-h2" fallback="H2" /></ToolbarBtn>
              <ToolbarBtn title="H3" onClick={() => insertHeading('h3')}><EditableContent contentKey="seo-documents-manager-h3" fallback="H3" /></ToolbarBtn>
              <div className="w-px bg-neutral-600 mx-1" />
              <ToolbarBtn title="Punktliste" onClick={() => exec('insertUnorderedList')}><EditableContent contentKey="seo-documents-manager-liste" fallback="• Liste" /></ToolbarBtn>
              <ToolbarBtn title="Nummerliste" onClick={() => exec('insertOrderedList')}><EditableContent contentKey="seo-documents-manager-1-liste" fallback="1. Liste" /></ToolbarBtn>
              <ToolbarBtn title="Citat" onClick={() => exec('formatBlock', 'blockquote')}>❝</ToolbarBtn>
              <div className="w-px bg-neutral-600 mx-1" />
              <ToolbarBtn title="Link" onClick={insertLink}><EditableContent contentKey="seo-documents-manager-link" fallback="🔗 Link" /></ToolbarBtn>
              <ToolbarBtn title="Tabel" onClick={insertTable}><EditableContent contentKey="seo-documents-manager-tabel" fallback="⊞ Tabel" /></ToolbarBtn>
              <ToolbarBtn title="Separator" onClick={() => exec('insertHTML', '<hr>')}> — </ToolbarBtn>
            </>
          )}
        </div>
        <div className="flex gap-1 ml-2 shrink-0">
          <button
            type="button"
            onClick={() => setMode('visual')}
            className={`text-xs px-2 py-0.5 rounded transition-colors ${mode === 'visual' ? 'bg-primary text-white' : 'text-neutral-400 hover:text-white'}`}
          >
            <EditableContent contentKey="seo-documents-manager-visuel" fallback="Visuel" />
          </button>
          <button
            type="button"
            onClick={() => {
              if (mode === 'visual' && editorRef.current) {
                setHtmlValue(editorRef.current.innerHTML);
              }
              setMode(mode === 'visual' ? 'html' : 'visual');
            }}
            className={`text-xs px-2 py-0.5 rounded transition-colors flex items-center gap-1 ${mode === 'html' ? 'bg-primary text-white' : 'text-neutral-400 hover:text-white'}`}
          >
            <Code size={11} /> <EditableContent contentKey="seo-documents-manager-html" fallback="HTML" />
          </button>
        </div>
      </div>

      {/* Editor area */}
      {mode === 'visual' ? (
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={() => {
            if (editorRef.current) onChange(editorRef.current.innerHTML);
          }}
          className="min-h-64 p-4 outline-none text-neutral-200 text-sm leading-relaxed"
          style={{ fontFamily: 'inherit' }}
          data-placeholder="Skriv dit dokument her... Brug toolbar til formatering."
        />
      ) : (
        <textarea
          value={htmlValue}
          onChange={e => handleHtmlChange(e.target.value)}
          className="w-full min-h-64 p-4 bg-transparent text-neutral-200 text-xs font-mono leading-relaxed outline-none resize-y"
          placeholder="<p>Indsæt HTML her...</p>"
          spellCheck={false}
        />
      )}

      {/* Char count */}
      <div className="px-3 py-1.5 bg-neutral-800 border-t border-neutral-700 flex justify-between text-xs text-neutral-500">
        <span>
          {mode === 'visual' ? 'Visuel editor — rige tekst understøttes' : 'Rå HTML — Google læser al tekst i <body>'}
        </span>
        <span>{value.replace(/<[^>]*>/g, '').length} <EditableContent contentKey="seo-documents-manager-ord-ca" fallback="ord (ca.)" /></span>
      </div>
    </div>
  );
};

// ─── Document form ────────────────────────────────────────────────────────────

interface DocFormProps {
  doc: Partial<SeoDocument>;
  onSave: (doc: Partial<SeoDocument>) => Promise<void>;
  onDelete: (doc: SeoDocument) => Promise<void>;
  onBack: () => void;
  saveStatus: SaveStatus;
}

const DocForm: React.FC<DocFormProps> = ({
  doc: initialDoc,
  onSave,
  onDelete,
  onBack,
  saveStatus,
}) => {
  const [form, setForm] = useState<Partial<SeoDocument>>(initialDoc);
  const [slugTouched, setSlugTouched] = useState(!!initialDoc.slug);

  // Sync form when parent pushes updated doc back (e.g. after first insert gives us an id,
  // or after deploy updates deployed_at / deployed_slug). Preserve any in-progress edits
  // by only syncing fields the user hasn't touched (id, deployed_at, deployed_slug, commit_sha).
  useEffect(() => {
    setForm(prev => ({
      ...prev,
      id:            initialDoc.id,
      deployed_slug: initialDoc.deployed_slug,
      deployed_at:   initialDoc.deployed_at,
      commit_sha:    initialDoc.commit_sha,
      status:        initialDoc.status,
    }));
  }, [initialDoc.id, initialDoc.deployed_slug, initialDoc.deployed_at, initialDoc.status]);

  const set = (field: keyof SeoDocument, value: string) => {
    setForm(prev => {
      const next = { ...prev, [field]: value };
      // Auto-generate slug from title if not manually touched
      if (field === 'title' && !slugTouched) {
        next.slug = titleToSlug(value);
      }
      return next;
    });
  };

  const previewUrl = `https://flai.dk/docs/${form.slug || 'min-side'}`;

  const isNew = !form.id;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-neutral-400 hover:text-white text-sm transition-colors"
        >
          <ChevronLeft size={16} />
          <EditableContent contentKey="seo-documents-manager-alle-dokumenter" fallback="Alle dokumenter" />
        </button>
        <div className="flex items-center gap-2 flex-wrap">
          {!isNew && form.status === 'published' && form.deployed_at && (
            <a
              href={previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-neutral-300 transition-colors"
            >
              <Eye size={13} />
              <EditableContent contentKey="seo-documents-manager-se-live-side" fallback="Se live side" />
            </a>
          )}
          {/* Draft save — always available */}
          {(form.status === 'draft' || isNew) && (
            <button
              onClick={() => onSave({ ...form, status: 'draft' })}
              disabled={saveStatus !== 'idle'}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-white text-sm font-medium transition-colors disabled:opacity-50"
            >
              {saveStatus === 'saving-draft'
                ? <><RefreshCw size={14} className="animate-spin" /> <EditableContent contentKey="seo-documents-manager-gemmer-2" fallback="Gemmer…" /></>
                : <><Save size={14} /> <EditableContent contentKey="seo-documents-manager-gem-kladde" fallback="Gem kladde" /></>}
            </button>
          )}
          {/* Publish = save + auto-deploy to GitHub */}
          {!isNew && form.status === 'published' && (
            <button
              onClick={() => onSave({ ...form, status: 'draft' })}
              disabled={saveStatus !== 'idle'}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-yellow-700/40 hover:bg-yellow-700/60 text-yellow-300 text-sm font-medium transition-colors disabled:opacity-50"
            >
              <EyeOff size={14} /> <EditableContent contentKey="seo-documents-manager-saet-til-kladde" fallback="Sæt til kladde" />
            </button>
          )}
          <button
            onClick={() => onSave({ ...form, status: 'published' })}
            disabled={saveStatus !== 'idle'}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all active:scale-[0.97] ${
              saveStatus !== 'idle'
                ? 'bg-neutral-600 cursor-not-allowed text-neutral-400'
                : 'bg-primary hover:bg-primary/90 text-white'
            }`}
          >
            {saveStatus === 'publishing'
              ? <><RefreshCw size={14} className="animate-spin" /> <EditableContent contentKey="seo-documents-manager-deployer-til-github" fallback="Deployer til GitHub…" /></>
              : saveStatus === 'saving-draft'
              ? <><RefreshCw size={14} className="animate-spin" /> <EditableContent contentKey="seo-documents-manager-gemmer" fallback="Gemmer…" /></>
              : <><Rocket size={14} /> {form.status === 'published' ? 'Gem + re-deploy' : 'Publicér → GitHub'}</>}
          </button>
        </div>
      </div>

      {/* Status bar */}
      {!isNew && (
        <div className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm border ${
          saveStatus === 'publishing'
            ? 'bg-blue-900/20 border-blue-700/40 text-blue-300'
            : form.status === 'published'
            ? form.deployed_at
              ? 'bg-green-900/20 border-green-700/40 text-green-300'
              : 'bg-yellow-900/20 border-yellow-700/40 text-yellow-300'
            : 'bg-neutral-700/30 border-neutral-600 text-neutral-400'
        }`}>
          {saveStatus === 'publishing' ? (
            <><RefreshCw size={15} className="animate-spin" /> <EditableContent contentKey="seo-documents-manager-gemmer-og-deployer-til-github" fallback="Gemmer og deployer til GitHub — Netlify bygger om…" /></>
          ) : form.status === 'published' ? (
            form.deployed_at ? (
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <CheckCircle size={15} />
                  <EditableContent contentKey="seo-documents-manager-live-paa" fallback="Live på" /> <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="underline font-mono text-xs">{previewUrl}</a>
                  <span className="ml-auto text-xs opacity-70 flex items-center gap-1">
                    <Clock size={11} />
                    {new Date(form.deployed_at).toLocaleDateString('da-DK', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                {/* Rename warning — deployed_slug differs from current slug */}
                {form.deployed_slug && form.deployed_slug !== form.slug && (
                  <div className="flex items-center gap-2 text-xs text-amber-300 bg-amber-900/20 border border-amber-700/30 rounded px-2 py-1">
                    <AlertTriangle size={12} className="shrink-0" />
                    <EditableContent contentKey="seo-documents-manager-slug-aendret-siden-sidst-deploy" fallback="Slug ændret siden sidst deploy. Gammel URL" /> <span className="font-mono"><EditableContent contentKey="seo-documents-manager-flai-dk-docs-3" fallback="flai.dk/docs/" />{form.deployed_slug}</span> <EditableContent contentKey="seo-documents-manager-slettes-automatisk-ved-naeste-gem" fallback="slettes automatisk ved næste &quot;Gem + re-deploy&quot;." />
                  </div>
                )}
              </div>
            ) : (
              <><AlertTriangle size={15} /> <EditableContent contentKey="seo-documents-manager-klar-til-deploy-klik-public" fallback="Klar til deploy — klik &quot;Publicér → GitHub&quot;" /></>
            )
          ) : (
            <><EyeOff size={15} /> <EditableContent contentKey="seo-documents-manager-kladde-ikke-synlig-for-google" fallback="Kladde — ikke synlig for Google" /></>
          )}
        </div>
      )}

      {/* ── SEO Fields ── */}
      <div className="bg-neutral-700/30 border border-neutral-600 rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-semibold text-neutral-300 flex items-center gap-2">
          <Tag size={15} className="text-primary" />
          <EditableContent contentKey="seo-documents-manager-seo-meta-data" fallback="SEO Meta-data" />
          <span className="text-xs font-normal text-neutral-500 ml-1"><EditableContent contentKey="seo-documents-manager-hvad-google-viser-i-soegeresultater" fallback="— hvad Google viser i søgeresultater" /></span>
        </h3>

        {/* Title */}
        <div>
          <label className="block text-xs font-medium text-neutral-400 mb-1">
            <EditableContent contentKey="seo-documents-manager-sidetitel" fallback="Sidetitel" /> <span className="text-red-400">*</span>
            <span className="float-right text-neutral-500">{(form.title || '').length}<EditableContent contentKey="seo-documents-manager-60-anbefalet" fallback="/60 anbefalet" /></span>
          </label>
          <input
            type="text"
            value={form.title || ''}
            onChange={e => set('title', e.target.value)}
            placeholder="fx. Droneservice i København – Luftfoto til Ejendomme"
            className="w-full bg-neutral-800 border border-neutral-600 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-primary/60 transition-colors"
          />
        </div>

        {/* Slug */}
        <div>
          <label className="block text-xs font-medium text-neutral-400 mb-1">
            <EditableContent contentKey="seo-documents-manager-url-slug" fallback="URL-slug" /> <span className="text-red-400">*</span>
            <span className="float-right font-mono text-neutral-500 text-xs"><EditableContent contentKey="seo-documents-manager-flai-dk-docs-2" fallback="flai.dk/docs/" /><strong className="text-neutral-300">{form.slug || '…'}</strong></span>
          </label>
          <input
            type="text"
            value={form.slug || ''}
            onChange={e => { setSlugTouched(true); set('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-')); }}
            placeholder="droneservice-koebenhavn"
            className="w-full bg-neutral-800 border border-neutral-600 rounded-lg px-3 py-2.5 text-white text-sm font-mono focus:outline-none focus:border-primary/60 transition-colors"
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs font-medium text-neutral-400 mb-1">
            <EditableContent contentKey="seo-documents-manager-meta-beskrivelse" fallback="Meta-beskrivelse" /> <span className="text-red-400">*</span>
          </label>
          <textarea
            value={form.description || ''}
            onChange={e => set('description', e.target.value)}
            rows={2}
            placeholder="Kort beskrivelse der vises i Googles søgeresultater. Hold under 160 tegn."
            className="w-full bg-neutral-800 border border-neutral-600 rounded-lg px-3 py-2.5 text-white text-sm resize-none focus:outline-none focus:border-primary/60 transition-colors"
          />
          <DescMeter value={form.description || ''} />
        </div>

        {/* Keywords + Robots */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-neutral-400 mb-1">
              <EditableContent contentKey="seo-documents-manager-noegleord" fallback="Nøgleord" />
              <span className="float-right text-neutral-500"><EditableContent contentKey="seo-documents-manager-kommasepareret" fallback="kommasepareret" /></span>
            </label>
            <input
              type="text"
              value={form.keywords || ''}
              onChange={e => set('keywords', e.target.value)}
              placeholder="drone, luftfoto, København, erhverv"
              className="w-full bg-neutral-800 border border-neutral-600 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-primary/60 transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-400 mb-1">
              <EditableContent contentKey="seo-documents-manager-robots" fallback="Robots" />
            </label>
            <select
              value={form.robots || 'index, follow'}
              onChange={e => set('robots', e.target.value)}
              className="w-full bg-neutral-800 border border-neutral-600 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-primary/60 transition-colors"
            >
              {ROBOTS_OPTIONS.map(o => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </div>
        </div>

        {/* OG Image */}
        <div>
          <label className="block text-xs font-medium text-neutral-400 mb-1">
            <EditableContent contentKey="seo-documents-manager-open-graph-billede-url" fallback="Open Graph billede URL" />
            <span className="float-right text-neutral-500"><EditableContent contentKey="seo-documents-manager-vises-paa-sociale-medier" fallback="vises på sociale medier" /></span>
          </label>
          <input
            type="url"
            value={form.og_image || ''}
            onChange={e => set('og_image', e.target.value)}
            placeholder="https://flai.dk/og-image.jpg  (tom = standard logo)"
            className="w-full bg-neutral-800 border border-neutral-600 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-primary/60 transition-colors"
          />
        </div>
      </div>

      {/* ── Content ── */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-neutral-300 flex items-center gap-2">
          <BookOpen size={15} className="text-primary" />
          <EditableContent contentKey="seo-documents-manager-indhold" fallback="Indhold" />
          <span className="text-xs font-normal text-neutral-500 ml-1"><EditableContent contentKey="seo-documents-manager-google-indekserer-al-tekst-herunder" fallback="— Google indekserer al tekst herunder" /></span>
        </h3>
        <RichEditor
          value={form.content || ''}
          onChange={v => setForm(prev => ({ ...prev, content: v }))}
        />
      </div>

      {/* ── SEO Preview ── */}
      {(form.title || form.description) && (
        <div className="bg-neutral-900 border border-neutral-700 rounded-xl p-4 space-y-3">
          <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wider"><EditableContent contentKey="seo-documents-manager-google-forhaandsvisning" fallback="Google forhåndsvisning" /></p>
          <div className="space-y-0.5">
            <p className="text-green-400 text-xs font-mono truncate">{previewUrl}</p>
            <p className="text-blue-400 text-base hover:underline cursor-default truncate">
              {form.title ? `${form.title} | Flai` : '…'}
            </p>
            <p className="text-neutral-400 text-sm leading-snug line-clamp-2">
              {form.description || <span className="text-neutral-600 italic"><EditableContent contentKey="seo-documents-manager-ingen-beskrivelse" fallback="Ingen beskrivelse" /></span>}
            </p>
          </div>
        </div>
      )}

      {/* ── Danger zone ── */}
      {!isNew && (
        <div className="border border-red-800/50 rounded-xl p-4">
          <p className="text-xs font-semibold text-red-400 mb-3"><EditableContent contentKey="seo-documents-manager-farezone" fallback="Farezone" /></p>
          <button
            onClick={() => onDelete(form as SeoDocument)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-900/30 hover:bg-red-900/50 text-red-400 text-sm font-medium transition-colors"
          >
            <Trash2 size={14} />
            <EditableContent contentKey="seo-documents-manager-slet-dokument" fallback="Slet dokument" /> {form.deployed_at ? '+ fjern fra GitHub' : ''}
          </button>
        </div>
      )}
    </div>
  );
};

// ─── Document list ────────────────────────────────────────────────────────────

interface DocListProps {
  docs: SeoDocument[];
  onSelect: (doc: SeoDocument) => void;
  onCreate: () => void;
  loading: boolean;
}

const DocList: React.FC<DocListProps> = ({ docs, onSelect, onCreate, loading }) => {
  const [q, setQ] = useState('');
  const filtered = docs.filter(
    d =>
      d.title.toLowerCase().includes(q.toLowerCase()) ||
      d.slug.includes(q.toLowerCase()),
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Globe size={20} className="text-primary" />
            <EditableContent contentKey="seo-documents-manager-seo-dokumenter" fallback="SEO Dokumenter" />
          </h2>
          <p className="text-sm text-neutral-400 mt-0.5">
            <EditableContent contentKey="seo-documents-manager-skriv-forretningsdokumenter-der-indekseres-af" fallback="Skriv forretningsdokumenter der indekseres af Google og andre søgemaskiner" />
          </p>
        </div>
        <button
          onClick={onCreate}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary hover:bg-primary/90 text-white text-sm font-semibold transition-all active:scale-[0.97]"
        >
          <Plus size={16} />
          <EditableContent contentKey="seo-documents-manager-nyt-dokument" fallback="Nyt dokument" />
        </button>
      </div>

      {/* How it works banner */}
      <div className="bg-blue-900/20 border border-blue-700/30 rounded-lg px-4 py-3 flex gap-3">
        <Globe size={16} className="text-blue-400 shrink-0 mt-0.5" />
        <div className="text-xs text-blue-300 space-y-0.5">
          <p className="font-medium text-blue-200"><EditableContent contentKey="seo-documents-manager-hvordan-fungerer-det" fallback="Hvordan fungerer det?" /></p>
          <p>
            <EditableContent contentKey="seo-documents-manager-hvert-dokument-gemmes-som-en" fallback="Hvert dokument gemmes som en" /> <strong><EditableContent contentKey="seo-documents-manager-statisk-html-fil" fallback="statisk HTML-fil" /></strong> <EditableContent contentKey="seo-documents-manager-paa-github" fallback="på GitHub →" />{' '}
            <code className="bg-neutral-900 px-1 rounded"><EditableContent contentKey="seo-documents-manager-public-docs-slug-html" fallback="public/docs/[slug].html" /></code> <EditableContent contentKey="seo-documents-manager-netlify-serverer-den-direkte-google" fallback="→ Netlify serverer den direkte.             Google og andre søgemaskiner læser og indekserer siden uden JavaScript.             Sitemap opdateres automatisk ved deploy." />
          </p>
        </div>
      </div>

      {/* Search */}
      {docs.length > 0 && (
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
          <input
            type="text"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Søg i dokumenter…"
            className="w-full bg-neutral-800 border border-neutral-600 rounded-lg pl-8 pr-3 py-2 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-primary/60 transition-colors"
          />
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-10">
          <RefreshCw size={20} className="animate-spin text-neutral-500" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <FileText size={32} className="text-neutral-600 mx-auto" />
          <p className="text-neutral-400 text-sm">
            {q ? 'Ingen dokumenter matcher søgningen.' : 'Ingen dokumenter endnu.'}
          </p>
          {!q && (
            <button
              onClick={onCreate}
              className="mt-2 text-sm text-primary hover:underline"
            >
              <EditableContent contentKey="seo-documents-manager-opret-dit-foerste-seo-dokument" fallback="Opret dit første SEO-dokument →" />
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(doc => (
            <button
              key={doc.id}
              onClick={() => onSelect(doc)}
              className="w-full text-left bg-neutral-700/30 hover:bg-neutral-700/60 border border-neutral-600 hover:border-neutral-500 rounded-xl px-4 py-3.5 transition-all group"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-white text-sm truncate group-hover:text-primary transition-colors">
                      {doc.title}
                    </span>
                    <span
                      className={`shrink-0 text-xs px-1.5 py-0.5 rounded font-medium ${
                        doc.status === 'published'
                          ? doc.deployed_at
                            ? 'bg-green-900/50 text-green-300'
                            : 'bg-yellow-900/50 text-yellow-300'
                          : 'bg-neutral-700 text-neutral-400'
                      }`}
                    >
                      {doc.status === 'published'
                        ? doc.deployed_at
                          ? '✓ Live'
                          : '⚡ Klar til deploy'
                        : 'Kladde'}
                    </span>
                  </div>
                  <p className="text-xs font-mono text-neutral-500 mt-0.5 truncate">
                    <EditableContent contentKey="seo-documents-manager-flai-dk-docs" fallback="flai.dk/docs/" />{doc.slug}
                  </p>
                  {doc.description && (
                    <p className="text-xs text-neutral-400 mt-1 line-clamp-1">{doc.description}</p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  {doc.deployed_at ? (
                    <a
                      href={`https://flai.dk/docs/${doc.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      className="inline-flex items-center gap-1 text-xs text-blue-400 hover:underline"
                    >
                      <ExternalLink size={11} /> <EditableContent contentKey="seo-documents-manager-live" fallback="Live" />
                    </a>
                  ) : (
                    <span className="text-xs text-neutral-600">
                      {new Date(doc.updated_at).toLocaleDateString('da-DK')}
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {docs.length > 0 && (
        <p className="text-xs text-neutral-600 text-center">
          {docs.filter(d => d.deployed_at).length}/{docs.length} <EditableContent contentKey="seo-documents-manager-dokumenter-live-paa-google" fallback="dokumenter live på Google" />
        </p>
      )}
    </div>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────

const SeoDocumentsManager: React.FC = () => {
  const [docs, setDocs] = useState<SeoDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Partial<SeoDocument> | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');

  const loadDocs = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('seo_documents')
      .select('*')
      .order('updated_at', { ascending: false });
    if (!error && data) setDocs(data as SeoDocument[]);
    setLoading(false);
  }, []);

  useEffect(() => { loadDocs(); }, [loadDocs]);

  // ── Deploy helper (called internally after save) ──────────────────────────
  const deployDoc = async (id: string): Promise<{ slug: string; sitemapUpdated: boolean; oldSlugRemoved: string | null }> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Ikke logget ind');
    const base = await getSupabaseUrl();
    const res = await fetch(`${base}/functions/v1/deploy-seo-document`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ id }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return { slug: data.slug, sitemapUpdated: data.sitemapUpdated, oldSlugRemoved: data.oldSlugRemoved ?? null };
  };

  // ── Save — auto-deploys to GitHub when status === 'published' ─────────────
  const handleSave = async (form: Partial<SeoDocument>) => {
    if (!form.title?.trim()) { toast.error('Titel er påkrævet'); return; }
    if (!form.slug?.trim())  { toast.error('Slug er påkrævet'); return; }

    const isPublishing = form.status === 'published';
    setSaveStatus(isPublishing ? 'publishing' : 'saving-draft');

    try {
      let savedId = form.id;

      if (form.id) {
        // Update existing
        const { error } = await supabase
          .from('seo_documents')
          .update({
            title: form.title,
            slug: form.slug,
            description: form.description || '',
            keywords: form.keywords || '',
            content: form.content || '',
            og_image: form.og_image || null,
            canonical: form.canonical || null,
            robots: form.robots || 'index, follow',
            status: form.status || 'draft',
          })
          .eq('id', form.id);
        if (error) throw error;
      } else {
        // Insert new
        const { data, error } = await supabase
          .from('seo_documents')
          .insert({
            title: form.title,
            slug: form.slug,
            description: form.description || '',
            keywords: form.keywords || '',
            content: form.content || '',
            og_image: form.og_image || null,
            canonical: form.canonical || null,
            robots: form.robots || 'index, follow',
            status: form.status || 'draft',
          })
          .select()
          .single();
        if (error) throw error;
        savedId = data.id;
      }

      // Auto-deploy to GitHub if publishing
      if (isPublishing && savedId) {
        try {
          const { slug, sitemapUpdated, oldSlugRemoved } = await deployDoc(savedId);
          const parts = [`✓ Live på flai.dk/docs/${slug}`];
          if (sitemapUpdated) parts.push('Sitemap opdateret');
          if (oldSlugRemoved) parts.push(`Gammel URL /docs/${oldSlugRemoved} fjernet`);
          toast.success(parts.join(' · '), { duration: 6000 });
        } catch (deployErr: any) {
          // Deploy failed — document is saved but not live
          toast.error(`Gemt, men deploy fejlede: ${deployErr.message}`, { duration: 8000 });
        }
      } else {
        toast.success('Gemt som kladde');
      }

      await loadDocs();
      // Refresh selected with latest DB state (includes deployed_at from edge fn)
      if (savedId) {
        const { data: fresh } = await supabase.from('seo_documents').select('*').eq('id', savedId).single();
        if (fresh) setSelected(fresh);
      }
      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (err: any) {
      setSaveStatus('error');
      toast.error(`Fejl: ${err.message}`);
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  };

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDelete = async (doc: SeoDocument) => {
    const hasLive = !!doc.deployed_at;
    const msg = hasLive
      ? `Slet "${doc.title}"?\n\nDette vil:\n  • Slette HTML-filen fra GitHub\n  • Fjerne siden fra sitemap\n  • Slette dokumentet fra databasen`
      : `Slet "${doc.title}" fra databasen?`;
    if (!window.confirm(msg)) return;

    setSaveStatus('saving-draft');
    try {
      if (hasLive) {
        // Edge function removes GitHub file + sitemap entry + deletes DB row
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error('Ikke logget ind');
        const base = await getSupabaseUrl();
        const res = await fetch(`${base}/functions/v1/deploy-seo-document`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ id: doc.id, delete: true }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        toast.success(`Slettet fra GitHub${data.sitemapUpdated ? ' · Sitemap opdateret ✓' : ''}`);
      } else {
        // Not deployed — just delete from DB
        const { error } = await supabase.from('seo_documents').delete().eq('id', doc.id);
        if (error) throw error;
        toast.success('Dokument slettet');
      }
      setSelected(null);
      setSaveStatus('idle');
      await loadDocs();
    } catch (err: any) {
      toast.error(`Sletning fejlede: ${err.message}`);
      setSaveStatus('idle');
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  if (selected !== null) {
    return (
      <DocForm
        doc={selected}
        onSave={handleSave}
        onDelete={handleDelete}
        onBack={() => { setSelected(null); loadDocs(); }}
        saveStatus={saveStatus}
      />
    );
  }

  return (
    <DocList
      docs={docs}
      onSelect={setSelected}
      onCreate={() => setSelected({
        title: '',
        slug: '',
        description: '',
        keywords: '',
        content: '',
        robots: 'index, follow',
        status: 'draft',
      })}
      loading={loading}
    />
  );
};

export default SeoDocumentsManager;
