import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { Search, Package, Image, FileText, ArrowRight, Filter, X, ChevronDown, SortAsc } from 'lucide-react';
import { useSearch, getHighlight, type SearchFilters, type ProductResult, type PortfolioResult, type PageResult } from '../hooks/useSearch';
import ProductCard, { ProductCardSkeleton } from '../components/ProductCard';
import EditableContent from '../components/EditableContent';

// ─── Highlight renderer ───────────────────────────────────────────────────────

function Hi({ html }: { html: string }) {
  return (
    <span
      className="[&_mark]:bg-yellow-400/40 [&_mark]:text-white [&_mark]:rounded-sm [&_mark]:px-0.5"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

// ─── Skeletons ─────────────────────────────────────────────────────────────────

function PortfolioSkeleton() {
  return (
    <div className="bg-neutral-800 rounded-xl overflow-hidden border border-neutral-700">
      <div className="w-full h-36 bg-gradient-to-r from-neutral-700 via-neutral-600 to-neutral-700 animate-shimmer bg-[length:200%_100%]" />
      <div className="p-3 space-y-2">
        <div className="h-4 bg-gradient-to-r from-neutral-700 via-neutral-600 to-neutral-700 animate-shimmer bg-[length:200%_100%] rounded w-3/4" />
        <div className="h-3 bg-gradient-to-r from-neutral-700 via-neutral-600 to-neutral-700 animate-shimmer bg-[length:200%_100%] rounded w-1/3" />
      </div>
    </div>
  );
}

function PageSkeletonItem() {
  return (
    <div className="bg-neutral-800 rounded-xl p-4 border border-neutral-700 space-y-2">
      <div className="h-4 bg-gradient-to-r from-neutral-700 via-neutral-600 to-neutral-700 animate-shimmer bg-[length:200%_100%] rounded w-1/3" />
      <div className="h-3 bg-gradient-to-r from-neutral-700 via-neutral-600 to-neutral-700 animate-shimmer bg-[length:200%_100%] rounded w-2/3" />
    </div>
  );
}

function SectionHeader({ label }: { label: string }) {
  return <div className="h-5 bg-gradient-to-r from-neutral-700 via-neutral-600 to-neutral-700 animate-shimmer bg-[length:200%_100%] rounded w-32 mb-4" />;
}

// ─── Tab type ──────────────────────────────────────────────────────────────────

type Tab = 'all' | 'products' | 'portfolio' | 'pages';

// ─── SearchPage ────────────────────────────────────────────────────────────────

const SearchPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const query    = searchParams.get('q') || '';

  const [input, setInput]             = useState(query);
  const [tab, setTab]                 = useState<Tab>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [category, setCategory]       = useState('');
  const [sortBy, setSortBy]           = useState<SearchFilters['sortBy']>('');
  const [showSugg, setShowSugg]       = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const { results, loading, syncing, synced, ready, suggestions } = useSearch(query, {
    category: category || undefined,
    sortBy: sortBy || undefined,
  });

  const { products, portfolio, pages, total, productFacets } = results;

  useEffect(() => { setInput(query); setTab('all'); }, [query]);

  const go = (q: string) => {
    if (q.trim()) { navigate(`/search?q=${encodeURIComponent(q.trim())}`); setShowSugg(false); }
  };

  const tabCounts: Record<Tab, number> = {
    all: total, products: products.length, portfolio: portfolio.length, pages: pages.length,
  };

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'all',       label: 'Alle',      icon: <Search size={13} />   },
    { id: 'products',  label: 'Produkter', icon: <Package size={13} />  },
    { id: 'portfolio', label: 'Portfolio', icon: <Image size={13} />    },
    { id: 'pages',     label: 'Sider',     icon: <FileText size={13} /> },
  ];

  const renderMedia = (url: string, title: string) => {
    if (url?.startsWith('youtube:')) {
      return (
        <div className="relative w-full aspect-video">
          <iframe className="absolute inset-0 w-full h-full rounded-t-xl"
            src={`https://www.youtube.com/embed/${url.split(':')[1]}`} title={title}
            frameBorder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
        </div>
      );
    }
    return <img src={url} alt={title} className="w-full h-36 object-cover rounded-t-xl" />;
  };

  const hasFilters = !!(category || sortBy);

  const showSkeleton = !!query && !ready;

  return (
    <div className="pt-24 pb-16 min-h-screen">
      <div className="container">
        <div className="max-w-5xl mx-auto">

          <h1 className="text-3xl font-bold mb-5"><EditableContent contentKey="search-page-soeg-paa-siden" fallback="Søg på siden" /></h1>

          {/* Search bar */}
          <div className="relative max-w-2xl mb-4">
            <form onSubmit={(e) => { e.preventDefault(); go(input); }}>
              <div className="relative flex items-center">
                <Search size={18} className="absolute left-4 text-neutral-400 pointer-events-none" />
                <input ref={inputRef} type="text" value={input}
                  onChange={(e) => { setInput(e.target.value); setShowSugg(true); }}
                  onFocus={() => setShowSugg(true)}
                  onBlur={() => setTimeout(() => setShowSugg(false), 150)}
                  onKeyDown={(e) => { if (e.key === 'Escape') setShowSugg(false); }}
                  placeholder="Søg efter produkter, portfolio, sider..."
                  className="w-full px-4 py-3 pl-11 pr-24 bg-neutral-800 border border-neutral-700 rounded-xl text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                  autoComplete="off"
                />
                {input && (
                  <button type="button" onClick={() => { setInput(''); inputRef.current?.focus(); }}
                    className="absolute right-20 text-neutral-500 hover:text-neutral-300 transition-colors">
                    <X size={16} />
                  </button>
                )}
                <button type="submit"
                  className="absolute right-2 px-4 py-1.5 bg-primary hover:bg-primary-dark text-white text-sm rounded-lg transition-colors font-medium">
                  <EditableContent contentKey="search-page-soeg" fallback="Søg" /></button>
              </div>
            </form>

            {/* Suggestions */}
            {showSugg && suggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-neutral-800 border border-neutral-700 rounded-xl shadow-2xl z-50 overflow-hidden">
                {suggestions.map((s, i) => (
                  <button key={i} onMouseDown={() => go(s)}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-left text-sm hover:bg-neutral-700 transition-colors text-neutral-200">
                    <Search size={13} className="text-neutral-500 shrink-0" />
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Stats + filter toggle */}
          {query && (
            <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
              <div className="text-sm text-neutral-400">
                {!ready ? (
                  <span className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full border-2 border-primary border-t-transparent animate-spin inline-block" />
                    <EditableContent contentKey="search-page-soeger" fallback="&#39;Søger...&#39;" />
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <span className="text-white font-medium">{total}</span> <EditableContent contentKey="search-page-resultater-for" fallback="resultater for" />{' '}
                    <span className="text-primary font-medium">"{query}"</span>
                    {loading && <span className="h-3 w-3 rounded-full border-2 border-primary border-t-transparent animate-spin inline-block" />}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {hasFilters && (
                  <button onClick={() => { setCategory(''); setSortBy(''); }}
                    className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 transition-colors">
                    <X size={12} /> <EditableContent contentKey="search-page-ryd-filtre" fallback="Ryd filtre" /></button>
                )}
                <button onClick={() => setShowFilters(v => !v)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                    hasFilters ? 'border-primary bg-primary/10 text-primary' : 'border-neutral-700 text-neutral-400 hover:text-white'
                  }`}>
                  <Filter size={13} /> <EditableContent contentKey="search-page-filtre" fallback="Filtre" />{hasFilters && <span className="px-1.5 py-0.5 bg-primary text-white text-xs rounded-full">{[category, sortBy].filter(Boolean).length}</span>}
                  <ChevronDown size={13} className={`transition-transform ${showFilters ? 'rotate-180' : ''}`} />
                </button>
              </div>
            </div>
          )}

          {/* Filters */}
          {showFilters && query && (
            <div className="mb-4 p-4 bg-neutral-800/60 border border-neutral-700 rounded-xl flex flex-wrap gap-6">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-neutral-400 font-medium uppercase tracking-wide"><EditableContent contentKey="search-page-kategori" fallback="Kategori" /></label>
                <div className="flex gap-2 flex-wrap">
                  <button onClick={() => setCategory('')}
                    className={`px-3 py-1 rounded-lg text-sm border transition-colors ${!category ? 'border-primary bg-primary/20 text-primary' : 'border-neutral-600 text-neutral-400 hover:border-neutral-500'}`}>
                    <EditableContent contentKey="search-page-alle" fallback="Alle" /></button>
                  {productFacets && Object.entries(productFacets).map(([cat, count]) => (
                    <button key={cat} onClick={() => setCategory(category === cat ? '' : cat)}
                      className={`px-3 py-1 rounded-lg text-sm border transition-colors ${category === cat ? 'border-primary bg-primary/20 text-primary' : 'border-neutral-600 text-neutral-400 hover:border-neutral-500'}`}>
                      {cat === 'photo' ? 'Foto' : cat === 'video' ? 'Video' : cat}
                      <span className="ml-1 text-xs opacity-60">({count})</span>
                    </button>
                  ))}
                  {!productFacets && (
                    <>
                      <button onClick={() => setCategory('photo')} className={`px-3 py-1 rounded-lg text-sm border transition-colors ${category === 'photo' ? 'border-primary bg-primary/20 text-primary' : 'border-neutral-600 text-neutral-400 hover:border-neutral-500'}`}><EditableContent contentKey="search-page-foto" fallback="Foto" /></button>
                      <button onClick={() => setCategory('video')} className={`px-3 py-1 rounded-lg text-sm border transition-colors ${category === 'video' ? 'border-primary bg-primary/20 text-primary' : 'border-neutral-600 text-neutral-400 hover:border-neutral-500'}`}><EditableContent contentKey="search-page-video" fallback="Video" /></button>
                    </>
                  )}
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-neutral-400 font-medium uppercase tracking-wide flex items-center gap-1">
                  <SortAsc size={11} /> <EditableContent contentKey="search-page-sortering" fallback="Sortering" /></label>
                <div className="flex gap-2 flex-wrap">
                  {([['', 'Relevans'], ['price_asc', 'Pris ↓'], ['price_desc', 'Pris ↑'], ['name_asc', 'Navn A–Ø']] as [string, string][]).map(([val, label]) => (
                    <button key={val} onClick={() => setSortBy(val as SearchFilters['sortBy'])}
                      className={`px-3 py-1 rounded-lg text-sm border transition-colors ${sortBy === val ? 'border-primary bg-primary/20 text-primary' : 'border-neutral-600 text-neutral-400 hover:border-neutral-500'}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Tabs */}
          {query && ready && total > 0 && (
            <div className="flex gap-1 mb-6 overflow-x-auto pb-1">
              {TABS.map(t => {
                const count = tabCounts[t.id];
                if (t.id !== 'all' && count === 0) return null;
                return (
                  <button key={t.id} onClick={() => setTab(t.id)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm whitespace-nowrap transition-colors border ${
                      tab === t.id ? 'border-primary bg-primary/10 text-primary font-medium' : 'border-transparent text-neutral-400 hover:text-white hover:bg-neutral-800'
                    }`}>
                    {t.icon} {t.label}
                    <span className={`px-1.5 py-0.5 rounded-full text-xs ${tab === t.id ? 'bg-primary/20 text-primary' : 'bg-neutral-700 text-neutral-400'}`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Empty states */}
          {!query && (
            <div className="text-center py-20">
              <div className="w-16 h-16 rounded-2xl bg-neutral-800 flex items-center justify-center mx-auto mb-4">
                <Search size={28} className="text-neutral-500" />
              </div>
              <h2 className="text-xl font-semibold mb-2"><EditableContent contentKey="search-page-soeg-efter-indhold" fallback="Søg efter indhold" /></h2>
              <p className="text-neutral-400 max-w-sm mx-auto"><EditableContent contentKey="search-page-find-produkter-og-portfolio-forstaar" fallback="Find produkter og portfolio — forstår synonymer og stavefejl." /></p>
            </div>
          )}

          {query && ready && !loading && total === 0 && (
            <div className="text-center py-20">
              <div className="w-16 h-16 rounded-2xl bg-neutral-800 flex items-center justify-center mx-auto mb-4">
                <Search size={28} className="text-neutral-500" />
              </div>
              <h2 className="text-xl font-semibold mb-2"><EditableContent contentKey="search-page-ingen-resultater-fundet" fallback="Ingen resultater fundet" /></h2>
              <p className="text-neutral-400 mb-6"><EditableContent contentKey="search-page-proev-andre-ord-soegningen-forstaar" fallback="Prøv andre ord — søgningen forstår f.eks. at &quot;hus&quot; er det samme som &quot;ejendom&quot;." /></p>
              <Link to="/products" className="btn-primary"><EditableContent contentKey="search-page-se-alle-produkter" fallback="Se Alle Produkter" /></Link>
            </div>
          )}

          {/* Skeletons */}
          {showSkeleton && (
            <div className="space-y-10">
              {(tab === 'all' || tab === 'products') && (
                <div>
                  <SectionHeader label="" />
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {[1,2,3].map(i => <ProductCardSkeleton key={i} />)}
                  </div>
                </div>
              )}
              {(tab === 'all' || tab === 'portfolio') && (
                <div>
                  <SectionHeader label="" />
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {[1,2,3].map(i => <PortfolioSkeleton key={i} />)}
                  </div>
                </div>
              )}
              {(tab === 'all' || tab === 'pages') && (
                <div>
                  <SectionHeader label="" />
                  <div className="space-y-2">{[1,2].map(i => <PageSkeletonItem key={i} />)}</div>
                </div>
              )}
            </div>
          )}

          {/* Results */}
          {ready && total > 0 && (
            <div className="space-y-10">

              {/* Products */}
              {(tab === 'all' || tab === 'products') && products.length > 0 && (
                <section>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Package size={18} className="text-primary" />
                      <h2 className="text-lg font-semibold">
                        <EditableContent contentKey="search-page-produkter" fallback="Produkter" /><span className="text-neutral-500 text-sm font-normal">({products.length})</span>
                      </h2>
                    </div>
                    {tab === 'all' && products.length > 3 && (
                      <button onClick={() => setTab('products')} className="text-sm text-primary flex items-center gap-1 hover:opacity-80">
                        <EditableContent contentKey="search-page-se-alle" fallback="Se alle" /><ArrowRight size={14} />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {(tab === 'all' ? products.slice(0, 3) : products).map(({ product }) => (
                      <ProductCard key={product.id} product={product} hideBooking />
                    ))}
                  </div>
                  {/* Snippet preview under products when highlight available */}
                  {tab === 'products' && products.some(r => r._snippet && r._snippet.includes('<mark>')) && (
                    <div className="mt-6 space-y-3">
                      {products.map(({ product, _highlight, _snippet }) => {
                        if (!_snippet?.includes('<mark>')) return null;
                        return (
                          <div key={product.id} className="flex items-start gap-3 px-4 py-3 bg-neutral-800/40 rounded-xl border border-neutral-700/50 text-sm">
                            <Package size={14} className="text-primary mt-0.5 shrink-0" />
                            <div className="min-w-0">
                              <span className="font-medium text-white mr-2">
                                <Hi html={getHighlight(_highlight?.name, product.name, query)} />
                              </span>
                              <span className="text-neutral-400">
                                — <Hi html={_snippet} />
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              )}

              {/* Portfolio */}
              {(tab === 'all' || tab === 'portfolio') && portfolio.length > 0 && (
                <section>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Image size={18} className="text-primary" />
                      <h2 className="text-lg font-semibold">
                        <EditableContent contentKey="search-page-portfolio" fallback="Portfolio" /><span className="text-neutral-500 text-sm font-normal">({portfolio.length})</span>
                      </h2>
                    </div>
                    {tab === 'all' && portfolio.length > 3 && (
                      <button onClick={() => setTab('portfolio')} className="text-sm text-primary flex items-center gap-1 hover:opacity-80">
                        <EditableContent contentKey="search-page-se-alle" fallback="Se alle" /> <ArrowRight size={14} />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {(tab === 'all' ? portfolio.slice(0, 3) : portfolio).map(({ item, _highlight }) => (
                      <Link key={item.id} to="/portfolio"
                        className="bg-neutral-800 rounded-xl overflow-hidden border border-neutral-700 hover:border-neutral-600 transition-all hover:-translate-y-0.5 group">
                        {renderMedia(item.image_url, item.title)}
                        <div className="p-3">
                          <h3 className="font-medium group-hover:text-primary transition-colors text-sm">
                            <Hi html={getHighlight(_highlight?.title, item.title, query)} />
                          </h3>
                          <div className="flex items-center justify-between mt-1.5 text-xs text-neutral-400">
                            <span>{item.likes} <EditableContent contentKey="search-page-likes" fallback="likes" /></span>
                            <ArrowRight size={14} className="group-hover:text-primary transition-colors" />
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </section>
              )}

              {/* Pages */}
              {(tab === 'all' || tab === 'pages') && pages.length > 0 && (
                <section>
                  <div className="flex items-center gap-2 mb-4">
                    <FileText size={18} className="text-primary" />
                    <h2 className="text-lg font-semibold">
                      <EditableContent contentKey="search-page-sider" fallback="Sider" /><span className="text-neutral-500 text-sm font-normal">({pages.length})</span>
                    </h2>
                  </div>
                  <div className="space-y-2">
                    {pages.map(page => (
                      <Link key={page.id} to={page.url}
                        className="flex items-center justify-between bg-neutral-800 rounded-xl p-4 border border-neutral-700 hover:border-neutral-600 transition-all group">
                        <div>
                          <h3 className="font-medium group-hover:text-primary transition-colors">
                            <Hi html={getHighlight(page._highlight?.title, page.title, query)} />
                          </h3>
                          <p className="text-neutral-400 text-sm mt-0.5">
                            <Hi html={getHighlight(page._highlight?.description, page.description, query)} />
                          </p>
                        </div>
                        <ArrowRight size={16} className="text-neutral-500 group-hover:text-primary shrink-0 ml-4 transition-colors" />
                      </Link>
                    ))}
                  </div>
                </section>
              )}

            </div>
          )}

        </div>
      </div>
    </div>
  );
};

export default SearchPage;