import React, { useEffect, useState, useMemo, useRef } from 'react';
import { ShoppingCart, ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { useData, ShopProduct } from '../contexts/DataContext';
import SEO from '../components/SEO';
import toast from 'react-hot-toast';
import EditableContent from '../components/EditableContent';
import {
  BottomCartSection,
  ScrollHintArrow,
  ColorCircle,
  stripHex,
  buildImagesForColor
} from '../components/MerchCart';

export const toSlug = (name: string) =>
  name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

// ─── Product Card ──────────────────────────────────────────────────────────────
const MerchProductCard: React.FC<{ product: ShopProduct; index: number }> = ({ product, index }) => {
  const { addToCart } = useData();
  const isReversed = index % 2 === 1;

  const hasSizes  = (product.sizes  || []).length > 0;
  const hasColors = (product.colors || []).length > 0;

  const [selectedColor, setSelectedColor] = useState<string>(hasColors ? (product.colors![0] ?? '') : '');
  const [selectedSize,  setSelectedSize]  = useState(hasSizes && product.sizes!.length === 1 ? product.sizes![0] : '');
  const [imgIndex,      setImgIndex]      = useState(0);
  const [awaitingConfirm, setAwaitingConfirm] = useState(false);

  const images = useMemo(
    () => buildImagesForColor(product, selectedColor ? stripHex(selectedColor) : ''),
    [product.id, selectedColor],
  );
  const safeIndex = images.length > 0 ? Math.min(imgIndex, images.length - 1) : 0;

  const navImg = (delta: number) => {
    if (images.length === 0) return;
    setImgIndex(prev => (prev + delta + images.length) % images.length);
  };

  const handleAddToCart = () => {
    if ((!hasSizes || selectedSize) && (!hasColors || selectedColor)) {
      addToCart(product, selectedSize || undefined, selectedColor ? stripHex(selectedColor) : undefined);
      toast.success(`${product.name} tilføjet til kurven`);
    } else {
      setAwaitingConfirm(true);
    }
  };

  const handleConfirmAdd = () => {
    if (hasSizes  && !selectedSize)  { toast.error('Vælg en størrelse'); return; }
    if (hasColors && !selectedColor) { toast.error('Vælg en farve');     return; }
    addToCart(product, selectedSize || undefined, selectedColor ? stripHex(selectedColor) : undefined);
    toast.success(`${product.name} tilføjet til kurven`);
    setAwaitingConfirm(false);
  };

  const pillStyle = (active: boolean) => ({
    background:  active ? 'var(--primary)' : 'var(--neutral-700)',
    borderColor: active ? 'var(--primary)' : 'var(--neutral-600)',
    color:       active ? 'white' : 'var(--neutral-300)',
    cursor: 'pointer', transition: 'all 0.15s',
  });

  const missingSize  = awaitingConfirm && hasSizes  && !selectedSize;
  const missingColor = awaitingConfirm && hasColors && !selectedColor;

  return (
    <section id={`product-${toSlug(product.name)}`} className="border-0 outline-none py-10 md:py-16">
      <div className="container">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 items-center">

          <div className={`flex flex-col text-center md:text-left ${isReversed ? 'md:order-2' : 'md:order-1'}`}>
            <h2 className="text-3xl font-bold mb-1 text-white">{product.name}</h2>
            <p className="text-2xl font-bold mb-3" style={{ color: 'var(--primary)' }}>
              {product.price} <EditableContent contentKey="merchandise-page-kr-7" fallback="kr." />
            </p>
            <p className="text-neutral-400 text-sm leading-relaxed mb-4">{product.description}</p>

            {hasSizes && (
              <div className="mb-2">
                <p className="text-xs font-semibold tracking-wider text-neutral-500 mb-1.5 text-center md:text-left">
                  <EditableContent contentKey="merchandise-page-vaelg-stoerrelse" fallback="VÆLG STØRRELSE" /> {missingSize && <span className="ml-2 text-amber-400"><EditableContent contentKey="merchandise-page-vaelg-venligst-2" fallback="← vælg venligst" /></span>}
                </p>
                <div className="flex flex-wrap gap-1.5 justify-center md:justify-start">
                  {product.sizes!.map(s => (
                    <button key={s} onClick={() => setSelectedSize(prev => prev === s ? '' : s)}
                      className="px-3 py-1.5 rounded-md text-xs font-medium border"
                      style={{ ...pillStyle(selectedSize === s), ...(missingSize ? { borderColor: 'rgba(251,191,36,0.5)' } : {}) }}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {hasColors && (
              <div className="mb-4">
                <p className="text-xs font-semibold tracking-wider text-neutral-500 mb-1.5 text-center md:text-left">
                  <EditableContent contentKey="merchandise-page-vaelg-farve" fallback="VÆLG FARVE" /> {missingColor && <span className="ml-2 text-amber-400"><EditableContent contentKey="merchandise-page-vaelg-venligst" fallback="← vælg venligst" /></span>}
                </p>
                <div className="flex flex-wrap gap-2 justify-center md:justify-start items-center">
                  {product.colors!.map(c => (
                    <ColorCircle key={c} color={c} active={selectedColor === c}
                      onClick={() => { setSelectedColor(prev => prev === c ? '' : c); setImgIndex(0); }} />
                  ))}
                  {selectedColor && <span className="text-xs text-neutral-400">{stripHex(selectedColor)}</span>}
                </div>
              </div>
            )}

            {!awaitingConfirm ? (
              <div className="flex flex-wrap justify-center md:justify-start gap-3">
                <button onClick={handleAddToCart} className="btn-primary flex items-center gap-2 px-6 py-3">
                  <ShoppingCart size={18} />
                  <EditableContent contentKey="merchandise-page-laeg-i-kurven" fallback="Læg i kurven" />
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap justify-center md:justify-start gap-3">
                <button onClick={handleConfirmAdd} className="btn-primary flex items-center gap-2 px-6 py-3">
                  <Check size={16} /> <EditableContent contentKey="merchandise-page-bekraeft-valg" fallback="Bekræft valg" />
                </button>
                <button onClick={() => setAwaitingConfirm(false)}
                  className="px-6 py-3 rounded-xl text-sm bg-neutral-700 text-neutral-400 hover:bg-neutral-600 transition-colors">
                  <EditableContent contentKey="merchandise-page-annuller" fallback="Annuller" />
                </button>
              </div>
            )}
          </div>

          <div className={`order-first md:order-none ${isReversed ? 'md:order-1' : 'md:order-2'}`}>
            {images.length > 0 && (
              <div className="relative max-w-sm mx-auto md:max-w-none" style={{ touchAction: 'pan-y' }}
                onTouchStart={e => { (e.currentTarget as any)._sx = e.touches[0].clientX; }}
                onTouchEnd={e => {
                  const sx = (e.currentTarget as any)._sx;
                  if (sx == null) return;
                  const dx = e.changedTouches[0].clientX - sx;
                  if (Math.abs(dx) > 40) navImg(dx < 0 ? 1 : -1);
                  (e.currentTarget as any)._sx = undefined;
                }}>
                <img src={images[safeIndex]} alt={`${product.name} – billede ${safeIndex + 1}`}
                  className="rounded-xl w-full object-contain" style={{ maxHeight: '500px', background: 'transparent' }} />
                {images.length > 1 && (
                  <>
                    <button onClick={() => navImg(-1)} className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center bg-black/60">
                      <ChevronLeft size={16} className="text-white" />
                    </button>
                    <button onClick={() => navImg(1)} className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center bg-black/60">
                      <ChevronRight size={16} className="text-white" />
                    </button>
                    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
                      {images.map((_, i) => (
                        <button key={i} onClick={() => setImgIndex(i)} className="w-2 h-2 rounded-full transition-all"
                          style={{ background: i === safeIndex ? 'white' : 'rgba(255,255,255,0.4)' }} />
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

        </div>
      </div>
    </section>
  );
};

// ─── Skeleton ──────────────────────────────────────────────────────────────────
const MerchSkeleton: React.FC<{ index: number }> = ({ index }) => {
  const isReversed = index % 2 === 1;
  return (
    <section className="py-10 md:py-16">
      <div className="container">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 items-center">
          <div className={`flex flex-col gap-3 ${isReversed ? 'md:order-2' : 'md:order-1'}`}>
            <div className="h-8 w-40 rounded-lg animate-pulse bg-neutral-700" />
            <div className="h-6 w-24 rounded animate-pulse bg-neutral-700" />
            <div className="h-4 w-full rounded animate-pulse bg-neutral-700" />
            <div className="flex gap-2">{[1,2,3,4].map(i => <div key={i} className="h-8 w-12 rounded-md animate-pulse bg-neutral-700" />)}</div>
            <div className="flex gap-2">{[1,2,3].map(i => <div key={i} className="w-8 h-8 rounded-full animate-pulse bg-neutral-700" />)}</div>
            <div className="h-11 w-40 rounded-xl animate-pulse bg-neutral-700" />
          </div>
          <div className={`order-first md:order-none ${isReversed ? 'md:order-1' : 'md:order-2'}`}>
            <div className="rounded-xl animate-pulse bg-neutral-700" style={{ height: '380px' }} />
          </div>
        </div>
      </div>
    </section>
  );
};

// ─── Main page ─────────────────────────────────────────────────────────────────
const MerchandisePage: React.FC = () => {
  const { shopProducts, isShopProductsLoaded, refreshShopProducts } = useData();
  const cartSectionRef = useRef<HTMLElement>(null);

  const [checkoutOpen, setCheckoutOpen] = useState(false);

  useEffect(() => { refreshShopProducts(); }, []);

  // ── Stable shuffle ─────────────────────────────────────────────────────────
  const stableOrderRef = useRef<string[]>([]);
  const activeProducts = useMemo(() => {
    if (!isShopProductsLoaded) return [];
    const fresh = shopProducts.filter(p => p.active);
    const freshIds = new Set(fresh.map(p => p.id));
    stableOrderRef.current = stableOrderRef.current.filter(id => freshIds.has(id));
    const added = fresh.filter(p => !stableOrderRef.current.includes(p.id));
    for (let i = added.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [added[i], added[j]] = [added[j], added[i]];
    }
    stableOrderRef.current = [...stableOrderRef.current, ...added.map(p => p.id)];
    const byId = Object.fromEntries(fresh.map(p => [p.id, p]));
    return stableOrderRef.current.map(id => byId[id]).filter(Boolean);
  }, [isShopProductsLoaded, shopProducts]);

  // ── Checkout entry: open checkout modal when landing on /merch/checkout ──────
  const entryPath = useRef(location.pathname).current;
  const didEntryRef = useRef(false);
  useEffect(() => {
    if (!isShopProductsLoaded || didEntryRef.current) return;
    didEntryRef.current = true;
    if (entryPath === '/merch/checkout') {
      setCheckoutOpen(true);
    }
  }, [isShopProductsLoaded]);

  return (
    <div className="bg-neutral-900 min-h-screen">
      <SEO canonical="/merch" title="Merchandise" description="Flai merchandise – køb Flai-mærkede produkter leveret personligt." />
      <div className="pt-10 md:pt-14" />

      {!isShopProductsLoaded ? (
        <>{[0, 1].map(i => <MerchSkeleton key={i} index={i} />)}</>
      ) : activeProducts.length === 0 ? (
        <div className="container py-20 text-center text-neutral-500">
          <ShoppingCart size={40} className="mx-auto mb-3 opacity-40" />
          <p><EditableContent contentKey="merchandise-page-ingen-produkter-tilgaengelige-endnu" fallback="Ingen produkter tilgængelige endnu." /></p>
        </div>
      ) : (
        activeProducts.map((product, index) => (
          <MerchProductCard key={product.id} product={product} index={index} />
        ))
      )}

      <BottomCartSection
        sectionRef={cartSectionRef}
        checkoutOpen={checkoutOpen}
        onCheckoutChange={setCheckoutOpen}
      />
      <ScrollHintArrow cartSectionRef={cartSectionRef} />
    </div>
  );
};

export default MerchandisePage;
