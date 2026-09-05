import EditableContent from './EditableContent';
import React, { useState, useRef, useEffect, useCallback, Component } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../contexts/DataContext';
import { isAddressWithinRange, getFormattedDistance } from '../utils/location';
import { CONTENT_KEYS } from 'virtual:content-keys';
import ProductCard from './ProductCard';
import PanoramaViewer from './PanoramaViewer'; // ✅ FIX: Added missing import
import {
  Sparkles, Send, MapPin, Loader2, X, CheckCircle, XCircle, ArrowRight,
} from 'lucide-react';
import { supabase } from '../utils/supabase';
import { Product } from '../types';
import { DEPLOYED_HOME_SECTIONS } from '../pages/HomePage';

// ─── API config ───────────────────────────────────────────────────────────────
const AI_PROXY_URL = '/api/ai-proxy';

// ─── Types ────────────────────────────────────────────────────────────────────
interface HistoryEntry { role: 'user' | 'assistant'; content: string; }

type Intent = 'products' | 'portfolio' | 'coverage' | 'general' | 'reasoning';

interface AIDecision {
  intent: Intent;
  address?: string | null;
  text: string;
  productIds?: string[] | 'all' | null;
  showProductsAfter?: boolean;
  portfolioRows?: number | null;
  portfolioIds?: string[] | null;
}

type MsgType = 'user' | 'ai' | 'products' | 'portfolio' | 'coverage-form' | 'coverage-result';

interface Message {
  id: string;
  type: MsgType;
  text?: string;
  products?: Product[];
  images?: any[];
  portfolioRows?: number | null;
  portfolioIds?: string[] | null;
  coverageResult?: { covered: boolean; distance?: string; address: string };
  isPersonalised?: boolean;
}

// ─── Error Boundary ✅ FIX: Prevents black screen on render errors ─────────────
class ErrorBoundary extends Component<
  { children: React.ReactNode },
  { error: string | null }
> {
  state = { error: null };

  static getDerivedStateFromError(e: Error) {
    return { error: e.message };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[AiCTA ErrorBoundary]', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            padding: '16px',
            borderRadius: '12px',
            background: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.3)',
            color: '#fca5a5',
            fontSize: '.8rem',
            textAlign: 'center',
          }}
        >
          <p style={{ margin: '0 0 4px', fontWeight: 600 }}><EditableContent contentKey="ai-cta-noget-gik-galt" fallback="Noget gik galt" /></p>
          <p style={{ margin: 0, opacity: 0.75 }}>
            <EditableContent contentKey="ai-cta-proev-igen-eller-kontakt-os" fallback="Prøv igen eller kontakt os på" />{' '}
            <a href="mailto:fb@flai.dk" style={{ color: '#fca5a5' }}><EditableContent contentKey="ai-cta-fb-flai-dk" fallback="fb@flai.dk" /></a>
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Module-level cache ───────────────────────────────────────────────────────
let _cachedProducts: Product[] | null = null;
let _cachedPortfolio: any[] | null = null;

async function fetchProductsCached(): Promise<Product[]> {
  if (_cachedProducts) return _cachedProducts;
  try {
    const { data, error } = await supabase.from('products').select('*');
    if (error || !data) return [];
    _cachedProducts = data as Product[];
    return _cachedProducts;
  } catch { return []; }
}

async function fetchPortfolioCached(): Promise<any[]> {
  if (_cachedPortfolio) return _cachedPortfolio;
  try {
    const { data, error } = await supabase
      .from('portfolio_images')
      .select('*')
      .order('created_at', { ascending: false });
    if (error || !data) return [];
    _cachedPortfolio = data;
    return _cachedPortfolio;
  } catch { return []; }
}

// ─── API caller ───────────────────────────────────────────────────────────────
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

async function callAI(systemPrompt: string, history: HistoryEntry[]): Promise<string> {
  const res = await withTimeout(fetch(AI_PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ systemPrompt, history }),
  }), 20_000);

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Proxy ${res.status}`);
  }

  const data = await res.json();
  if (!data.text) throw new Error('Empty response from proxy');
  return data.text;
}

// ─── JSON extraction ──────────────────────────────────────────────────────────
function extractJSON(raw: string): string | null {
  const stripped = raw.replace(/```[\w]*\n?/g, '').trim();
  const start = stripped.indexOf('{');
  const end   = stripped.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  return stripped.slice(start, end + 1);
}

// ─── Fallback ─────────────────────────────────────────────────────────────────
function keywordFallback(userMessage?: string): AIDecision {
  const msg = (userMessage ?? '').toLowerCase();

  if (/pris|kost|kr|pakke|produkt/.test(msg)) {
    return { intent: 'products', address: null, text: 'Her er vores produkter og priser:', productIds: 'all', showProductsAfter: true };
  }
  if (/portfolio|eksempel|foto|billede|video|se.*arbejde/.test(msg)) {
    return { intent: 'portfolio', address: null, text: 'Her er eksempler fra vores portfolio:', portfolioRows: 4, portfolioIds: null };
  }
  if (/dækk|område|adresse|by|postnr/.test(msg)) {
    return { intent: 'coverage', address: null, text: 'Indtast din adresse nedenfor, så tjekker vi om vi dækker dit område.' };
  }
  if (/kontakt|mail|telefon|ring|skrive/.test(msg)) {
    return {
      intent: 'general', address: null,
      text: 'Du er velkommen til at kontakte os direkte:<br/><strong>Email:</strong> fb@flai.dk<br/><strong>Tlf:</strong> +45 27 29 21 99',
    };
  }

  return {
    intent: 'general',
    address: null,
    text: 'Beklager, jeg havde lidt svært ved at besvare det. Du er altid velkommen til at kontakte os direkte på <strong>fb@flai.dk</strong> eller ringe på <strong>+45 27 29 21 99</strong> — vi hjælper gerne!',
  };
}

// ─── Content helpers ──────────────────────────────────────────────────────────
const SKIP_PREFIXES   = ['admin-', 'deploy-', 'auth-', 'video-manager', 'address-zones-manager'];
const UI_NOISE_EXACT  = new Set(['submit', 'cancel', 'close', 'open', 'back', 'next', 'send', 'loading']);
const UI_NOISE_SUFFIX = ['-btn', '-button', '-label', '-placeholder', '-cta', '-link', '-nav', '-tag', '-badge'];

function isUINoiseKey(key: string) {
  return UI_NOISE_EXACT.has(key) || UI_NOISE_SUFFIX.some((s) => key.endsWith(s));
}

function mergeHomeSections(dbSections: any[], isDbLoaded: boolean): any[] {
  if (!isDbLoaded) return DEPLOYED_HOME_SECTIONS;
  const dbIds = new Set(dbSections.map((s: any) => s.id));
  return [...dbSections, ...DEPLOYED_HOME_SECTIONS.filter((s) => !dbIds.has(s.id))]
    .sort((a, b) => a.order_index - b.order_index);
}

const VALID_INTENTS = new Set<Intent>(['products', 'portfolio', 'coverage', 'general', 'reasoning']);

// ─── System prompt ────────────────────────────────────────────────────────────
function buildSystemPrompt(
  products: Product[],
  addressZones: any[],
  siteContent: Record<string, { key: string; value: string; type: string }>,
  homeSections: any[],
  portfolioItems: any[],
): string {
  const merged = new Map<string, string>();
  Object.values(siteContent ?? {}).forEach(({ key, value, type }) => {
    if (SKIP_PREFIXES.some((p) => key.startsWith(p))) return;
    if (type === 'image' || type === 'color') return;
    if (isUINoiseKey(key)) return;
    if (value?.trim().length > 3) merged.set(key, value.trim());
  });
  CONTENT_KEYS.forEach(({ key, fallback }: { key: string; fallback: string }) => {
    if (merged.has(key)) return;
    if (SKIP_PREFIXES.some((p) => key.startsWith(p))) return;
    if (isUINoiseKey(key)) return;
    if (fallback.startsWith('/')) return;
    if (fallback?.trim().length > 3) merged.set(key, fallback.trim());
  });

  const grouped = new Map<string, Array<[string, string]>>();
  Array.from(merged.entries())
    .filter(([k]) => !k.includes('meta') && !k.includes('seo'))
    .forEach(([k, v]) => {
      const prefix = k.split('-')[0] ?? 'other';
      if (!grouped.has(prefix)) grouped.set(prefix, []);
      grouped.get(prefix)!.push([k, v]);
    });

  const contentLines: string[] = [];
  grouped.forEach((entries, prefix) => {
    contentLines.push(`[${prefix.toUpperCase()}]`);
    entries.forEach(([k, v]) => contentLines.push(`  ${k}: ${v}`));
  });

  const zones = (addressZones ?? [])
    .filter((z: any) => z.is_active)
    .map((z: any) => `  ${z.name}: center="${z.center_address}" radius=${z.radius_km}km`)
    .join('\n') || '  (ingen konfigureret)';

  const productList = (products ?? []).length
    ? products
        .sort((a, b) => (b as any).array - (a as any).array || 0)
        .map((p) => `  [${p.id}] ${p.name} | pris: ${(p as any).price ?? 'se hjemmeside'} | ${p.description ?? ''}`)
        .join('\n')
    : '  (ingen produkter)';

  const portfolioList = (portfolioItems ?? []).length
    ? portfolioItems
        .sort((a, b) => (b.array ?? 50) - (a.array ?? 50))
        .map((img) => {
          const type = img.image_url?.startsWith('youtube:') ? 'video' : img.image_url?.startsWith('panorama:') ? 'panorama360' : 'billede';
          return `  [${img.id}] "${img.title ?? ''}" type=${type} tags="${(img.tags ?? []).join(', ')}"`;
        })
        .join('\n')
    : '  (ingen)';

  const activeSections = homeSections
    .filter((s) => s.is_active)
    .map((s) => `  ${s.title ?? s.id}`)
    .join('\n') || '  (ingen)';

  return `Du er Max — assistent for Flai, et dansk dronefirma (luftfoto/video i Trekantsområdet).
Ejeren hedder Felix, han er 13 år gamle. Kontakt: fb@flai.dk | +45 27 29 21 99.

OUTPUT: KUN gyldigt JSON. Ingen tekst uden for JSON. Ingen markdown-fences.

SCHEMA:
{
  "intent": "products"|"portfolio"|"coverage"|"general"|"reasoning",
  "address": "<by eller adresse nævnt af brugeren, eller null>",
  "text": "<dit danske svar — grundigt og konkret>",
  "productIds": ["id"]|"all"|null,
  "showProductsAfter": true|false,
  "portfolioRows": <tal eller null>,
  "portfolioIds": ["id"]|null
}

INTENT-REGLER:
• "coverage"  → spørger om Flai dækker en by/adresse. Sæt by i "address". Skriv kort svar i "text".
• "products"  → vil se produkter/pakker/priser. Sæt productIds.
• "portfolio" → vil se eksempler/fotos/videoer. Sæt portfolioRows og evt. portfolioIds.
• "reasoning" → vil have anbefaling, sammenligning, hvad passer bedst. Brug showProductsAfter hvis relevant. Sikre at du altid checker at du har checket alt data for at give brugeren det mest korrekte svar.
• "general"   → alt andet: firma, Felix, udstyr, leveringstid, proces, spørgsmål.

PRODUKT-REGLER:
• productIds="all" → vis alle produkter.
• productIds=["id1","id2"] → vis kun disse. Brug KUN IDs fra listen nedenfor.
• showProductsAfter=true → vis produkter efter tekst-svar (brug ved "reasoning").

PORTFOLIO-REGLER:
• portfolioIds=null → standard rækkefølge.
• portfolioIds=["id1"] → filtrer til specifikke items (brug ved specifikke forespørgsler).
• portfolioRows: antal rækker à 2 items. Null = standard (5 desktop / 4 mobil).
• Brug KUN IDs fra PORTFOLIO-listen nedenfor.

SVAR-REGLER:
• Svar ALTID på dansk.
• Brug konkrete detaljer fra FLAIS DATA — ikke generiske svar.
• Skriv substansfulde svar. Undgå 1-linje svar på komplekse spørgsmål.
• Hvis du ikke kender svaret: henvis til fb@flai.dk / +45 27 29 21 99.
• Til "coverage": skriv ALDRIG om adressen er dækket — systemet tjekker det. Sig bare "Lad mig tjekke…".
• Opfind ALDRIG priser, kontaktinfo eller IDs.

EKSEMPLER:
Bruger: "Dækker I Aarhus?"
{"intent":"coverage","address":"Aarhus","text":"Lad mig tjekke det for dig!","productIds":null,"showProductsAfter":false,"portfolioRows":null,"portfolioIds":null}

Bruger: "Hvad koster luftfoto?"
{"intent":"reasoning","address":null,"text":"Prisen afhænger af opgaven. Her er vores pakker:","productIds":"all","showProductsAfter":true,"portfolioRows":null,"portfolioIds":null}

Bruger: "Vis drone-videoer"
{"intent":"portfolio","address":null,"text":"Her er vores drone-videoer:","productIds":null,"showProductsAfter":false,"portfolioRows":null,"portfolioIds":["<video-id-1>","<video-id-2>"]}

─── FLAIS DATA ───────────────────────────────────────────────

PRODUKTER:
${productList}

PORTFOLIO:
${portfolioList}

DÆKNINGSZONER:
${zones}

AKTIVE SEKTIONER:
${activeSections}

HJEMMESIDEINDHOLD:
${contentLines.join('\n')}`;
}

// ─── Core AI call ─────────────────────────────────────────────────────────────
const MAX_HISTORY = 10;

async function detectIntent(
  userMessage: string,
  products: Product[],
  addressZones: any[],
  siteContent: Record<string, { key: string; value: string; type: string }>,
  homeSections: any[],
  history: HistoryEntry[],
  portfolioItems: any[],
  getContent: (key: string, fallback: string) => string,
): Promise<AIDecision> {
  const systemPrompt = buildSystemPrompt(products, addressZones, siteContent, homeSections, portfolioItems);
  const trimmedHistory = history.slice(-MAX_HISTORY);
  const callHistory: HistoryEntry[] = [...trimmedHistory, { role: 'user', content: userMessage }];

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const finalHistory = attempt === 0
        ? callHistory
        : [
            ...callHistory.slice(0, -1),
            {
              role: 'user' as const,
              content: `${userMessage}\n\n[VIGTIGT: Svar KUN med et gyldigt JSON-objekt. Ingen markdown. Ingen tekst uden for {}.] `,
            },
          ];

      const raw = await callAI(systemPrompt, finalHistory);
      const jsonStr = extractJSON(raw);
      if (!jsonStr) throw new Error('No JSON found in response');

      const parsed = JSON.parse(jsonStr);

      if (!VALID_INTENTS.has(parsed.intent)) throw new Error(`Invalid intent: ${parsed.intent}`);
      if (typeof parsed.text !== 'string' || parsed.text.trim().length < 2) throw new Error('Missing text');

      const productIds = parsed.productIds ?? null;
      if (productIds !== null && productIds !== 'all' && !Array.isArray(productIds)) {
        parsed.productIds = null;
      }

      return {
        intent: parsed.intent as Intent,
        address: typeof parsed.address === 'string' && parsed.address.trim() ? parsed.address.trim() : null,
        text: parsed.text.trim(),
        productIds: parsed.productIds ?? null,
        showProductsAfter: parsed.showProductsAfter === true,
        portfolioRows: typeof parsed.portfolioRows === 'number' ? Math.max(1, Math.round(parsed.portfolioRows)) : null,
        portfolioIds: Array.isArray(parsed.portfolioIds) && parsed.portfolioIds.length > 0 ? parsed.portfolioIds : null,
      };
    } catch {
      if (attempt === 1) return keywordFallback(userMessage);
    }
  }

  return keywordFallback(userMessage);
}

// ─── Formatting ───────────────────────────────────────────────────────────────
function formatAI(raw: string): string {
  if (!raw) return ''; // ✅ FIX: Guard against undefined/null
  return raw
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.*?)__/g, '<strong>$1</strong>')
    .replace(/^[*\-] (.+)$/gm, '<li>$1</li>')
    .replace(/((<li>[^<]*<\/li>\n?)+)/g, (m) => `<ul>${m}</ul>`)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener" style="color:var(--secondary)">$1</a>')
    .replace(/\n/g, '<br/>');
}

// ─── Sub-components ───────────────────────────────────────────────────────────
const ITEMS_PER_ROW        = 2;
const DEFAULT_ROWS_DESKTOP = 5;
const DEFAULT_ROWS_MOBILE  = 4;

const PortfolioGrid: React.FC<{
  images: any[];
  portfolioRows?: number | null;
  portfolioIds?: string[] | null;
}> = ({ images, portfolioRows, portfolioIds }) => {
  const navigate = useNavigate();

  let filtered = portfolioIds && portfolioIds.length > 0
    ? portfolioIds.map((id) => images.find((img) => String(img.id) === String(id))).filter(Boolean)
    : [...images].sort((a, b) => (b.array ?? 50) - (a.array ?? 50));

  const desktopItems = portfolioRows != null ? portfolioRows * ITEMS_PER_ROW : DEFAULT_ROWS_DESKTOP * ITEMS_PER_ROW;
  const mobileItems  = portfolioRows != null ? portfolioRows * ITEMS_PER_ROW : DEFAULT_ROWS_MOBILE  * ITEMS_PER_ROW;

  return (
    <div className="w-full">
      <style>{`
        @media (min-width: 640px) {
          .aicta-portfolio-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .aicta-portfolio-item--mobile-hidden { display: block !important; }
        }
        @media (max-width: 639px) { .aicta-portfolio-item--mobile-hidden { display: none; } }
      `}</style>
      <div className="aicta-portfolio-grid" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>
        {filtered.map((img, idx) => {
          if (!img || idx >= desktopItems) return null; // ✅ FIX: Guard null img
          const hiddenOnMobile = idx >= mobileItems;
          const isYt   = img.image_url?.startsWith('youtube:');
          const isPano = img.image_url?.startsWith('panorama:');
          const ytId   = isYt ? img.image_url.split(':')[1] : null;

          return (
            <div
              key={img.id}
              className={hiddenOnMobile ? 'aicta-portfolio-item--mobile-hidden' : ''}
              style={{ borderRadius: 10, overflow: 'hidden', background: 'var(--neutral-800,#262626)', border: '1px solid rgba(255,255,255,0.07)' }}
            >
              {/* Media */}
              <div style={{ position: 'relative', width: '100%', aspectRatio: '16/9', background: 'var(--neutral-700,#404040)' }}>
                {isYt ? (
                  <div style={{ position: 'relative', width: '100%', paddingTop: '56.25%' }}>
                    <iframe
                      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }}
                      src={`https://www.youtube.com/embed/${ytId}`}
                      title={img.title}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  </div>
                ) : isPano ? (
                  <div style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
                    <PanoramaViewer
                      url={img.image_url.replace('panorama:', '')}
                      title={img.title}
                      autoRotate={0.5}
                      className="w-full h-full"
                    />
                    <div style={{ position: 'absolute', top: 6, left: 6, zIndex: 20, display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)', borderRadius: 999, padding: '2px 8px', pointerEvents: 'none' }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--primary,#0F52BA)" strokeWidth="2"><circle cx="12" cy="12" r="10"/><ellipse cx="12" cy="12" rx="5" ry="10"/><path d="M2 12h20"/></svg>
                      <span style={{ color: '#fff', fontSize: '.6rem', fontWeight: 700, letterSpacing: '.08em' }}>360°</span>
                    </div>
                  </div>
                ) : (
                  <img
                    src={img.image_url}
                    alt={img.title ?? ''}
                    onClick={() => navigate('/portfolio')}
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', cursor: 'pointer' }}
                  />
                )}
              </div>
              {/* Title + description below media */}
              {(img.title || img.description) && (
                <div style={{ padding: '8px 10px 10px' }}>
                  {img.title && (
                    <p style={{ margin: 0, fontSize: '.78rem', color: '#fff', fontWeight: 600, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                      {img.title}
                    </p>
                  )}
                  {img.description && (
                    <p style={{ margin: '2px 0 0', fontSize: '.7rem', color: 'var(--neutral-400,#a3a3a3)', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                      {img.description}
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <button
        className="btn-primary w-full mt-3 flex items-center justify-center gap-2"
        style={{ fontSize: '.875rem', padding: '10px' }}
        onClick={() => navigate('/portfolio')}
      >
        <EditableContent contentKey="ai-cta-se-hele-portfolio" fallback="Se hele portfolio" /> <ArrowRight size={15} />
      </button>
    </div>
  );
};

const CoverageForm: React.FC<{ onCheck: (a: string) => void; loading: boolean }> = ({ onCheck, loading }) => {
  const [addr, setAddr] = useState('');
  return (
    <div className="card p-4 w-full">
      <p className="form-label flex items-center gap-2 mb-2" style={{ fontSize: '.8rem' }}>
        <MapPin size={13} /> <EditableContent contentKey="ai-cta-check-din-adresse" fallback="Check din adresse" />
      </p>
      <div className="flex gap-2">
        <input
          className="form-input"
          placeholder="F.eks. Vejle, Kolding…"
          value={addr}
          onChange={(e) => setAddr(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addr.trim() && onCheck(addr)}
          disabled={loading}
        />
        <button
          className="btn-primary flex items-center gap-1 whitespace-nowrap"
          style={{ padding: '8px 16px', fontSize: '.875rem' }}
          onClick={() => addr.trim() && onCheck(addr)}
          disabled={loading || !addr.trim()}
        >
          {loading ? <Loader2 size={15} className="animate-spin" /> : 'Tjek'}
        </button>
      </div>
    </div>
  );
};

const CoverageResult: React.FC<{ result: { covered: boolean; distance?: string; address: string } }> = ({ result }) => (
  <div
    className="flex items-start gap-3 p-3 rounded-xl w-full"
    style={{
      background: result.covered ? 'rgba(16,185,129,.1)' : 'rgba(239,68,68,.1)',
      border: `1px solid ${result.covered ? 'rgba(16,185,129,.3)' : 'rgba(239,68,68,.3)'}`,
      textAlign: 'left',
    }}
  >
    {result.covered
      ? <CheckCircle size={20} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--success,#10b981)' }} />
      : <XCircle    size={20} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--error,#ef4444)' }} />}
    <div>
      <p className="font-semibold text-white" style={{ fontSize: '.875rem', margin: '0 0 2px' }}>
        {result.covered ? 'Vi dækker din adresse! 🎉' : 'Vi dækker desværre ikke denne adresse'}
      </p>
      <p style={{ fontSize: '.74rem', color: 'var(--neutral-400,#a3a3a3)', margin: 0 }}>
        {result.address}
        {!result.covered && result.distance ? ` — ${result.distance} fra vores base` : ''}
      </p>
    </div>
  </div>
);

// ─── Main component ───────────────────────────────────────────────────────────
const AiCTAInner: React.FC = () => {
  const navigate = useNavigate();
  const {
    getContent, siteContent, addressZones, isAddressZonesLoaded, refreshAddressZones,
    homeSections: dbHomeSections, isHomeSectionsLoaded, refreshHomeSections,
  } = useData();

  const [messages, setMessages]               = useState<Message[]>([]);
  const [input, setInput]                     = useState('');
  const [loading, setLoading]                 = useState(false);
  const [coverageLoading, setCoverageLoading] = useState(false);
  const [expanded, setExpanded]               = useState(false);

  const historyRef   = useRef<HistoryEntry[]>([]);
  const inputRef     = useRef<HTMLInputElement>(null);
  const msgsContRef  = useRef<HTMLDivElement>(null);
  const shouldScroll = useRef(false);

  useEffect(() => {
    fetchProductsCached();
    fetchPortfolioCached();
    if (!isAddressZonesLoaded) refreshAddressZones();
    if (!isHomeSectionsLoaded) refreshHomeSections();
  }, []); // eslint-disable-line

  useEffect(() => {
    if (shouldScroll.current) {
      const el = msgsContRef.current;
      if (el) el.scrollTop = el.scrollHeight;
      shouldScroll.current = false;
    }
  }, [messages, loading]);

  const homeSections = mergeHomeSections(dbHomeSections, isHomeSectionsLoaded);

  const addMsg = useCallback((msg: Omit<Message, 'id'>, scroll = true) => {
    shouldScroll.current = scroll;
    setMessages((prev) => [...prev, { ...msg, id: crypto.randomUUID() }]);
  }, []);

  const handleCoverageCheck = useCallback(async (address: string) => {
    setCoverageLoading(true);
    try {
      const covered  = await isAddressWithinRange(address);
      const distance = covered ? undefined : await getFormattedDistance(address);
      addMsg({ type: 'coverage-result', coverageResult: { covered, distance, address } });
      addMsg({
        type: 'ai',
        text: covered
          ? 'Super! Vi dækker din adresse. Skriv gerne for at høre mere eller book direkte.'
          : `Vi dækker desværre ikke ${address} endnu. Skriv til fb@flai.dk – vi finder en løsning!`,
      });
    } catch {
      addMsg({ type: 'ai', text: 'Kunne ikke tjekke adressen. Kontakt os direkte på fb@flai.dk.' });
    } finally {
      setCoverageLoading(false);
    }
  }, [addMsg]);

  const handleSend = async () => {
    const q = input.trim();
    if (!q || loading) return;

    setInput('');
    setExpanded(true);
    addMsg({ type: 'user', text: q });
    setLoading(true);

    try {
      const [allProducts, allPortfolio] = await Promise.all([
        fetchProductsCached(),
        fetchPortfolioCached(),
      ]);

      const sorted = [...allProducts].sort((a, b) => ((b as any).array ?? 50) - ((a as any).array ?? 50));

      const decision = await detectIntent(
        q, sorted, addressZones ?? [], siteContent ?? {}, homeSections,
        historyRef.current, allPortfolio, getContent,
      );

      historyRef.current = [
        ...historyRef.current.slice(-MAX_HISTORY),
        { role: 'user', content: q },
        { role: 'assistant', content: decision.text },
      ];

      const { intent, address, text, productIds, showProductsAfter, portfolioRows, portfolioIds } = decision;

      if (intent === 'products') {
        let toShow: Product[];
        if (!productIds || productIds === 'all') {
          toShow = sorted;
        } else {
          const validIds = new Set(sorted.map((p) => String(p.id)));
          const ids = (productIds as string[]).filter((id) => validIds.has(id));
          toShow = ids.length > 0 ? sorted.filter((p) => ids.includes(String(p.id))) : sorted;
        }
        const isPersonalised = Array.isArray(productIds) && toShow.length < sorted.length;
        addMsg({ type: 'ai', text });
        if (toShow.length > 0) addMsg({ type: 'products', products: toShow, isPersonalised }, false);
        else addMsg({ type: 'ai', text: 'Vi har ingen aktive produkter for øjeblikket. Kontakt os på fb@flai.dk.' });

      } else if (intent === 'reasoning') {
        addMsg({ type: 'ai', text });
        if (showProductsAfter) {
          let toShow: Product[];
          if (!productIds || productIds === 'all') {
            toShow = sorted;
          } else {
            const validIds = new Set(sorted.map((p) => String(p.id)));
            const ids = (productIds as string[]).filter((id) => validIds.has(id));
            toShow = ids.length > 0 ? sorted.filter((p) => ids.includes(String(p.id))) : sorted;
          }
          if (toShow.length > 0) {
            const isPersonalised = Array.isArray(productIds) && productIds.length > 0 && toShow.length < sorted.length;
            addMsg({ type: 'products', products: toShow, isPersonalised }, false);
          }
        }

      } else if (intent === 'portfolio') {
        addMsg({ type: 'ai', text });
        if (allPortfolio.length > 0) {
          addMsg({ type: 'portfolio', images: allPortfolio, portfolioRows, portfolioIds }, false);
        } else {
          addMsg({ type: 'ai', text: 'Vi har ikke uploadet portfolio endnu. Følg os på Facebook @flai.dk!' });
        }

      } else if (intent === 'coverage') {
        addMsg({ type: 'ai', text });
        if (address) {
          await handleCoverageCheck(address);
        } else {
          addMsg({ type: 'coverage-form' });
        }

      } else {
        addMsg({ type: 'ai', text });
      }

    } catch {
      const fb = keywordFallback(q);
      addMsg({ type: 'ai', text: fb.text });
    } finally {
      setLoading(false);
    }
  };

  const SUGGESTIONS = [
    'Hvad koster jeres tjenester?',
    'Vis mig jeres portfolio',
    'Hvad dækker I?',
    'Hvad er leveringstiden?',
  ];

  const renderMsg = (msg: Message) => {
    if (msg.type === 'user')
      return (
        <div
          key={msg.id}
          className="self-end bg-primary text-white px-4 py-3 max-w-xs"
          style={{ borderRadius: '12px 12px 2px 12px', fontSize: '.875rem', lineHeight: 1.55, fontWeight: 500 }}
        >
          {msg.text}
        </div>
      );

    if (msg.type === 'ai' && msg.text) // ✅ FIX: Guard ensures msg.text exists before rendering
      return (
        <div
          key={msg.id}
          className="self-start text-neutral-100 px-4 py-3"
          style={{
            background: 'var(--neutral-800,#262626)',
            borderRadius: '2px 12px 12px 12px',
            border: '1px solid rgba(255,255,255,0.08)',
            fontSize: '.875rem', lineHeight: 1.7, maxWidth: '88%', textAlign: 'left',
          }}
          dangerouslySetInnerHTML={{ __html: formatAI(msg.text) }}
        />
      );

    if (msg.type === 'products' && msg.products?.length)
      return (
        <div key={msg.id} className="w-full">
          <style>{`@media (min-width: 640px) { .aicta-products-grid { grid-template-columns: repeat(2, 1fr) !important; } }`}</style>
          <div className="aicta-products-grid" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
            {msg.products.map((p) => <ProductCard key={p.id} product={p} />)}
          </div>
          <button
            className="btn-primary w-full mt-3 flex items-center justify-center gap-2"
            style={{ fontSize: '.875rem', padding: '10px' }}
            onClick={() => navigate('/products')}
          >
            <EditableContent contentKey="ai-cta-se-alle-vores-tjenester" fallback="Se alle vores tjenester" /> <ArrowRight size={15} />
          </button>
        </div>
      );

    if (msg.type === 'portfolio' && msg.images?.length)
      return (
        <PortfolioGrid
          key={msg.id}
          images={msg.images}
          portfolioRows={msg.portfolioRows}
          portfolioIds={msg.portfolioIds}
        />
      );

    if (msg.type === 'coverage-form')
      return <CoverageForm key={msg.id} onCheck={handleCoverageCheck} loading={coverageLoading} />;

    if (msg.type === 'coverage-result' && msg.coverageResult)
      return <CoverageResult key={msg.id} result={msg.coverageResult} />;

    return null;
  };

  const inputBar = (
    <div
      className="flex items-center gap-2 rounded-xl"
      style={{
        background: 'var(--neutral-800,#262626)',
        border: '1px solid rgba(255,255,255,0.10)',
        padding: '8px 8px 8px 18px',
        maxWidth: 680, margin: '0 auto',
      }}
    >
      <Sparkles size={17} style={{ color: 'var(--secondary)', flexShrink: 0 }} />
      <input
        ref={inputRef}
        className="flex-1 bg-transparent border-none outline-none text-neutral-50 min-w-0"
        style={{ fontSize: '.9375rem', fontFamily: 'inherit' }}
        placeholder="Spørg om priser, se portfolio, tjek adresse…"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') handleSend(); }}
        disabled={loading}
      />
      <button
        className="btn-primary flex items-center gap-2 whitespace-nowrap"
        style={{ padding: '9px 18px', fontSize: '.85rem', borderRadius: 9, flexShrink: 0 }}
        onClick={handleSend}
        disabled={loading || !input.trim()}
      >
        {loading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} <EditableContent contentKey="ai-cta-send" fallback="Send" />
      </button>
    </div>
  );

  return (
    <>
      {!expanded && (
        <>
          {inputBar}
          <div className="flex flex-wrap gap-2 justify-center" style={{ maxWidth: 680, margin: '12px auto 0' }}>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                className="btn-secondary whitespace-nowrap"
                style={{ fontSize: '.78rem', padding: '6px 13px', borderRadius: 8 }}
                onClick={() => { setInput(s); setTimeout(() => inputRef.current?.focus(), 30); }}
              >
                {s}
              </button>
            ))}
          </div>
        </>
      )}

      {expanded && messages.length > 0 && (
        <div
          className="rounded-2xl overflow-hidden"
          style={{
            maxWidth: 680, margin: '12px auto 0',
            background: 'var(--neutral-900,#171717)',
            border: '1px solid rgba(255,255,255,0.09)',
            animation: 'aicta-in .22s ease',
          }}
        >
          <div
            className="flex items-center justify-between px-4 py-3"
            style={{ background: 'var(--neutral-800,#262626)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}
          >
            <span
              className="flex items-center gap-2 font-bold uppercase tracking-widest"
              style={{ fontSize: '.7rem', color: 'var(--secondary)' }}
            >
              <Sparkles size={11} /> <EditableContent contentKey="ai-cta-flai-ai" fallback="Flai AI" />
            </span>
            <button
              style={{ background: 'none', border: 'none', color: 'var(--neutral-500,#737373)', cursor: 'pointer', borderRadius: 6, padding: 4 }}
              title="Luk"
              onClick={() => {
                setExpanded(false);
                setMessages([]);
                historyRef.current = [];
              }}
            >
              <X size={15} />
            </button>
          </div>

          <div
            ref={msgsContRef}
            className="flex flex-col gap-3 p-4 overflow-y-auto"
            style={{ maxHeight: 560 }}
          >
            {messages.map(renderMsg)}
            {loading && (
              <div
                className="self-start flex items-center gap-2 px-4 py-3"
                style={{
                  background: 'var(--neutral-800,#262626)',
                  border: '1px solid rgba(255,255,255,0.07)',
                  borderRadius: '2px 12px 12px 12px',
                  color: 'var(--neutral-500,#737373)',
                  fontSize: '.85rem',
                }}
              >
                <Loader2 size={13} className="animate-spin" /> <EditableContent contentKey="ai-cta-taenker" fallback="Tænker…" />
              </div>
            )}
          </div>

          <div style={{ background: 'var(--neutral-800,#262626)', borderTop: '1px solid rgba(255,255,255,0.06)', padding: '12px 16px 8px' }}>
            {inputBar}
          </div>

          <div className="flex flex-wrap gap-2 px-4 pb-4 pt-2" style={{ background: 'var(--neutral-800,#262626)' }}>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                className="btn-secondary whitespace-nowrap"
                style={{ fontSize: '.72rem', padding: '4px 10px', borderRadius: 7 }}
                onClick={() => { setInput(s); inputRef.current?.focus(); }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      <style>{`@keyframes aicta-in { from{opacity:0;transform:translateY(-6px)} to{opacity:1;transform:none} }`}</style>
    </>
  );
};

// ✅ FIX: Wrap export in ErrorBoundary so any render crash shows a graceful message instead of black screen
const AiCTA: React.FC = () => (
  <ErrorBoundary>
    <AiCTAInner />
  </ErrorBoundary>
);

export default AiCTA;
