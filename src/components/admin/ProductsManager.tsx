import React, { useState, useMemo, useRef } from 'react';
import { Plus, Edit, Trash2, Save, X, Package, Camera, Video, ArrowUpDown, GripVertical } from 'lucide-react';
import { useProducts } from '../../hooks/useProducts';
import { Product } from '../../types';
import ImageUpload from '../ImageUpload';
import EditableContent from '../EditableContent';
import PanoramaViewer from '../PanoramaViewer';
import toast from 'react-hot-toast';

// ─── Normalise whatever Supabase returns for a text[] column ──────────────────
function toStringArray(val: unknown): string[] {
  if (!val) return [];
  if (Array.isArray(val)) {
    return val.flatMap(v => (typeof v === 'string' && v.trim() ? [v.trim()] : []));
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      const inner = trimmed.slice(1, -1).trim();
      if (!inner) return [];
      const results: string[] = [];
      let current = '';
      let inQuote = false;
      for (let i = 0; i < inner.length; i++) {
        const ch = inner[i];
        if (ch === '"' && inner[i - 1] !== '\\') { inQuote = !inQuote; }
        else if (ch === ',' && !inQuote) {
          const item = current.replace(/^"|"$/g, '').replace(/\\"/g, '"').trim();
          if (item) results.push(item);
          current = '';
        } else { current += ch; }
      }
      const last = current.replace(/^"|"$/g, '').replace(/\\"/g, '"').trim();
      if (last) results.push(last);
      return results.filter(s => s.length > 0);
    }
    return [trimmed];
  }
  return [];
}

// ─── URL type helpers ─────────────────────────────────────────────────────────
function isPanorama(url: string): boolean {
  return url.startsWith('panorama:');
}

function isYoutube(url: string): boolean {
  return url.startsWith('youtube:');
}

function youtubeId(url: string): string {
  return url.replace('youtube:', '');
}

function panoramaRawUrl(url: string): string {
  return url.replace('panorama:', '');
}

// ─── Panorama globe SVG icon (reused across the file) ────────────────────────
const PanoramaIcon: React.FC<{ className?: string }> = ({ className = 'w-8 h-8' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <circle cx="12" cy="12" r="10" />
    <ellipse cx="12" cy="12" rx="5" ry="10" />
    <path d="M2 12h20" />
  </svg>
);

// ─── Media tile — panorama, image, or YouTube embed ──────────────────────────
interface MediaTileProps {
  url:         string;
  label?:      string;
  index:       number;
  name:        string;
  /** When true, panoramas render as the full interactive Pannellum viewer */
  interactive?: boolean;
}

const MediaTile: React.FC<MediaTileProps> = ({ url, label, index, name, interactive = false }) => {

  // ── 360° Panorama ──────────────────────────────────────────────────────────
  if (isPanorama(url)) {
    const rawUrl = panoramaRawUrl(url);

    if (interactive) {
      return (
        <div className="relative w-full">
          {label && (
            <span className="absolute top-1 left-1 z-10 bg-primary text-white text-[10px] font-bold px-1.5 py-0.5 rounded pointer-events-none">
              {label}
            </span>
          )}
          <PanoramaViewer
            url={rawUrl}
            title={name}
            autoRotate={0.5}
            className="w-full"
          />
        </div>
      );
    }

    // Static thumbnail for grid cards — lightweight, no Pannellum overhead
    return (
      <div className="relative aspect-video bg-neutral-900 flex flex-col items-center justify-center gap-2 rounded overflow-hidden group/pano">
        <img
          src={rawUrl}
          alt={name}
          className="absolute inset-0 w-full h-full object-cover opacity-60"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
        {label && (
          <span className="absolute top-1 left-1 z-10 bg-primary text-white text-[10px] font-bold px-1.5 py-0.5 rounded pointer-events-none">
            {label}
          </span>
        )}
        <div className="relative z-10 flex flex-col items-center gap-1 pointer-events-none">
          <PanoramaIcon className="w-10 h-10 text-primary drop-shadow" />
          <span className="text-xs text-white font-bold tracking-wider bg-black/50 rounded-full px-2 py-0.5">360°</span>
        </div>
      </div>
    );
  }

  // ── YouTube ────────────────────────────────────────────────────────────────
  if (isYoutube(url)) {
    const id = youtubeId(url);
    return (
      <div className="relative aspect-video bg-neutral-800 rounded overflow-hidden">
        {label && (
          <span className="absolute top-1 left-1 z-10 bg-primary text-white text-[10px] font-bold px-1 py-0.5 rounded pointer-events-none">
            {label}
          </span>
        )}
        <iframe
          src={`https://www.youtube.com/embed/${id}`}
          title={`${name} video ${index + 1}`}
          className="w-full h-full"
          frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          loading="lazy"
        />
      </div>
    );
  }

  // ── Regular image ──────────────────────────────────────────────────────────
  return (
    <div className="relative aspect-video bg-neutral-800 rounded overflow-hidden">
      {label && (
        <span className="absolute top-1 left-1 z-10 bg-primary text-white text-[10px] font-bold px-1 py-0.5 rounded pointer-events-none">
          {label}
        </span>
      )}
      <img
        src={url}
        alt={`${name} ${index + 1}`}
        className="w-full h-full object-cover"
        loading="lazy"
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = 'none';
          console.warn('[ProductsManager] broken image src:', url);
        }}
      />
    </div>
  );
};

// ─── Reorderable image/panorama/video grid ────────────────────────────────────
interface ReorderableImagesProps {
  images:   unknown;
  onChange: (images: string[]) => void;
  onRemove: (index: number) => void;
}

const ReorderableImages: React.FC<ReorderableImagesProps> = ({ images, onChange, onRemove }) => {
  const safe = toStringArray(images);
  const dragIndex = useRef<number | null>(null);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const [overIdx,     setOverIdx]     = useState<number | null>(null);

  const handleDragStart = (idx: number) => { dragIndex.current = idx; setDraggingIdx(idx); };
  const handleDragEnter = (idx: number) => {
    if (dragIndex.current === null || dragIndex.current === idx) return;
    setOverIdx(idx);
  };
  const handleDragEnd = () => {
    if (dragIndex.current !== null && overIdx !== null && dragIndex.current !== overIdx) {
      const next = [...safe];
      const [moved] = next.splice(dragIndex.current, 1);
      next.splice(overIdx, 0, moved);
      onChange(next);
    }
    dragIndex.current = null; setDraggingIdx(null); setOverIdx(null);
  };

  if (safe.length === 0) return null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
      {safe.map((url, index) => (
        <div
          key={`${index}-${url.slice(-20)}`}
          draggable
          onDragStart={() => handleDragStart(index)}
          onDragEnter={() => handleDragEnter(index)}
          onDragOver={(e) => e.preventDefault()}
          onDragEnd={handleDragEnd}
          className="relative group cursor-grab active:cursor-grabbing select-none"
          style={{
            opacity:      draggingIdx === index ? 0.4 : 1,
            transform:    overIdx === index && draggingIdx !== index ? 'scale(1.03)' : 'scale(1)',
            transition:   'transform 0.15s ease, opacity 0.15s ease',
            outline:      overIdx === index && draggingIdx !== index ? '2px solid #f97316' : 'none',
            borderRadius: '0.5rem',
          }}
        >
          {index === 0 && (
            <span className="absolute top-1 left-1 z-10 bg-primary text-white text-[10px] font-bold px-1.5 py-0.5 rounded pointer-events-none">
              <EditableContent contentKey="products-manager-cover" fallback="Cover" />
            </span>
          )}
          <div className="absolute inset-0 z-10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            <div className="bg-black/50 rounded-full p-1"><GripVertical size={16} className="text-white" /></div>
          </div>

          {/* Thumbnail rendering per media type */}
          {isPanorama(url) ? (
            <div className="w-full h-24 rounded-lg overflow-hidden bg-neutral-900 flex flex-col items-center justify-center gap-1 relative pointer-events-none">
              <img
                src={panoramaRawUrl(url)}
                alt=""
                className="absolute inset-0 w-full h-full object-cover opacity-50"
                draggable={false}
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
              <div className="relative z-10 flex flex-col items-center gap-0.5">
                <PanoramaIcon className="w-6 h-6 text-primary drop-shadow" />
                <span className="text-[9px] text-white font-bold bg-black/50 rounded-full px-1.5 py-0.5 tracking-wider">360°</span>
              </div>
            </div>
          ) : isYoutube(url) ? (
            <div className="w-full h-24 rounded-lg overflow-hidden bg-neutral-800 pointer-events-none">
              <iframe
                src={`https://www.youtube.com/embed/${youtubeId(url)}`}
                title={`YouTube ${index + 1}`}
                className="w-full h-full"
                frameBorder="0"
                tabIndex={-1}
              />
            </div>
          ) : (
            <img
              src={url}
              alt={`Billede ${index + 1}`}
              className="w-full h-24 object-cover rounded-lg pointer-events-none bg-neutral-700"
              draggable={false}
              onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0.2'; }}
            />
          )}

          <span className="absolute bottom-1 left-1 bg-black/60 text-white text-[10px] px-1 rounded pointer-events-none">
            {index + 1}
          </span>
          <button
            onClick={() => onRemove(index)}
            className="absolute top-1 right-1 p-1 bg-error text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-20"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────
const ProductsManager: React.FC = () => {
  const { products, addProduct, updateProduct, deleteProduct } = useProducts();
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [showAddForm,    setShowAddForm]    = useState(false);
  const [sliderValues,   setSliderValues]   = useState<Record<number, number>>({});

  const arrayBounds = useMemo(() => {
    if (products.length === 0) return { min: 0, max: 100 };
    const arrays = products.map(p => p.array || 0);
    return { min: Math.min(...arrays), max: Math.max(...arrays) };
  }, [products]);

  // Stable display order for the manager grid: shuffled once when the set of
  // product IDs changes (add / delete), but never re-sorted while editing fields
  // or dragging sliders, so cards don't jump around mid-edit.
  const stableProducts = useMemo(() => {
    const shuffled = [...products];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products.map(p => p.id).join(',')]);

  const emptyNew = () => ({
    name: '', description: '', price: 0,
    category: 'photo' as 'photo' | 'video',
    images: [] as string[],
    links: [] as { title: string; url: string }[],
    is_editing_included: false,
    array: arrayBounds.max,
  });

  const [newProduct, setNewProduct] = useState(emptyNew);

  React.useEffect(() => {
    setNewProduct(prev => ({ ...prev, array: arrayBounds.max }));
  }, [arrayBounds.max]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleAddProduct = async () => {
    if (!newProduct.name.trim() || !newProduct.description.trim() || newProduct.price <= 0) {
      toast.error('Udfyld alle påkrævede felter'); return;
    }
    if (newProduct.images.length === 0) { toast.error('Tilføj mindst ét billede'); return; }
    try {
      await addProduct(newProduct);
      setNewProduct(emptyNew());
      setShowAddForm(false);
      toast.success('Produkt tilføjet');
    } catch (error) { console.error('Error adding product:', error); }
  };

  const handleUpdateProduct = async () => {
    if (!editingProduct) return;
    if (!editingProduct.name.trim() || !editingProduct.description.trim() || editingProduct.price <= 0) {
      toast.error('Udfyld alle påkrævede felter'); return;
    }
    try {
      await updateProduct(editingProduct.id, {
        name:                editingProduct.name,
        description:         editingProduct.description,
        price:               editingProduct.price,
        category:            editingProduct.category,
        images:              toStringArray(editingProduct.images),
        links:               editingProduct.links,
        is_editing_included: editingProduct.is_editing_included,
      });
      setEditingProduct(null);
      toast.success('Produkt opdateret');
    } catch (error) { console.error('Error updating product:', error); }
  };

  const handleDeleteProduct = async (id: number) => {
    if (!confirm('Er du sikker på at du vil slette dette produkt?')) return;
    try { await deleteProduct(id); toast.success('Produkt slettet'); }
    catch (error) { console.error('Error deleting product:', error); }
  };

  const handleArrayChange = async (productId: number, newArray: number) => {
    try { await updateProduct(productId, { array: newArray }); toast.success('Rækkefølge opdateret'); }
    catch { toast.error('Kunne ikke opdatere rækkefølge'); }
  };

  const handleSliderChange  = (productId: number, value: number) =>
    setSliderValues(prev => ({ ...prev, [productId]: value }));

  const handleSliderRelease = async (productId: number, value: number) => {
    await handleArrayChange(productId, value);
    setSliderValues(prev => { const n = { ...prev }; delete n[productId]; return n; });
  };

  const handleImageUpload = (url: string, isForEdit = false) => {
    if (isForEdit && editingProduct) {
      setEditingProduct({ ...editingProduct, images: [...toStringArray(editingProduct.images), url] });
    } else {
      setNewProduct(p => ({ ...p, images: [...p.images, url] }));
    }
  };

  const removeImage = (index: number, isForEdit = false) => {
    if (isForEdit && editingProduct) {
      setEditingProduct({ ...editingProduct, images: toStringArray(editingProduct.images).filter((_, i) => i !== index) });
    } else {
      setNewProduct(p => ({ ...p, images: p.images.filter((_, i) => i !== index) }));
    }
  };

  const reorderNewImages  = (imgs: string[]) => setNewProduct(p => ({ ...p, images: imgs }));
  const reorderEditImages = (imgs: string[]) => setEditingProduct(p => p ? { ...p, images: imgs } : p);

  const addLink = (isForEdit = false) => {
    const newLink = { title: '', url: '' };
    if (isForEdit && editingProduct) {
      if (editingProduct.links.length >= 4) { toast.error('Maksimalt 4 links per produkt'); return; }
      setEditingProduct({ ...editingProduct, links: [...editingProduct.links, newLink] });
    } else {
      if (newProduct.links.length >= 4) { toast.error('Maksimalt 4 links per produkt'); return; }
      setNewProduct(p => ({ ...p, links: [...p.links, newLink] }));
    }
  };

  const updateLink = (index: number, field: 'title' | 'url', value: string, isForEdit = false) => {
    if (isForEdit && editingProduct) {
      const updated = [...editingProduct.links];
      updated[index] = { ...updated[index], [field]: value };
      setEditingProduct({ ...editingProduct, links: updated });
    } else {
      setNewProduct(p => {
        const updated = [...p.links];
        updated[index] = { ...updated[index], [field]: value };
        return { ...p, links: updated };
      });
    }
  };

  const removeLink = (index: number, isForEdit = false) => {
    if (isForEdit && editingProduct) {
      setEditingProduct({ ...editingProduct, links: editingProduct.links.filter((_, i) => i !== index) });
    } else {
      setNewProduct(p => ({ ...p, links: p.links.filter((_, i) => i !== index) }));
    }
  };

  const sliderBg = (value: number) => {
    const pct = arrayBounds.max > 0 ? (value / arrayBounds.max) * 100 : 0;
    return `linear-gradient(to right, #f97316 0%, #f97316 ${pct}%, #404040 ${pct}%, #404040 100%)`;
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <EditableContent contentKey="admin-products-title" as="h2" className="text-2xl font-bold" fallback="Produkt Administration" />
        <button onClick={() => setShowAddForm(true)} className="btn-primary flex items-center">
          <Plus size={20} className="mr-2" />
          <EditableContent contentKey="admin-products-add-button" fallback="Tilføj Produkt" />
        </button>
      </div>

      {/* ── Add Form ──────────────────────────────────────────────────────────── */}
      {showAddForm && (
        <div className="bg-neutral-700/20 rounded-lg p-6">
          <EditableContent contentKey="admin-products-add-form-title" as="h3" className="text-xl font-semibold mb-4" fallback="Tilføj Nyt Produkt" />
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <EditableContent contentKey="admin-products-name-label" as="label" className="form-label" fallback="Produktnavn" />
                <input type="text" value={newProduct.name} onChange={(e) => setNewProduct(p => ({ ...p, name: e.target.value }))} className="form-input" placeholder="Indtast produktnavn" />
              </div>
              <div>
                <EditableContent contentKey="admin-products-price-label" as="label" className="form-label" fallback="Pris (DKK)" />
                <input type="number" value={newProduct.price} onChange={(e) => setNewProduct(p => ({ ...p, price: parseInt(e.target.value) || 0 }))} className="form-input" placeholder="0" />
              </div>
            </div>

            <div>
              <EditableContent contentKey="admin-products-category-label" as="label" className="form-label" fallback="Kategori" />
              <select value={newProduct.category} onChange={(e) => setNewProduct(p => ({ ...p, category: e.target.value as 'photo' | 'video' }))} className="form-input">
                <option value="photo"><EditableContent contentKey="products-manager-foto-2" fallback="Foto" /></option>
                <option value="video"><EditableContent contentKey="products-manager-video-2" fallback="Video" /></option>
              </select>
            </div>

            <div className="flex items-center space-x-3">
              <input type="checkbox" id="editing-included" checked={newProduct.is_editing_included} onChange={(e) => setNewProduct(p => ({ ...p, is_editing_included: e.target.checked }))} className="form-checkbox" />
              <div>
                <EditableContent contentKey="admin-products-editing-included-label" as="label" htmlFor="editing-included" className="form-label cursor-pointer" fallback="Redigering inkluderet" />
                <EditableContent contentKey="admin-products-editing-included-description" as="p" className="text-sm text-neutral-400" fallback="Dette produkt inkluderer professionel redigering som standard" />
              </div>
            </div>

            <div>
              <EditableContent contentKey="admin-products-description-label" as="label" className="form-label" fallback="Beskrivelse" />
              <textarea value={newProduct.description} onChange={(e) => setNewProduct(p => ({ ...p, description: e.target.value }))} className="form-input resize-none" rows={4} placeholder="Indtast produktbeskrivelse" />
            </div>

            {/* Array order */}
            <div className="bg-neutral-800/30 rounded-lg p-4">
              <div className="flex items-center mb-3">
                <ArrowUpDown size={16} className="text-neutral-400 mr-2" />
                <EditableContent contentKey="admin-products-order-label" as="span" className="text-sm font-medium text-neutral-400" fallback="Rækkefølge" />
              </div>
              <input type="number" value={newProduct.array} onChange={(e) => setNewProduct(p => ({ ...p, array: parseInt(e.target.value) || 0 }))} className="form-input text-sm mb-3" />
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-neutral-400">
                  <span>0</span>
                  <span className="font-medium text-neutral-300"><EditableContent contentKey="products-manager-vaerdi" fallback="Værdi:" /> {newProduct.array}</span>
                  <span><EditableContent contentKey="products-manager-hoejest" fallback="Højest (" />{arrayBounds.max})</span>
                </div>
                <div className="relative">
                  <input type="range" min={0} max={arrayBounds.max} value={newProduct.array} onChange={(e) => setNewProduct(p => ({ ...p, array: parseInt(e.target.value) }))} className="w-full h-2 rounded-lg appearance-none cursor-pointer slider-thumb" style={{ background: sliderBg(newProduct.array) }} />
                  {arrayBounds.min > 0 && arrayBounds.max > 0 && (
                    <div className="absolute top-1/2 -translate-y-1/2 pointer-events-none" style={{ left: `calc(${(arrayBounds.min / arrayBounds.max) * 100}% - 4px)` }}>
                      <div className="w-2 h-2 bg-yellow-400 rounded-full border border-neutral-800" />
                    </div>
                  )}
                </div>
                {arrayBounds.min > 0 && <p className="text-xs text-yellow-400/70"><EditableContent contentKey="products-manager-gul-markoer-laveste-eksisterende-2" fallback="● Gul markør = laveste eksisterende (" />{arrayBounds.min})</p>}
              </div>
            </div>

            {/* Images — allow360 enables the 360° panorama upload toggle */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <EditableContent contentKey="admin-products-images-label" as="label" className="form-label" fallback="Billeder / 360°" />
                {newProduct.images.length > 1 && (
                  <span className="text-xs text-neutral-400 flex items-center gap-1">
                    <GripVertical size={12} /> <EditableContent contentKey="products-manager-traek-for-at-aendre-raekkefoelge-2" fallback="Træk for at ændre rækkefølge · første = cover" />
                  </span>
                )}
              </div>
              <ImageUpload
                onImageUploaded={(url) => handleImageUpload(url)}
                bucket="product-images"
                allow360
              />
              <ReorderableImages images={newProduct.images} onChange={reorderNewImages} onRemove={(i) => removeImage(i)} />
            </div>

            {/* Links */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <EditableContent contentKey="admin-products-links-label" as="label" className="form-label" fallback="Links (valgfrit)" />
                <button onClick={() => addLink()} className="text-sm text-primary hover:text-primary-dark" disabled={newProduct.links.length >= 4}>
                  <EditableContent contentKey="products-manager-tilfoej-link" fallback="+ Tilføj Link" />
                </button>
              </div>
              {newProduct.links.map((link, index) => (
                <div key={index} className="flex gap-2 mb-2">
                  <input type="text" value={link.title} onChange={(e) => updateLink(index, 'title', e.target.value)} placeholder="Link titel" className="form-input flex-1" />
                  <input type="url" value={link.url} onChange={(e) => updateLink(index, 'url', e.target.value)} placeholder="https://..." className="form-input flex-1" />
                  <button onClick={() => removeLink(index)} className="p-2 text-error hover:bg-error/10 rounded"><X size={16} /></button>
                </div>
              ))}
            </div>

            <div className="flex justify-end space-x-3">
              <button onClick={() => { setShowAddForm(false); setNewProduct(emptyNew()); }} className="btn-secondary">
                <EditableContent contentKey="admin-products-cancel-button" fallback="Annuller" />
              </button>
              <button onClick={handleAddProduct} className="btn-primary">
                <EditableContent contentKey="admin-products-save-button" fallback="Gem Produkt" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Products List ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {stableProducts.map((product) => {
          const productImages = toStringArray(product.images);
          const productLinks  = Array.isArray(product.links) ? product.links : [];

          return (
            <div key={product.id} className="bg-neutral-700/20 rounded-lg p-6">
              {editingProduct?.id === product.id ? (

                // ── Edit Form ──────────────────────────────────────────────────
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <EditableContent contentKey="admin-products-edit-name-label" as="label" className="form-label" fallback="Produktnavn" />
                      <input type="text" value={editingProduct.name} onChange={(e) => setEditingProduct({ ...editingProduct, name: e.target.value })} className="form-input" />
                    </div>
                    <div>
                      <EditableContent contentKey="admin-products-edit-price-label" as="label" className="form-label" fallback="Pris (DKK)" />
                      <input type="number" value={editingProduct.price} onChange={(e) => setEditingProduct({ ...editingProduct, price: parseInt(e.target.value) || 0 })} className="form-input" />
                    </div>
                  </div>

                  <div>
                    <EditableContent contentKey="admin-products-edit-category-label" as="label" className="form-label" fallback="Kategori" />
                    <select value={editingProduct.category} onChange={(e) => setEditingProduct({ ...editingProduct, category: e.target.value as 'photo' | 'video' })} className="form-input">
                      <option value="photo"><EditableContent contentKey="products-manager-foto" fallback="Foto" /></option>
                      <option value="video"><EditableContent contentKey="products-manager-video" fallback="Video" /></option>
                    </select>
                  </div>

                  <div className="flex items-center space-x-3">
                    <input type="checkbox" id="editing-included-edit" checked={editingProduct.is_editing_included} onChange={(e) => setEditingProduct({ ...editingProduct, is_editing_included: e.target.checked })} className="form-checkbox" />
                    <div>
                      <EditableContent contentKey="admin-products-edit-editing-included-label" as="label" htmlFor="editing-included-edit" className="form-label cursor-pointer" fallback="Redigering inkluderet" />
                      <EditableContent contentKey="admin-products-edit-editing-included-description" as="p" className="text-sm text-neutral-400" fallback="Dette produkt inkluderer professionel redigering som standard" />
                    </div>
                  </div>

                  <div>
                    <EditableContent contentKey="admin-products-edit-description-label" as="label" className="form-label" fallback="Beskrivelse" />
                    <textarea value={editingProduct.description} onChange={(e) => setEditingProduct({ ...editingProduct, description: e.target.value })} className="form-input resize-none" rows={4} />
                  </div>

                  {/* Images — allow360 enables the 360° panorama upload toggle */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <EditableContent contentKey="admin-products-edit-images-label" as="label" className="form-label" fallback="Billeder / 360°" />
                      {toStringArray(editingProduct.images).length > 1 && (
                        <span className="text-xs text-neutral-400 flex items-center gap-1">
                          <GripVertical size={12} /> <EditableContent contentKey="products-manager-traek-for-at-aendre-raekkefoelge" fallback="Træk for at ændre rækkefølge · første = cover" />
                        </span>
                      )}
                    </div>
                    <ImageUpload
                      onImageUploaded={(url) => handleImageUpload(url, true)}
                      bucket="product-images"
                      allow360
                    />
                    <ReorderableImages images={editingProduct.images} onChange={reorderEditImages} onRemove={(i) => removeImage(i, true)} />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <EditableContent contentKey="admin-products-edit-links-label" as="label" className="form-label" fallback="Links" />
                      <button onClick={() => addLink(true)} className="text-sm text-primary hover:text-primary-dark" disabled={editingProduct.links.length >= 4}>
                        <EditableContent contentKey="products-manager-tilfoej-link-2" fallback="+ Tilføj Link" />
                      </button>
                    </div>
                    {editingProduct.links.map((link, index) => (
                      <div key={index} className="flex gap-2 mb-2">
                        <input type="text" value={link.title} onChange={(e) => updateLink(index, 'title', e.target.value, true)} placeholder="Link titel" className="form-input flex-1" />
                        <input type="url" value={link.url} onChange={(e) => updateLink(index, 'url', e.target.value, true)} placeholder="https://..." className="form-input flex-1" />
                        <button onClick={() => removeLink(index, true)} className="p-2 text-error hover:bg-error/10 rounded"><X size={16} /></button>
                      </div>
                    ))}
                  </div>

                  <div className="flex justify-end space-x-3">
                    <button onClick={() => setEditingProduct(null)} className="btn-secondary flex items-center">
                      <X size={16} className="mr-2" />
                      <EditableContent contentKey="admin-products-edit-cancel-button" fallback="Annuller" />
                    </button>
                    <button onClick={handleUpdateProduct} className="btn-primary flex items-center">
                      <Save size={16} className="mr-2" />
                      <EditableContent contentKey="admin-products-edit-save-button" fallback="Gem" />
                    </button>
                  </div>
                </div>

              ) : (

                // ── Display Mode ───────────────────────────────────────────────
                <div>
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center space-x-3">
                      <div className={`p-2 rounded-lg ${product.category === 'video' ? 'bg-blue-500/10 text-blue-400' : 'bg-green-500/10 text-green-400'}`}>
                        {product.category === 'video' ? <Video size={20} /> : <Camera size={20} />}
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold">{product.name}</h3>
                        <p className="text-primary font-bold">{product.price} <EditableContent contentKey="products-manager-kr" fallback="kr" /></p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button onClick={() => setEditingProduct(product)} className="p-2 text-neutral-400 hover:text-white transition-colors"><Edit size={16} /></button>
                      <button onClick={() => handleDeleteProduct(product.id)} className="p-2 text-neutral-400 hover:text-error transition-colors"><Trash2 size={16} /></button>
                    </div>
                  </div>

                  <p className="text-neutral-300 mb-4">{product.description}</p>

                  {product.is_editing_included && (
                    <div className="flex items-center text-green-400 mb-4">
                      <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      <EditableContent contentKey="admin-products-editing-included-display" as="span" className="text-sm font-medium" fallback="Redigering inkluderet" />
                    </div>
                  )}

                  {/* Array order */}
                  <div className="bg-neutral-800/30 rounded-lg p-4 mb-4">
                    <div className="flex items-center mb-3">
                      <ArrowUpDown size={16} className="text-neutral-400 mr-2" />
                      <EditableContent contentKey="admin-products-order-label" as="span" className="text-sm font-medium text-neutral-400" fallback="Rækkefølge" />
                    </div>
                    <input type="number" value={product.array || 0} onChange={(e) => handleArrayChange(product.id, parseInt(e.target.value) || 0)} className="form-input text-sm mb-3" />
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs text-neutral-400">
                        <span>0</span>
                        <span className="font-medium text-neutral-300"><EditableContent contentKey="products-manager-vaerdi" fallback="Værdi:" /> {sliderValues[product.id] ?? product.array ?? 0}</span>
                        <span><EditableContent contentKey="products-manager-hoejest" fallback="Højest (" />{arrayBounds.max})</span>
                      </div>
                      <div className="relative">
                        <input
                          type="range" min={0} max={arrayBounds.max}
                          value={sliderValues[product.id] ?? product.array ?? 0}
                          onChange={(e) => handleSliderChange(product.id, parseInt(e.target.value))}
                          onMouseUp={(e) => handleSliderRelease(product.id, parseInt((e.target as HTMLInputElement).value))}
                          onTouchEnd={(e) => handleSliderRelease(product.id, parseInt((e.target as HTMLInputElement).value))}
                          className="w-full h-2 rounded-lg appearance-none cursor-pointer slider-thumb"
                          style={{ background: sliderBg(sliderValues[product.id] ?? product.array ?? 0) }}
                        />
                        {arrayBounds.min > 0 && arrayBounds.max > 0 && (
                          <div className="absolute top-1/2 -translate-y-1/2 pointer-events-none" style={{ left: `calc(${(arrayBounds.min / arrayBounds.max) * 100}% - 4px)` }}>
                            <div className="w-2 h-2 bg-yellow-400 rounded-full border border-neutral-800" />
                          </div>
                        )}
                      </div>
                      {arrayBounds.min > 0 && <p className="text-xs text-yellow-400/70"><EditableContent contentKey="products-manager-gul-markoer-laveste-eksisterende" fallback="● Gul markør = laveste eksisterende (" />{arrayBounds.min})</p>}
                    </div>
                  </div>

                  {/* Media previews — handles panorama, youtube, and regular images */}
                  {productImages.length > 0 && (
                    <div className="grid grid-cols-3 gap-2 mb-4">
                      {productImages.slice(0, 3).map((url, index) => (
                        <MediaTile
                          key={index}
                          url={url}
                          index={index}
                          name={product.name}
                          label={index === 0 ? 'Cover' : undefined}
                        />
                      ))}
                    </div>
                  )}

                  {productLinks.length > 0 && (
                    <div className="space-y-1">
                      <EditableContent contentKey="admin-products-links-display-label" as="p" className="text-sm font-medium text-neutral-400" fallback="Links:" />
                      {productLinks.map((link, index) => (
                        <a key={index} href={link.url} target="_blank" rel="noopener noreferrer" className="block text-sm text-primary hover:text-primary-dark">{link.title}</a>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {products.length === 0 && (
        <div className="text-center py-12 text-neutral-400">
          <Package size={48} className="mx-auto mb-4 opacity-50" />
          <EditableContent contentKey="admin-products-no-products" as="p" fallback="Ingen produkter fundet. Tilføj det første produkt for at komme i gang." />
        </div>
      )}

      <style jsx>{`
        .slider-thumb::-webkit-slider-thumb {
          appearance: none; width: 20px; height: 20px;
          border-radius: 50%; background: #f97316;
          cursor: pointer; box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        }
        .slider-thumb::-moz-range-thumb {
          width: 20px; height: 20px; border-radius: 50%;
          background: #f97316; cursor: pointer; border: none;
          box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        }
      `}</style>
    </div>
  );
};

export default ProductsManager;
