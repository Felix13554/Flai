import { useState, useEffect, useRef } from 'react';
import { useData } from '../contexts/DataContext';
import { getSearchTerms, termMatches, scoreProduct } from '../utils/searchSynonyms';
import type { Product, PortfolioImage } from '../types';

// ─── Result types ──────────────────────────────────────────────────────────────

export interface PageResult {
  id: string;
  title: string;
  description: string;
  url: string;
  _highlight?: { title?: string; description?: string };
}

export interface ProductResult {
  product: Product;
  _highlight?: { name?: string; description?: string; category?: string };
  _snippet?: string;
  _score?: number;
}

export interface PortfolioResult {
  item: PortfolioImage;
  _highlight?: { title?: string };
}

export interface SearchResults {
  products: ProductResult[];
  portfolio: PortfolioResult[];
  pages: PageResult[];
  total: number;
  productFacets?: Record<string, number>;
}

export interface SearchFilters {
  category?: string;
  sortBy?: 'price_asc' | 'price_desc' | 'name_asc' | '';
}

const EMPTY: SearchResults = { products: [], portfolio: [], pages: [], total: 0 };

const STATIC_PAGES: PageResult[] = [
  { id: 'home',      title: 'Forside',         description: 'Dronefotografering og luftoptagelser i Danmark',   url: '/'          },
  { id: 'products',  title: 'Vores Tjenester', description: 'Se alle vores drone tjenester og priser',           url: '/products'  },
  { id: 'portfolio', title: 'Vores Arbejde',   description: 'Se eksempler på vores droneoptagelser og luftfoto', url: '/portfolio' },
  { id: 'coverage',  title: 'Dækningsområder', description: 'Se hvor vi tilbyder droneoptagelser',              url: '/coverage'  },
  { id: 'contact',   title: 'Kontakt',         description: 'Kom i kontakt med os',                             url: '/contact'   },
  { id: 'booking',   title: 'Book nu',         description: 'Book din droneoptagelse online',                    url: '/booking'   },
  { id: 'ratings',   title: 'Anmeldelser',     description: 'Se hvad vores kunder siger om os',                 url: '/ratings'   },
];

// ─── Helpers ───────────────────────────────────────────────────────────────────

function applyProductFilters(products: ProductResult[], filters: SearchFilters): ProductResult[] {
  let r = [...products];
  if (filters.category) r = r.filter(({ product: p }) => p.category === filters.category);
  if (filters.sortBy === 'price_asc')  r.sort((a, b) => a.product.price - b.product.price);
  if (filters.sortBy === 'price_desc') r.sort((a, b) => b.product.price - a.product.price);
  if (filters.sortBy === 'name_asc')   r.sort((a, b) => a.product.name.localeCompare(b.product.name, 'da'));
  return r;
}

// ─── Highlight builder ────────────────────────────────────────────────────────

function buildHighlight(text: string, terms: string[]): string {
  if (!text || !terms.length) return text ?? '';
  const escaped = terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  return text.replace(new RegExp(`(${escaped})`, 'gi'), '<mark>$1</mark>');
}

// ─── Core search — uses built-in algorithms from searchSynonyms ───────────────

function localSearch(
  query: string,
  filters: SearchFilters,
  allProducts: Product[],
  portfolioImages: PortfolioImage[],
): SearchResults {
  const terms = getSearchTerms(query);
  if (terms.length === 0) return EMPTY;

  // Score and rank products using the rich scoreProduct function (synonym + fuzzy + category signals)
  const scored = allProducts
    .map(p => ({
      product: p,
      score: scoreProduct(query, p.name, p.description ?? '', p.category ?? ''),
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score);

  let products: ProductResult[] = scored.map(({ product, score }) => ({
    product,
    _score: score,
    _highlight: {
      name:        buildHighlight(product.name,               terms),
      description: buildHighlight(product.description ?? '', terms),
      category:    buildHighlight(product.category    ?? '', terms),
    },
    _snippet: buildHighlight(product.description ?? product.name, terms),
  }));

  products = applyProductFilters(products, filters);

  // Build category facets from ALL matched products (before category filter is applied)
  const productFacets: Record<string, number> = {};
  for (const { product } of scored) {
    if (product.category) productFacets[product.category] = (productFacets[product.category] ?? 0) + 1;
  }

  const portfolio: PortfolioResult[] = portfolioImages
    .filter(img => terms.some(t => termMatches(t, img.title)))
    .map(item => ({
      item,
      _highlight: { title: buildHighlight(item.title, terms) },
    }));

  const pages: PageResult[] = STATIC_PAGES
    .filter(p => terms.some(t => termMatches(t, `${p.title} ${p.description}`)))
    .map(p => ({
      ...p,
      _highlight: {
        title:       buildHighlight(p.title,       terms),
        description: buildHighlight(p.description, terms),
      },
    }));

  return {
    products,
    portfolio,
    pages,
    total: products.length + portfolio.length + pages.length,
    productFacets: Object.keys(productFacets).length > 0 ? productFacets : undefined,
  };
}

// ─── Main hook ─────────────────────────────────────────────────────────────────

export function useSearch(query: string, filters: SearchFilters = {}) {
  const { products: allProducts, portfolioImages } = useData();
  const [results, setResults]         = useState<SearchResults>(EMPTY);
  const [loading, setLoading]         = useState(false);
  const [ready, setReady]             = useState(true);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const latest = useRef('');

  // Kept for API compatibility with SearchPage (which destructures these)
  const syncing = false;
  const synced  = true;

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults(EMPTY);
      setSuggestions([]);
      setLoading(false);
      setReady(true);
      return;
    }

    latest.current = q;
    setLoading(true);
    setReady(false);

    const tid = setTimeout(() => {
      if (latest.current !== q) return;

      const found = localSearch(q, filters, allProducts, portfolioImages);

      setResults(found);
      setReady(true);
      setLoading(false);

      setSuggestions(
        allProducts
          .map(p => p.name)
          .filter(name => {
            const terms = getSearchTerms(q);
            return (
              terms.length > 0 &&
              terms.some(t => name.toLowerCase().includes(t.toLowerCase())) &&
              name.toLowerCase() !== q.toLowerCase()
            );
          })
          .slice(0, 5),
      );
    }, 150);

    return () => clearTimeout(tid);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, filters.category, filters.sortBy, allProducts.length, portfolioImages.length]);

  return { results, loading, syncing, synced, ready, suggestions };
}

// ─── getHighlight — used by SearchPage ────────────────────────────────────────

export function getHighlight(
  highlightHtml: string | undefined,
  fallback: string,
  query: string,
): string {
  if (highlightHtml && highlightHtml.includes('<mark>')) return highlightHtml;
  if (!fallback || !query.trim()) return fallback ?? '';
  const terms = getSearchTerms(query);
  if (!terms.length) return fallback;
  return buildHighlight(fallback, terms);
}

// ─── useHighlight — hook alias (kept for backward compat) ─────────────────────

export function useHighlight(
  highlightHtml: string | undefined,
  fallback: string,
  query: string,
): string {
  return getHighlight(highlightHtml, fallback, query);
}

export type { Product, PortfolioImage };
