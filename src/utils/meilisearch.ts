/**
 * Meilisearch Client Utility
 * Full-featured search client — gracefully handles missing indexes (auto-creates them)
 */

const MEILISEARCH_URL = 'https://ms-48136f9b45b2-41973.fra.meilisearch.io';
const MEILISEARCH_MASTER_KEY = '58c3af13610e0c42855a9a8ad7a346c6a591542a';

export const INDEXES = {
  PRODUCTS:  'products',
  PORTFOLIO: 'portfolio',
  PAGES:     'pages',
  CONTENT:   'content',
} as const;

export type IndexName = (typeof INDEXES)[keyof typeof INDEXES];

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MeilisearchProduct {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  images: string[];
  is_exclusive_to_business: boolean;
  is_editing_included: boolean;
  array: number;
  _type: 'product';
}

export interface MeilisearchPortfolio {
  id: string;
  title: string;
  image_url: string;
  likes: number;
  dislikes: number;
  created_at: string;
  _type: 'portfolio';
}

export interface MeilisearchPage {
  id: string;
  title: string;
  description: string;
  url: string;
  keywords: string[];
  _type: 'page';
}

export interface MeilisearchContent {
  id: string;
  key: string;
  title: string;
  description: string;
  category: string;
  url: string;
  _type: 'content';
}

export type MeilisearchDocument =
  | MeilisearchProduct
  | MeilisearchPortfolio
  | MeilisearchPage
  | MeilisearchContent;

export interface SearchResponse<T> {
  hits: (T & { _formatted?: Partial<T>; _rankingScore?: number })[];
  query: string;
  processingTimeMs: number;
  limit: number;
  offset: number;
  estimatedTotalHits: number;
  facetDistribution?: Record<string, Record<string, number>>;
}

export interface MultiSearchResult {
  products:  SearchResponse<MeilisearchProduct>;
  portfolio: SearchResponse<MeilisearchPortfolio>;
  pages:     SearchResponse<MeilisearchPage>;
  content:   SearchResponse<MeilisearchContent>;
  totalHits: number;
  processingTimeMs: number;
}

// ─── Empty result factory ─────────────────────────────────────────────────────

function emptyResponse<T>(query = ''): SearchResponse<T> {
  return { hits: [], query, processingTimeMs: 0, limit: 0, offset: 0, estimatedTotalHits: 0 };
}

// ─── Core API Helper ──────────────────────────────────────────────────────────

export async function meiliRequest<T = unknown>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
  path: string,
  body?: unknown
): Promise<T> {
  const res = await fetch(`${MEILISEARCH_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${MEILISEARCH_MASTER_KEY}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || `${res.status} ${res.statusText}`);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ─── Index Settings ───────────────────────────────────────────────────────────

// Danish stopwords pushed to Meilisearch so they're ignored during search
const DANISH_STOPWORDS = [
  'af','min','mit','mine','din','dit','dine','sin','sit','sine',
  'en','et','den','det','de','og','eller','i','på','til','fra',
  'med','er','var','har','jeg','du','han','hun','vi','man',
  'at','som','for','ikke','men','om','hvis','når','der','her',
  'vil','kan','skal','må','bør','får','gør','ved','ser',
  'dem','ham','hende','os','jer','sig','hvad','hvor','hvem',
];

const INDEX_SETTINGS: Record<IndexName, object> = {
  products: {
    searchableAttributes: ['name', 'description', 'category'],
    displayedAttributes: ['*'],
    filterableAttributes: ['category', 'is_exclusive_to_business', 'is_editing_included', 'price'],
    sortableAttributes: ['price', 'array', 'name'],
    rankingRules: ['words', 'typo', 'proximity', 'attribute', 'sort', 'exactness'],
    typoTolerance: { enabled: true, minWordSizeForTypos: { oneTypo: 3, twoTypos: 6 } },
    stopWords: DANISH_STOPWORDS,
    pagination: { maxTotalHits: 1000 },
    faceting: { maxValuesPerFacet: 20 },
  },
  portfolio: {
    searchableAttributes: ['title'],
    displayedAttributes: ['*'],
    filterableAttributes: ['likes'],
    sortableAttributes: ['likes', 'dislikes', 'created_at'],
    rankingRules: ['words', 'typo', 'proximity', 'attribute', 'sort', 'exactness'],
    typoTolerance: { enabled: true, minWordSizeForTypos: { oneTypo: 3, twoTypos: 5 } },
    stopWords: DANISH_STOPWORDS,
  },
  pages: {
    searchableAttributes: ['title', 'description', 'keywords'],
    displayedAttributes: ['*'],
    filterableAttributes: [],
    sortableAttributes: [],
    rankingRules: ['words', 'typo', 'proximity', 'attribute', 'exactness'],
    typoTolerance: { enabled: true, minWordSizeForTypos: { oneTypo: 3, twoTypos: 6 } },
    stopWords: DANISH_STOPWORDS,
  },
  content: {
    searchableAttributes: ['title', 'description', 'key', 'category'],
    displayedAttributes: ['*'],
    filterableAttributes: ['category'],
    sortableAttributes: [],
    rankingRules: ['words', 'typo', 'proximity', 'attribute', 'exactness'],
    typoTolerance: { enabled: true },
    stopWords: DANISH_STOPWORDS,
  },
};

// ─── Static Pages (always available even without sync) ────────────────────────

export const STATIC_PAGES: MeilisearchPage[] = [
  { id: 'home',     title: 'Forside',           description: 'Dronefotografering og luftoptagelser i Danmark',  url: '/',         keywords: ['hjem','forside','drone','luftfoto','optagelser','start'], _type: 'page' },
  { id: 'products', title: 'Vores Tjenester',   description: 'Se alle vores drone tjenester og priser',          url: '/products', keywords: ['produkter','tjenester','priser','services','drone','foto','video'], _type: 'page' },
  { id: 'portfolio',title: 'Vores Arbejde',     description: 'Se eksempler på vores droneoptagelser og luftfoto', url: '/portfolio',keywords: ['portfolio','arbejde','eksempler','galleri','billeder'], _type: 'page' },
  { id: 'coverage', title: 'Dækningsområder',   description: 'Se hvor vi tilbyder droneoptagelser i Danmark',   url: '/coverage', keywords: ['dækning','områder','lokation','service','by'], _type: 'page' },
  { id: 'contact',  title: 'Kontakt',           description: 'Kom i kontakt med os',                             url: '/contact',  keywords: ['kontakt','email','telefon','spørgsmål','hjælp'], _type: 'page' },
  { id: 'booking',  title: 'Book en Session',   description: 'Book din droneoptagelse online',                   url: '/booking',  keywords: ['book','bestil','tid','session','reservation'], _type: 'page' },
  { id: 'ratings',  title: 'Anmeldelser',       description: 'Se hvad vores kunder siger om os',                 url: '/ratings',  keywords: ['anmeldelser','ratings','feedback','kunderne','stjerner'], _type: 'page' },
];

// ─── Auto-init: create index + settings + seed if missing ────────────────────

async function ensureIndex(uid: IndexName): Promise<void> {
  try {
    await meiliRequest('GET', `/indexes/${uid}`);
  } catch {
    // Index doesn't exist — create it
    await meiliRequest('POST', '/indexes', { uid, primaryKey: 'id' });
    // Wait briefly for creation to propagate
    await new Promise((r) => setTimeout(r, 500));
  }
  // Always apply settings (idempotent)
  try {
    await meiliRequest('PATCH', `/indexes/${uid}/settings`, INDEX_SETTINGS[uid]);
  } catch {
    // Non-fatal — settings may already be correct
  }
}

// Track which indexes have been initialized this session
const initializedIndexes = new Set<IndexName>();

async function ensureIndexReady(uid: IndexName): Promise<void> {
  if (initializedIndexes.has(uid)) return;
  await ensureIndex(uid);
  // Seed pages index immediately so it works without a full sync
  if (uid === INDEXES.PAGES) {
    try {
      await meiliRequest('POST', `/indexes/${uid}/documents?primaryKey=id`, STATIC_PAGES);
    } catch {
      // Non-fatal
    }
  }
  initializedIndexes.add(uid);
}

// ─── Public Index Management ──────────────────────────────────────────────────

export async function ensureIndexes(): Promise<void> {
  await Promise.all(Object.values(INDEXES).map((uid) => ensureIndex(uid as IndexName)));
  try {
    await meiliRequest('POST', `/indexes/${INDEXES.PAGES}/documents?primaryKey=id`, STATIC_PAGES);
  } catch {
    // Non-fatal
  }
}

export async function syncProducts(products: MeilisearchProduct[]): Promise<void> {
  if (!products.length) return;
  await meiliRequest('POST', `/indexes/${INDEXES.PRODUCTS}/documents?primaryKey=id`, products);
}

export async function syncPortfolio(items: MeilisearchPortfolio[]): Promise<void> {
  if (!items.length) return;
  await meiliRequest('POST', `/indexes/${INDEXES.PORTFOLIO}/documents?primaryKey=id`, items);
}

export async function syncPages(pages: MeilisearchPage[]): Promise<void> {
  if (!pages.length) return;
  await meiliRequest('POST', `/indexes/${INDEXES.PAGES}/documents?primaryKey=id`, pages);
}

export async function syncContent(content: MeilisearchContent[]): Promise<void> {
  if (!content.length) return;
  await meiliRequest('POST', `/indexes/${INDEXES.CONTENT}/documents?primaryKey=id`, content);
}

export async function upsertDocument(index: IndexName, document: MeilisearchDocument): Promise<void> {
  await meiliRequest('POST', `/indexes/${index}/documents?primaryKey=id`, [document]);
}

export async function deleteDocument(index: IndexName, id: string): Promise<void> {
  await meiliRequest('DELETE', `/indexes/${index}/documents/${id}`);
}

// ─── Search ───────────────────────────────────────────────────────────────────

export interface SearchOptions {
  limit?: number;
  offset?: number;
  filters?: string;
  sort?: string[];
  facets?: string[];
  highlightPreTag?: string;
  highlightPostTag?: string;
  showRankingScore?: boolean;
}

const HIGHLIGHT = {
  pre:  '<mark>',
  post: '</mark>',
};

const HIGHLIGHT_FIELDS: Record<IndexName, string[]> = {
  products:  ['name', 'description', 'category'],
  portfolio: ['title'],
  pages:     ['title', 'description'],
  content:   ['title', 'description'],
};

/**
 * Search a single index. Returns empty results (never throws) when index is missing.
 */
export async function searchIndex<T>(
  index: IndexName,
  query: string,
  options: SearchOptions = {}
): Promise<SearchResponse<T>> {
  const {
    limit = 10,
    offset = 0,
    filters,
    sort,
    facets,
    highlightPreTag = HIGHLIGHT.pre,
    highlightPostTag = HIGHLIGHT.post,
    showRankingScore = true,
  } = options;

  // Auto-create index if missing (non-blocking best-effort)
  await ensureIndexReady(index).catch(() => {});

  const body: Record<string, unknown> = {
    q: query,
    limit,
    offset,
    attributesToHighlight: HIGHLIGHT_FIELDS[index],
    highlightPreTag,
    highlightPostTag,
    showRankingScore,
    attributesToCrop: ['description'],
    cropLength: 120,
    // 'last' = all query words are optional, best matches rank highest
    // ensures "hus optagelse" finds products even if only one word matches
    matchingStrategy: 'last',
  };

  if (filters) body.filter = filters;
  if (sort?.length) body.sort = sort;
  if (facets?.length) body.facets = facets;

  try {
    return await meiliRequest<SearchResponse<T>>('POST', `/indexes/${index}/search`, body);
  } catch (err) {
    console.warn(`[Meilisearch] ${index} search failed, returning empty:`, err);
    return emptyResponse<T>(query);
  }
}

/**
 * Multi-index parallel search — never throws, missing indexes return empty results.
 */
export async function multiSearch(
  query: string,
  options: {
    productLimit?: number;
    portfolioLimit?: number;
    pageLimit?: number;
    contentLimit?: number;
    productFilters?: string;
    productSort?: string[];
  } = {}
): Promise<MultiSearchResult> {
  const {
    productLimit   = 6,
    portfolioLimit = 6,
    pageLimit      = 5,
    contentLimit   = 5,
    productFilters,
    productSort,
  } = options;

  const [products, portfolio, pages, content] = await Promise.all([
    searchIndex<MeilisearchProduct>(INDEXES.PRODUCTS, query, {
      limit: productLimit,
      filters: productFilters,
      sort: productSort,
      facets: ['category'],
      showRankingScore: true,
    }),
    searchIndex<MeilisearchPortfolio>(INDEXES.PORTFOLIO, query, {
      limit: portfolioLimit,
      showRankingScore: true,
    }),
    searchIndex<MeilisearchPage>(INDEXES.PAGES, query, {
      limit: pageLimit,
      showRankingScore: true,
    }),
    searchIndex<MeilisearchContent>(INDEXES.CONTENT, query, {
      limit: contentLimit,
      showRankingScore: true,
    }),
  ]);

  const totalHits =
    (products.estimatedTotalHits  || 0) +
    (portfolio.estimatedTotalHits || 0) +
    (pages.estimatedTotalHits     || 0) +
    (content.estimatedTotalHits   || 0);

  const processingTimeMs = Math.max(
    products.processingTimeMs,
    portfolio.processingTimeMs,
    pages.processingTimeMs,
    content.processingTimeMs,
  );

  return { products, portfolio, pages, content, totalHits, processingTimeMs };
}

/**
 * Autocomplete: top N titles from one index.
 */
export async function autocompleteSearch(index: IndexName, query: string, limit = 5): Promise<string[]> {
  const result = await searchIndex<Record<string, string>>(index, query, { limit });
  const field: Record<IndexName, string> = { products: 'name', portfolio: 'title', pages: 'title', content: 'title' };
  return result.hits.map((h) => h[field[index]] as string).filter(Boolean);
}

/**
 * Cross-index suggestions (deduped).
 */
export async function getSearchSuggestions(query: string): Promise<string[]> {
  if (!query.trim() || query.length < 2) return [];
  const [products, pages] = await Promise.all([
    autocompleteSearch(INDEXES.PRODUCTS, query, 4),
    autocompleteSearch(INDEXES.PAGES,    query, 3),
  ]);
  return [...new Set([...products, ...pages])].slice(0, 6);
}

// ─── Health / Stats ───────────────────────────────────────────────────────────

export async function getMeilisearchHealth(): Promise<{ status: string; version: string }> {
  const [health, version] = await Promise.all([
    meiliRequest<{ status: string }>('GET', '/health'),
    meiliRequest<{ pkgVersion: string }>('GET', '/version'),
  ]);
  return { status: health.status, version: version.pkgVersion };
}

export async function getIndexStats(index: IndexName): Promise<{
  numberOfDocuments: number;
  isIndexing: boolean;
  fieldDistribution: Record<string, number>;
}> {
  return meiliRequest('GET', `/indexes/${index}/stats`);
}