import { supabase } from './supabase';
import {
  syncProducts, syncPortfolio, syncPages, syncContent,
  ensureIndexes, upsertDocument, deleteDocument,
  INDEXES, STATIC_PAGES, getIndexStats,
  type MeilisearchProduct, type MeilisearchPortfolio, type MeilisearchContent,
  meiliRequest,
} from './meilisearch';
import { buildMeiliSynonyms, expandWithSynonyms } from './searchSynonyms';

// ─── Push synonyms to Meilisearch products index ───────────────────────────────

const DANISH_STOPWORDS = [
  'af','min','mit','mine','din','dit','dine','sin','sit','sine',
  'en','et','den','det','de','og','eller','i','på','til','fra',
  'med','er','var','har','jeg','du','han','hun','vi','man',
  'at','som','for','ikke','men','om','hvis','når','der','her',
  'vil','kan','skal','må','bør','får','gør','ved','ser',
  'dem','ham','hende','os','jer','sig','hvad','hvor','hvem',
];

async function applySynonymsAndStopwords(): Promise<void> {
  const synonyms = buildMeiliSynonyms();
  const targets = [INDEXES.PRODUCTS, INDEXES.PORTFOLIO, INDEXES.PAGES];
  await Promise.all(targets.map(async (idx) => {
    try {
      await meiliRequest('PUT', `/indexes/${idx}/settings/synonyms`, synonyms);
      await meiliRequest('PUT', `/indexes/${idx}/settings/stop-words`, DANISH_STOPWORDS);
    } catch (err) {
      console.warn(`[Sync] Could not apply settings to ${idx}:`, err);
    }
  }));
}

// ─── Full sync ─────────────────────────────────────────────────────────────────

export async function syncAllToMeilisearch(): Promise<{
  success: boolean;
  counts: Record<string, number>;
  errors: string[];
}> {
  const errors: string[] = [];
  const counts: Record<string, number> = {};

  try { await ensureIndexes(); } catch (err) {
    errors.push(`Index setup: ${err instanceof Error ? err.message : err}`);
  }

  // Apply synonyms
  await applySynonymsAndStopwords();

  // Products — enrich with synonym keywords
  try {
    const { data: products, error } = await supabase.from('products').select('*').order('array');
    if (error) throw error;

    const docs: MeilisearchProduct[] = (products || []).map(p => ({
      id: String(p.id),
      name: p.name,
      // Expand description with synonym keywords so "hus" finds "ejendom" etc.
      description: expandWithSynonyms(`${p.description} ${p.name}`),
      price: p.price,
      category: p.category,
      images: p.images ?? [],
      is_exclusive_to_business: p.is_exclusive_to_business,
      is_editing_included: p.is_editing_included,
      array: p.array ?? 0,
      _type: 'product',
    }));

    await syncProducts(docs);
    counts.products = docs.length;
  } catch (err) {
    errors.push(`Products: ${err instanceof Error ? err.message : err}`);
  }

  // Portfolio
  try {
    const { data: portfolio, error } = await supabase
      .from('portfolio_images').select('*').order('created_at', { ascending: false });
    if (error) throw error;

    const docs: MeilisearchPortfolio[] = (portfolio || []).map(p => ({
      id: String(p.id),
      title: expandWithSynonyms(p.title),
      image_url: p.image_url,
      likes: p.likes ?? 0,
      dislikes: p.dislikes ?? 0,
      created_at: p.created_at,
      _type: 'portfolio',
    }));

    await syncPortfolio(docs);
    counts.portfolio = docs.length;
  } catch (err) {
    errors.push(`Portfolio: ${err instanceof Error ? err.message : err}`);
  }

  // Pages
  try {
    await syncPages(STATIC_PAGES);
    counts.pages = STATIC_PAGES.length;
  } catch (err) {
    errors.push(`Pages: ${err instanceof Error ? err.message : err}`);
  }

  // Content — skipped intentionally
  counts.content = 0;

  return { success: errors.length === 0, counts, errors };
}

// ─── Incremental helpers ───────────────────────────────────────────────────────

export async function syncProductToMeilisearch(product: {
  id: number; name: string; description: string; price: number; category: string;
  images: string[]; is_exclusive_to_business: boolean; is_editing_included: boolean; array: number;
}): Promise<void> {
  await upsertDocument(INDEXES.PRODUCTS, {
    id: String(product.id),
    name: product.name,
    description: expandWithSynonyms(`${product.description} ${product.name}`),
    price: product.price,
    category: product.category,
    images: product.images ?? [],
    is_exclusive_to_business: product.is_exclusive_to_business,
    is_editing_included: product.is_editing_included,
    array: product.array ?? 0,
    _type: 'product',
  });
}

export async function deleteProductFromMeilisearch(id: number): Promise<void> {
  await deleteDocument(INDEXES.PRODUCTS, String(id));
}

export async function syncPortfolioItemToMeilisearch(item: {
  id: string; title: string; image_url: string; likes: number; dislikes: number; created_at: string;
}): Promise<void> {
  await upsertDocument(INDEXES.PORTFOLIO, {
    id: item.id,
    title: expandWithSynonyms(item.title),
    image_url: item.image_url,
    likes: item.likes ?? 0,
    dislikes: item.dislikes ?? 0,
    created_at: item.created_at,
    _type: 'portfolio',
  });
}

export async function deletePortfolioItemFromMeilisearch(id: string): Promise<void> {
  await deleteDocument(INDEXES.PORTFOLIO, id);
}

export async function getMeilisearchIndexStats() {
  const results: Record<string, { numberOfDocuments: number; isIndexing: boolean }> = {};
  await Promise.all(Object.values(INDEXES).map(async (index) => {
    try {
      const s = await getIndexStats(index as any);
      results[index] = { numberOfDocuments: s.numberOfDocuments, isIndexing: s.isIndexing };
    } catch {
      results[index] = { numberOfDocuments: -1, isIndexing: false };
    }
  }));
  return results;
}