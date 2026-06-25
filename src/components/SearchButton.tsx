import EditableContent from './EditableContent';
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, X, ArrowRight, Package, FileText, Calendar } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../contexts/DataContext';
import { getSearchTerms, termMatches, scoreProduct } from '../utils/searchSynonyms';

interface SearchButtonProps { isMobile?: boolean; }

const QUICK_PAGES = [
  { id: 'products',  title: 'Vores Tjenester', url: '/products'  },
  { id: 'portfolio', title: 'Vores Arbejde',   url: '/portfolio' },
  { id: 'contact',   title: 'Kontakt',         url: '/contact'   },
  { id: 'booking',   title: 'Book nu',         url: '/booking'   },
  { id: 'ratings',   title: 'Anmeldelser',     url: '/ratings'   },
];


const SearchButton: React.FC<SearchButtonProps> = ({ isMobile = false }) => {
  const [isOpen, setIsOpen]       = useState(false);
  const [query, setQuery]         = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const navigate                  = useNavigate();
  const inputRef                  = useRef<HTMLInputElement>(null);
  const { products, refreshProducts } = useData();

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
        setIsFocused(true);
      }, 50);
      if (products.length === 0) {
        refreshProducts();
      }
    }
  }, [isOpen]);

  const handleClose = () => { setIsOpen(false); setQuery(''); setIsFocused(false); };
  const go = (q: string) => {
    if (q.trim()) { navigate(`/search?q=${encodeURIComponent(q.trim())}`); handleClose(); }
  };

  const q = query.trim();

  const { quickProducts, quickPages } = useMemo(() => {
    if (q.length < 2) return { quickProducts: [], quickPages: [] };
    const terms = getSearchTerms(q);

    const scored = products
      .map(p => ({ p, score: scoreProduct(q, p.name, p.description, p.category) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(({ p }) => p);

    const pages = QUICK_PAGES.filter(p =>
      terms.some(t => termMatches(t, p.title))
    );

    return { quickProducts: scored, quickPages: pages };
  }, [q, products, products.length]);

  const hasResults = quickProducts.length > 0 || quickPages.length > 0;

  const showDropdown = isOpen && q.length >= 2 && isFocused;

  const ResultItems = ({ mouseDown = false }: { mouseDown?: boolean }) => {
    const ev = (fn: () => void) => mouseDown ? { onMouseDown: fn } : { onClick: fn };
    return (
      <>
        {quickProducts.length > 0 && (
          <div className="px-2 pt-2 pb-1">
            <p className="text-xs text-neutral-500 px-2 mb-1 uppercase tracking-wide font-medium"><EditableContent contentKey="search-button-produkter" fallback="Produkter" /></p>
            {quickProducts.map(p => (
              <button
                key={p.id}
                {...ev(() => { navigate(`/product/${encodeURIComponent(p.name)}`); handleClose(); })}
                className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-neutral-700/50 transition-colors group text-left"
              >
                <Package size={14} className="text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-white block truncate">{p.name}</span>
                  <span className="text-xs text-neutral-400">{p.price} <EditableContent contentKey="search-button-kr" fallback="kr" /></span>
                </div>
              </button>
            ))}
          </div>
        )}

        {quickPages.length > 0 && (
          <div className="px-2 pb-1">
            {quickProducts.length > 0 && <div className="border-t border-neutral-700/60 my-1" />}
            <p className="text-xs text-neutral-500 px-2 mb-1 uppercase tracking-wide font-medium"><EditableContent contentKey="search-button-sider" fallback="Sider" /></p>
            {quickPages.map(p => (
              <button key={p.id} {...ev(() => { navigate(p.url); handleClose(); })}
                className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-neutral-700 text-left transition-colors group">
                <FileText size={14} className="text-neutral-400 shrink-0" />
                <span className="text-sm text-white flex-1">{p.title}</span>
                <ArrowRight size={12} className="text-neutral-600 group-hover:text-primary shrink-0 transition-colors" />
              </button>
            ))}
          </div>
        )}

        {!hasResults && (
          <div className="px-4 py-4 text-sm text-neutral-500 text-center">
            <EditableContent contentKey="search-button-ingen-hurtige-resultater" fallback="Ingen hurtige resultater" />
          </div>
        )}
      </>
    );
  };

  // ── Mobile ──────────────────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <>
        <button onClick={() => setIsOpen(true)} className="text-white hover:text-neutral-300 transition-colors">
          <Search size={24} />
        </button>

        {isOpen && (
          <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 px-4">
            <div className="bg-neutral-900 border border-neutral-700 rounded-2xl w-full max-w-md shadow-2xl">
              <div className="p-4">
                <div className="relative flex items-center">
                  <Search size={18} className="absolute left-3 text-neutral-400 pointer-events-none" />
                  <input ref={inputRef} type="text" value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => setTimeout(() => setIsFocused(false), 150)}
                    onKeyDown={(e) => { if (e.key === 'Enter') go(query); if (e.key === 'Escape') handleClose(); }}
                    placeholder="Søg produkter, portfolio..."
                    className="w-full px-4 py-3 pl-10 pr-10 bg-neutral-800 border border-neutral-700 rounded-xl text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary"
                    autoComplete="off"
                  />
                  {query && (
                    <button type="button" onClick={() => setQuery('')}
                      className="absolute right-3 text-neutral-400 hover:text-white transition-colors">
                      <X size={16} />
                    </button>
                  )}
                </div>
              </div>

              {showDropdown && (
                <div className="border-t border-neutral-800 max-h-72 overflow-y-auto">
                  <ResultItems mouseDown={false} />
                </div>
              )}

              {showDropdown && hasResults && (
                <div className="border-t border-neutral-800 p-2">
                  <button onClick={() => go(query)}
                    className="w-full flex items-center justify-between px-3 py-2 text-sm text-primary hover:bg-neutral-800 rounded-lg transition-colors">
                    <span><EditableContent contentKey="search-button-se-alle-resultater-for-2" fallback="Se alle resultater for &quot;" />{query}"</span>
                    <ArrowRight size={14} />
                  </button>
                </div>
              )}

              <div className="flex gap-2 p-4 pt-2 border-t border-neutral-800">
                <button onClick={handleClose}
                  className="flex-1 py-2 bg-neutral-700 text-white rounded-lg hover:bg-neutral-600 transition-colors text-sm">
                  <EditableContent contentKey="search-button-annuller" fallback="Annuller" />
                </button>
                <button onClick={() => go(query)} disabled={!query.trim()}
                  className="flex-1 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors text-sm disabled:opacity-40">
                  <EditableContent contentKey="search-button-soeg-2" fallback="Søg" />
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  // ── Desktop ─────────────────────────────────────────────────────────────────
  return (
    <div className="relative">
      {!isOpen ? (
        <button onClick={() => setIsOpen(true)}
          className="flex items-center space-x-2 text-white hover:text-neutral-300 transition-colors">
          <Search size={20} />
          <span className="hidden lg:inline"><EditableContent contentKey="search-button-soeg" fallback="Søg" /></span>
        </button>
      ) : (
        <div className="relative">
          <form onSubmit={(e) => { e.preventDefault(); go(query); }} className="flex items-center">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
              <input ref={inputRef} type="text" value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setTimeout(() => setIsFocused(false), 150)}
                onKeyDown={(e) => { if (e.key === 'Escape') handleClose(); }}
                placeholder="Søg produkter, portfolio..."
                className="w-72 px-4 py-2 pl-9 bg-neutral-800 border border-neutral-700 rounded-xl text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                autoComplete="off"
              />
            </div>
            <button type="button" onClick={handleClose}
              className="ml-2 p-1.5 text-neutral-400 hover:text-white transition-colors">
              <X size={16} />
            </button>
          </form>

          {showDropdown && (
            <div className="absolute top-full right-0 mt-2 w-80 bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl z-50 overflow-hidden">
              <div className="max-h-72 overflow-y-auto">
                <ResultItems mouseDown={true} />
              </div>
              <div className="border-t border-neutral-800 p-2">
                <button onMouseDown={() => go(query)}
                  className="w-full flex items-center justify-between px-3 py-2 text-sm text-primary hover:bg-neutral-800 rounded-lg transition-colors">
                  <span><EditableContent contentKey="search-button-se-alle-resultater-for" fallback="Se alle resultater for &quot;" />{query}"</span>
                  <ArrowRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SearchButton;
