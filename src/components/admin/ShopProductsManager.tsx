import EditableContent from '../EditableContent';
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Plus, Edit2, Trash2, Save, X, ShoppingBag, Upload, Tag, GripVertical } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { useData, ShopProduct } from '../../contexts/DataContext';
import toast from 'react-hot-toast';

// ─── Danish color name → hex map ─────────────────────────────────────────────
const DANISH_COLOR_MAP: Record<string, string> = {
  // Neutrals
  sort: '#000000', hvid: '#ffffff', grå: '#808080', graa: '#808080',
  lysegrå: '#d3d3d3', lysegraa: '#d3d3d3', mørkegrå: '#404040', mørkegraa: '#404040',
  sølv: '#c0c0c0', soelv: '#c0c0c0', guld: '#ffd700', beige: '#f5f5dc',
  creme: '#fffdd0', nude: '#e3bc9a', offwhite: '#f8f8f0',
  // Blues
  blå: '#0000ff', blaa: '#0000ff', lyseblå: '#add8e6', lyseblaa: '#add8e6',
  marineblå: '#001f5b', marineblaa: '#001f5b',
  himmelblå: '#87ceeb', kongeblå: '#4169e1', navyblå: '#001f5b',
  petrolblå: '#005f73', denim: '#1560bd', indigo: '#4b0082',
  // Reds
  rød: '#ff0000', roed: '#ff0000', mørkerød: '#8b0000', moerkeroed: '#8b0000',
  bordeaux: '#800020', vinrød: '#722f37', korall: '#ff7f50', laks: '#fa8072',
  // Greens
  grøn: '#008000', groen: '#008000', lysegrøn: '#90ee90', mørkegrøn: '#006400',
  armygrøn: '#4b5320', mintgrøn: '#98ff98', skovgrøn: '#228b22',
  olivengrøn: '#808000', flaskegrøn: '#006a4e', khaki: '#c3b091',
  // Browns
  brun: '#8b4513', mørkebrun: '#3d1c02', lysebrun: '#c4a35a', kamel: '#c19a6b',
  cognac: '#9a463d', karamel: '#c68642', chokolade: '#3d1c02',
  // Yellows & Oranges
  gul: '#ffff00', orange: '#ff8c00', sennep: '#ffdb58', honning: '#ffa500', smørfarve: '#FFFF81', sand: '#C2B280',
  // Pinks & Purples
  pink: '#ffc0cb', lyserød: '#ffb6c1', gammelrosa: '#c08080',
  lilla: '#800080', lavendel: '#e6e6fa', lys_lilla: '#dda0dd',
  magenta: '#ff00ff', fuchsia: '#ff00ff', aubergine: '#3d0c02',
  // Special
  transparent: '#00000000', naturfarvet: '#f5f0e8',
};

const guessHex = (name: string): string | null => {
  const key = name.toLowerCase().trim()
    .replace(/\s+/g, '')
    .replace('æ', 'ae').replace('ø', 'oe').replace('å', 'aa');
  if (DANISH_COLOR_MAP[key]) return DANISH_COLOR_MAP[key];
  for (const [k, v] of Object.entries(DANISH_COLOR_MAP)) {
    if (key.startsWith(k) || k.startsWith(key)) return v;
  }
  try {
    const ctx = document.createElement('canvas').getContext('2d')!;
    ctx.fillStyle = name.toLowerCase();
    const resolved = ctx.fillStyle;
    if (/^#[0-9a-fA-F]{6}$/.test(resolved)) return resolved;
  } catch {}
  return null;
};

const stripHex = (s: string) => s.replace(/\s*\(#[0-9a-fA-F]{3,6}\)$/, '').trim();
const extractHex = (s: string): string | null => {
  const m = s.match(/\(#([0-9a-fA-F]{3,6})\)$/);
  return m ? `#${m[1]}` : null;
};
const isLight = (hex: string): boolean => {
  const c = hex.replace('#', '');
  if (c.length < 6) return false;
  return (parseInt(c.slice(0,2),16)*299 + parseInt(c.slice(2,4),16)*587 + parseInt(c.slice(4,6),16)*114)/1000 > 128;
};

const EMPTY_PRODUCT: Omit<ShopProduct, 'id'> = {
  name: '', description: '', price: 0, image_url: '', images: [],
  category: '', sizes: [], colors: [], stock: undefined, active: true,
};

// ─── Draggable image grid (pointer-events based, works everywhere) ────────────
interface DraggableImageGridProps {
  images: string[];
  onReorder: (newImages: string[]) => void;
  onRemove: (idx: number) => void;
  renderLabel?: (url: string) => string;
  onAddClick?: () => void;
  isUploading?: boolean;
  thumbnailSize?: number;
}

const DraggableImageGrid: React.FC<DraggableImageGridProps> = ({
  images,
  onReorder,
  onRemove,
  renderLabel,
  onAddClick,
  isUploading,
  thumbnailSize = 80,
}) => {
  const size = thumbnailSize;
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const pointerDown = useRef(false);
  const dragSrcIdx = useRef<number | null>(null);
  const ghostRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  const cleanup = () => {
    ghostRef.current?.remove();
    ghostRef.current = null;
    pointerDown.current = false;
    dragSrcIdx.current = null;
    setDragIdx(null);
    setHoverIdx(null);
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
  };

  const handlePointerDown = (e: React.PointerEvent, idx: number) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointerDown.current = true;
    dragSrcIdx.current = idx;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'grabbing';

    const src = itemRefs.current[idx];
    if (src) {
      const rect = src.getBoundingClientRect();
      const ghost = document.createElement('div');
      ghost.style.cssText = `
        position:fixed;width:${size}px;height:${size}px;
        border-radius:10px;overflow:hidden;pointer-events:none;
        z-index:9999;opacity:0.85;box-shadow:0 8px 24px rgba(0,0,0,0.5);
        transform:scale(1.08);transition:transform 0.1s;
        left:${rect.left}px;top:${rect.top}px;
      `;
      const img = src.querySelector('img');
      if (img) {
        const clone = img.cloneNode(true) as HTMLImageElement;
        clone.style.cssText = `width:100%;height:100%;object-fit:cover;display:block;`;
        ghost.appendChild(clone);
      }
      document.body.appendChild(ghost);
      ghostRef.current = ghost;
    }

    setDragIdx(idx);
  };

  const handlePointerMove = (e: React.PointerEvent, idx: number) => {
    if (!pointerDown.current || dragSrcIdx.current === null) return;
    e.preventDefault();

    if (ghostRef.current) {
      ghostRef.current.style.left = `${e.clientX - size / 2}px`;
      ghostRef.current.style.top = `${e.clientY - size / 2}px`;
    }

    let foundIdx: number | null = null;
    itemRefs.current.forEach((el, i) => {
      if (!el || i === dragSrcIdx.current) return;
      const rect = el.getBoundingClientRect();
      if (
        e.clientX >= rect.left && e.clientX <= rect.right &&
        e.clientY >= rect.top && e.clientY <= rect.bottom
      ) {
        foundIdx = i;
      }
    });
    setHoverIdx(foundIdx);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!pointerDown.current || dragSrcIdx.current === null) { cleanup(); return; }
    const from = dragSrcIdx.current;
    const to = hoverIdx;
    if (to !== null && from !== to) {
      const updated = [...images];
      const [moved] = updated.splice(from, 1);
      updated.splice(to, 0, moved);
      onReorder(updated);
    }
    cleanup();
  };

  return (
    <div ref={containerRef} className="flex flex-wrap gap-2">
      {images.map((entry, i) => {
        const displayUrl = renderLabel ? renderLabel(entry) : entry;
        const isDragging = dragIdx === i;
        const isOver = hoverIdx === i && dragIdx !== null;

        return (
          <div
            key={`${i}-${entry.slice(-20)}`}
            ref={el => { itemRefs.current[i] = el; }}
            className="relative select-none"
            style={{
              width: size, height: size,
              borderRadius: 10,
              opacity: isDragging ? 0.25 : 1,
              outline: isOver ? '2.5px solid var(--primary)' : '2.5px solid transparent',
              outlineOffset: 2,
              transition: 'opacity 0.12s, outline 0.08s',
              cursor: dragIdx !== null ? 'grabbing' : 'grab',
              touchAction: 'none',
            }}
            onPointerDown={e => handlePointerDown(e, i)}
            onPointerMove={e => handlePointerMove(e, i)}
            onPointerUp={handlePointerUp}
            onPointerCancel={cleanup}
          >
            <img
              src={displayUrl}
              alt={`Billede ${i + 1}`}
              style={{
                width: size, height: size,
                objectFit: 'cover',
                borderRadius: 10,
                display: 'block',
                pointerEvents: 'none',
                userSelect: 'none',
              }}
              draggable={false}
            />
            <div
              style={{
                position: 'absolute', inset: 0, borderRadius: 10,
                background: 'rgba(0,0,0,0.38)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                opacity: isDragging ? 0 : 0,
                transition: 'opacity 0.1s',
                pointerEvents: 'none',
              }}
            >
              <GripVertical size={20} color="white" />
            </div>
            <button
              onClick={e => { e.stopPropagation(); onRemove(i); }}
              onPointerDown={e => e.stopPropagation()}
              style={{
                position: 'absolute', top: -6, right: -6,
                width: 20, height: 20, borderRadius: '50%',
                background: 'var(--error)', color: 'white',
                border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                zIndex: 10,
              }}
            >
              <X size={9} />
            </button>
            <span style={{
              position: 'absolute', bottom: 4, left: 4,
              fontSize: 9, lineHeight: '14px',
              background: 'rgba(0,0,0,0.6)', color: 'white',
              borderRadius: 4, padding: '0 3px',
              pointerEvents: 'none',
            }}>
              {i + 1}
            </span>
          </div>
        );
      })}

      {onAddClick && (
        <div
          onClick={onAddClick}
          style={{
            width: size, height: size,
            background: 'var(--neutral-800)',
            border: '2px dashed var(--neutral-600)',
            borderRadius: 10,
            flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          {isUploading
            ? <div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid white', borderTopColor: 'transparent', animation: 'spin 0.7s linear infinite' }} />
            : <Plus size={18} style={{ color: 'var(--neutral-400)' }} />
          }
        </div>
      )}
    </div>
  );
};

// ─── Color tag input with drag-to-reorder ────────────────────────────────────
const ColorTagInput: React.FC<{
  value: string;
  onChange: (v: string) => void;
}> = ({ value, onChange }) => {
  const [inputVal, setInputVal] = useState('');
  const colors = value ? value.split(',').map(s => s.trim()).filter(Boolean) : [];

  // Drag state
  const dragSrc = useRef<number | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const addColor = (raw: string) => {
    const name = raw.trim();
    if (!name) return;
    if (/\(#[0-9a-fA-F]{3,6}\)$/.test(name)) {
      if (!colors.includes(name)) onChange([...colors, name].join(', '));
      setInputVal('');
      return;
    }
    const hex = guessHex(name);
    const entry = hex ? `${name} (${hex})` : name;
    if (!colors.includes(entry)) onChange([...colors, entry].join(', '));
    setInputVal('');
  };

  const removeColor = (idx: number) => {
    onChange(colors.filter((_, i) => i !== idx).join(', '));
  };

  const updateHex = (idx: number, hex: string) => {
    const updated = colors.map((c, i) => {
      if (i !== idx) return c;
      const base = stripHex(c);
      return hex ? `${base} (#${hex.replace('#', '')})` : base;
    });
    onChange(updated.join(', '));
  };

  const handleDragStart = (idx: number) => {
    dragSrc.current = idx;
    setDragIdx(idx);
  };

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    setDragOverIdx(idx);
  };

  const handleDrop = (toIdx: number) => {
    const fromIdx = dragSrc.current;
    if (fromIdx === null || fromIdx === toIdx) return;
    const updated = [...colors];
    const [moved] = updated.splice(fromIdx, 1);
    updated.splice(toIdx, 0, moved);
    onChange(updated.join(', '));
    dragSrc.current = null;
    setDragIdx(null);
    setDragOverIdx(null);
  };

  const handleDragEnd = () => {
    dragSrc.current = null;
    setDragIdx(null);
    setDragOverIdx(null);
  };

  return (
    <div>
      {colors.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {colors.map((c, i) => {
            const hex = extractHex(c);
            const label = stripHex(c);
            const light = hex ? isLight(hex) : false;
            const isDragging = dragIdx === i;
            const isOver = dragOverIdx === i && dragIdx !== null && dragIdx !== i;

            return (
              <div
                key={i}
                draggable
                onDragStart={() => handleDragStart(i)}
                onDragOver={e => handleDragOver(e, i)}
                onDrop={() => handleDrop(i)}
                onDragEnd={handleDragEnd}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium border select-none"
                style={{
                  background: hex ?? 'var(--neutral-600)',
                  borderColor: isOver ? 'white' : (hex ?? 'var(--neutral-500)'),
                  color: hex ? (light ? '#111' : '#fff') : 'var(--neutral-200)',
                  cursor: 'grab',
                  opacity: isDragging ? 0.4 : 1,
                  outline: isOver ? '2px dashed rgba(255,255,255,0.7)' : 'none',
                  outlineOffset: 2,
                  transform: isOver ? 'scale(1.08)' : 'scale(1)',
                  transition: 'opacity 0.1s, transform 0.1s, outline 0.1s',
                }}
                title="Træk for at ændre rækkefølge"
              >
                <GripVertical size={10} style={{ opacity: 0.6, flexShrink: 0 }} />
                {label}
                <label className="cursor-pointer ml-1 opacity-60 hover:opacity-100" title="Vælg farve">
                  <input type="color" value={hex ?? '#000000'}
                    onChange={e => updateHex(i, e.target.value)}
                    className="w-0 h-0 opacity-0 absolute" />
                  <span style={{ fontSize: 10 }}>🎨</span>
                </label>
                <button
                  onClick={() => removeColor(i)}
                  onMouseDown={e => e.stopPropagation()}
                  className="ml-1 opacity-60 hover:opacity-100"
                >
                  <X size={10} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {colors.length > 1 && (
        <p className="text-xs mb-2 flex items-center gap-1" style={{ color: 'var(--neutral-500)' }}>
          <GripVertical size={11} /> <EditableContent contentKey="shop-products-manager-traek-farverne-for-at-aendre" fallback="Træk farverne for at ændre rækkefølge" />
        </p>
      )}
      
    </div>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────
const ShopProductsManager: React.FC = () => {
  const { shopProducts, refreshShopProducts, isShopProductsLoaded } = useData();
  const [editingId, setEditingId] = useState<string | 'new' | null>(null);
  const [form, setForm] = useState<Omit<ShopProduct, 'id'>>(EMPTY_PRODUCT);
  const [sizesInput, setSizesInput] = useState('');
  const [colorsInput, setColorsInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadingMain, setUploadingMain] = useState(false);
  const [uploadingColor, setUploadingColor] = useState<string | null>(null);
  const mainImageRef = useRef<HTMLInputElement>(null);
  const colorImageRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => { if (!isShopProductsLoaded) refreshShopProducts(); }, []); // eslint-disable-line

  const startNew = () => {
    setForm(EMPTY_PRODUCT); setSizesInput(''); setColorsInput(''); setEditingId('new');
  };

  const startEdit = (p: ShopProduct) => {
    setForm({
      name: p.name, description: p.description, price: p.price,
      image_url: p.image_url, images: p.images || [], category: p.category || '',
      sizes: p.sizes || [], colors: p.colors || [], stock: p.stock, active: p.active,
    });
    setSizesInput((p.sizes || []).join(', '));
    setColorsInput((p.colors || []).join(', '));
    setEditingId(p.id);
  };

  const cancelEdit = () => setEditingId(null);

  const uploadToStorage = async (file: File): Promise<string | null> => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Du er ikke logget ind');
      const formData = new FormData();
      formData.append('file', file);
      formData.append('bucket', 'shop-images');
      const response = await fetch('https://pbqeljimuerxatrtmgsn.supabase.co/functions/v1/upload-image', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: formData,
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Upload fejlede med status ${response.status}`);
      }
      const data = await response.json();
      return data.url;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Billedupload fejlede');
      return null;
    }
  };

  const handleMainImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingMain(true);
    const url = await uploadToStorage(file);
    setUploadingMain(false);
    if (url) setForm(f => ({ ...f, image_url: url }));
    e.target.value = '';
  };

  const handleColorImageUpload = async (colorLabel: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setUploadingColor(colorLabel);
    for (const file of files) {
      const url = await uploadToStorage(file);
      if (url) setForm(f => ({ ...f, images: [...(f.images || []), `${colorLabel}::${url}`] }));
    }
    setUploadingColor(null);
    e.target.value = '';
  };

  const handleExtraImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      const url = await uploadToStorage(file);
      if (url) setForm(f => ({ ...f, images: [...(f.images || []), url] }));
    }
    e.target.value = '';
  };

  const reorderColorImages = (colorLabel: string, newColorImages: string[]) => {
    setForm(f => {
      const allImages = f.images || [];
      const others = allImages.filter(u => !u.startsWith(`${colorLabel}::`));
      const firstIdx = allImages.findIndex(u => u.startsWith(`${colorLabel}::`));
      if (firstIdx === -1) return { ...f, images: [...others, ...newColorImages] };
      const before = allImages.slice(0, firstIdx).filter(u => !u.startsWith(`${colorLabel}::`));
      const after = allImages.slice(firstIdx).filter(u => !u.startsWith(`${colorLabel}::`));
      return { ...f, images: [...before, ...newColorImages, ...after] };
    });
  };

  const reorderUntaggedImages = (newUntagged: string[]) => {
    setForm(f => {
      const tagged = (f.images || []).filter(u => u.includes('::'));
      return { ...f, images: [...tagged, ...newUntagged] };
    });
  };

  const removeColorImage = (colorLabel: string, idxWithinColor: number) => {
    setForm(f => {
      const colorImgs = (f.images || []).filter(u => u.startsWith(`${colorLabel}::`));
      const toRemove = colorImgs[idxWithinColor];
      return { ...f, images: (f.images || []).filter(u => u !== toRemove) };
    });
  };

  const removeUntaggedImage = (idxWithinUntagged: number) => {
    setForm(f => {
      const untagged = (f.images || []).filter(u => !u.includes('::'));
      const toRemove = untagged[idxWithinUntagged];
      return { ...f, images: (f.images || []).filter(u => u !== toRemove) };
    });
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Produktnavn er påkrævet'); return; }
    setSaving(true);
    const payload = {
      ...form,
      sizes: sizesInput.split(',').map(s => s.trim()).filter(Boolean),
      colors: colorsInput.split(',').map(s => s.trim()).filter(Boolean),
      price: Number(form.price),
    };
    if (editingId === 'new') {
      const { error } = await supabase.from('shop_products').insert(payload);
      if (error) { toast.error('Fejl ved oprettelse'); setSaving(false); return; }
      toast.success('Produkt oprettet!');
    } else {
      const { error } = await supabase.from('shop_products').update(payload).eq('id', editingId);
      if (error) { toast.error('Fejl ved opdatering'); setSaving(false); return; }
      toast.success('Produkt opdateret!');
    }
    setSaving(false);
    setEditingId(null);
    refreshShopProducts();
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Slet dette produkt?')) return;
    const { error } = await supabase.from('shop_products').delete().eq('id', id);
    if (error) { toast.error('Fejl ved sletning'); return; }
    toast.success('Produkt slettet');
    refreshShopProducts();
  };

  const toggleActive = async (p: ShopProduct) => {
    await supabase.from('shop_products').update({ active: !p.active }).eq('id', p.id);
    refreshShopProducts();
  };

  const parsedColors = colorsInput.split(',').map(s => s.trim()).filter(Boolean);
  const totalImages = 1 + (form.images || []).length;

  const inputCls = "w-full rounded-xl px-4 py-2.5 text-white text-sm outline-none";
  const inputStyle = { background: 'var(--neutral-800)', border: '1px solid var(--neutral-600)' };

  const getColorImages = (colorLabel: string) =>
    (form.images || []).filter(u => u.startsWith(`${colorLabel}::`));

  const getUntaggedImages = () =>
    (form.images || []).filter(u => !u.includes('::'));

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <ShoppingBag size={20} style={{ color: 'var(--primary)' }} />
          <EditableContent contentKey="shop-products-manager-shop-produkter" fallback="Shop Produkter" />
        </h2>
        <button onClick={startNew} className="btn-primary flex items-center gap-2 text-sm px-4 py-2">
          <Plus size={16} /> <EditableContent contentKey="shop-products-manager-nyt-produkt" fallback="Nyt produkt" />
        </button>
      </div>

      {/* ── Edit / Create form ───────────────────────────────────────────────── */}
      {editingId && (
        <div className="rounded-2xl p-6 mb-6" style={{ background: 'var(--neutral-700)', border: '1px solid var(--primary)' }}>
          <h3 className="font-semibold text-white mb-5">
            {editingId === 'new' ? 'Nyt produkt' : 'Rediger produkt'}
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Name */}
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--neutral-400)' }}><EditableContent contentKey="shop-products-manager-navn" fallback="Navn *" /></label>
              <input className={inputCls} style={inputStyle} value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Produktnavn" />
            </div>

            {/* Price */}
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--neutral-400)' }}><EditableContent contentKey="shop-products-manager-pris-kr" fallback="Pris (kr.)" /></label>
              <input type="number" className={inputCls} style={inputStyle} value={form.price}
                onChange={e => setForm(f => ({ ...f, price: Number(e.target.value) }))} placeholder="299" />
            </div>

            {/* Description */}
            <div className="sm:col-span-2">
              <label className="text-xs mb-1 block" style={{ color: 'var(--neutral-400)' }}><EditableContent contentKey="shop-products-manager-beskrivelse" fallback="Beskrivelse" /></label>
              <textarea className={`${inputCls} resize-none`} style={inputStyle} rows={3}
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Produktbeskrivelse..." />
            </div>

            {/* Category */}
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--neutral-400)' }}><EditableContent contentKey="shop-products-manager-kategori" fallback="Kategori" /></label>
              <input className={inputCls} style={inputStyle} value={form.category || ''}
                onChange={e => setForm(f => ({ ...f, category: e.target.value }))} placeholder="T-shirt, Hoodie..." />
            </div>

            {/* Stock */}
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--neutral-400)' }}><EditableContent contentKey="shop-products-manager-lagerantal" fallback="Lagerantal" /></label>
              <input type="number" className={inputCls} style={inputStyle} value={form.stock ?? ''}
                onChange={e => setForm(f => ({ ...f, stock: e.target.value ? Number(e.target.value) : undefined }))}
                placeholder="Ubegrænset" />
            </div>

            {/* Sizes */}
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--neutral-400)' }}><EditableContent contentKey="shop-products-manager-stoerrelser-kommasepareret" fallback="Størrelser (kommasepareret)" /></label>
              <input className={inputCls} style={inputStyle} value={sizesInput}
                onChange={e => setSizesInput(e.target.value)} placeholder="S, M, L, XL" />
            </div>

            {/* Colors */}
            <div className="sm:col-span-2">
              <label className="text-xs mb-2 block" style={{ color: 'var(--neutral-400)' }}><EditableContent contentKey="shop-products-manager-farver" fallback="Farver" /></label>
              <ColorTagInput value={colorsInput} onChange={setColorsInput} />
            </div>

            {/* Active toggle */}
            <div className="flex items-center gap-3">
              <label className="text-xs" style={{ color: 'var(--neutral-400)' }}><EditableContent contentKey="shop-products-manager-aktiv-synlig" fallback="Aktiv / synlig" /></label>
              <button onClick={() => setForm(f => ({ ...f, active: !f.active }))}
                className="w-10 h-6 rounded-full transition-colors relative"
                style={{ background: form.active ? 'var(--success)' : 'var(--neutral-600)' }}>
                <span className="absolute top-1 w-4 h-4 rounded-full bg-white transition-all"
                  style={{ left: form.active ? '22px' : '2px' }} />
              </button>
            </div>
          </div>

          {/* ── Images ────────────────────────────────────────────────────────── */}
          <div className="mt-6">
            <p className="text-xs font-semibold mb-3" style={{ color: 'var(--neutral-400)' }}>
              <EditableContent contentKey="shop-products-manager-billeder-2" fallback="BILLEDER (" />{totalImages})
            </p>

            {/* Main / default image */}
            <div className="mb-5">
              <p className="text-xs mb-2 font-medium" style={{ color: 'var(--neutral-400)' }}><EditableContent contentKey="shop-products-manager-standardbillede" fallback="Standardbillede" /></p>
              <div className="flex items-start gap-3">
                {form.image_url ? (
                  <div className="relative flex-shrink-0">
                    <img src={form.image_url} alt="Hoved" className="w-24 h-24 object-cover rounded-xl"
                      style={{ border: '2px solid var(--primary)' }} />
                    <button onClick={() => setForm(f => ({ ...f, image_url: '' }))}
                      className="absolute -top-2 -right-2 w-5 h-5 rounded-full flex items-center justify-center"
                      style={{ background: 'var(--error)', color: 'white' }}>
                      <X size={10} />
                    </button>
                  </div>
                ) : (
                  <div onClick={() => mainImageRef.current?.click()}
                    className="w-24 h-24 rounded-xl flex flex-col items-center justify-center cursor-pointer flex-shrink-0"
                    style={{ background: 'var(--neutral-800)', border: '2px dashed var(--neutral-600)' }}>
                    {uploadingMain
                      ? <div className="w-5 h-5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                      : <><Upload size={16} style={{ color: 'var(--neutral-400)' }} /><span className="text-xs mt-1" style={{ color: 'var(--neutral-500)' }}><EditableContent contentKey="shop-products-manager-upload" fallback="Upload" /></span></>
                    }
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <input className={inputCls} style={inputStyle} value={form.image_url}
                    onChange={e => setForm(f => ({ ...f, image_url: e.target.value }))}
                    placeholder="Eller indsæt URL..." />
                  <button onClick={() => mainImageRef.current?.click()}
                    className="flex items-center gap-1.5 mt-2 text-xs px-3 py-1.5 rounded-lg"
                    style={{ background: 'var(--neutral-600)', color: 'var(--neutral-300)' }}>
                    <Upload size={12} /> <EditableContent contentKey="shop-products-manager-upload-billede" fallback="Upload billede" />
                  </button>
                  <input ref={mainImageRef} type="file" accept="image/*" className="hidden" onChange={handleMainImageUpload} />
                </div>
              </div>
            </div>

            {/* Per-color image sections */}
            {parsedColors.length > 0 && (
              <div className="space-y-4 mb-4">
                {parsedColors.map(colorEntry => {
                  const label = stripHex(colorEntry);
                  const hex = extractHex(colorEntry);
                  const light = hex ? isLight(hex) : false;
                  const colorImgs = getColorImages(label);
                  const isUploading = uploadingColor === label;

                  return (
                    <div key={label} className="rounded-xl p-3" style={{ background: 'var(--neutral-800)', border: '1px solid var(--neutral-600)' }}>
                      <div className="flex items-center gap-2 mb-3">
                        {hex && (
                          <span className="w-4 h-4 rounded-full flex-shrink-0"
                            style={{ background: hex, border: '1px solid rgba(255,255,255,0.2)' }} />
                        )}
                        <p className="text-xs font-semibold"
                          style={{ color: hex ? (light ? hex : 'var(--neutral-200)') : 'var(--neutral-300)' }}>
                          {label} <EditableContent contentKey="shop-products-manager-billeder" fallback="— billeder" />
                        </p>
                        <span className="text-xs" style={{ color: 'var(--neutral-500)' }}>({colorImgs.length})</span>
                        {colorImgs.length > 1 && (
                          <span className="text-xs ml-auto flex items-center gap-1" style={{ color: 'var(--neutral-500)' }}>
                            <GripVertical size={11} /> <EditableContent contentKey="shop-products-manager-traek-for-at-aendre-raekkefoelge-2" fallback="Træk for at ændre rækkefølge" />
                          </span>
                        )}
                      </div>

                      <DraggableImageGrid
                        images={colorImgs}
                        onReorder={newTagged => reorderColorImages(label, newTagged)}
                        onRemove={idx => removeColorImage(label, idx)}
                        renderLabel={tagged => tagged.slice(label.length + 2)}
                        onAddClick={() => colorImageRefs.current[label]?.click()}
                        isUploading={isUploading}
                        thumbnailSize={64}
                      />

                      <input
                        type="file" accept="image/*" multiple className="hidden"
                        ref={el => { colorImageRefs.current[label] = el; }}
                        onChange={e => handleColorImageUpload(label, e)}
                      />
                    </div>
                  );
                })}
              </div>
            )}

            {/* Untagged / general extra images */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <p className="text-xs font-medium" style={{ color: 'var(--neutral-400)' }}>
                  <EditableContent contentKey="shop-products-manager-generelle-ekstra-billeder-ingen-specifik" fallback="Generelle ekstra billeder (ingen specifik farve)" />
                </p>
                {getUntaggedImages().length > 1 && (
                  <span className="text-xs flex items-center gap-1" style={{ color: 'var(--neutral-500)' }}>
                    <GripVertical size={11} /> <EditableContent contentKey="shop-products-manager-traek-for-at-aendre-raekkefoelge" fallback="Træk for at ændre rækkefølge" />
                  </span>
                )}
              </div>

              <DraggableImageGrid
                images={getUntaggedImages()}
                onReorder={reorderUntaggedImages}
                onRemove={removeUntaggedImage}
                onAddClick={() => {
                  const input = document.createElement('input');
                  input.type = 'file'; input.accept = 'image/*'; input.multiple = true;
                  input.onchange = (e) => handleExtraImageUpload(e as any);
                  input.click();
                }}
                thumbnailSize={80}
              />
            </div>
          </div>

          <div className="flex gap-3 mt-6">
            <button onClick={handleSave} disabled={saving}
              className="btn-primary flex items-center gap-2 text-sm px-5 py-2.5">
              <Save size={15} /> {saving ? 'Gemmer...' : 'Gem produkt'}
            </button>
            <button onClick={cancelEdit}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm"
              style={{ background: 'var(--neutral-600)', color: 'var(--neutral-300)' }}>
              <X size={15} /> <EditableContent contentKey="shop-products-manager-annuller" fallback="Annuller" />
            </button>
          </div>
        </div>
      )}

      {/* ── Product list ─────────────────────────────────────────────────────── */}
      {!isShopProductsLoaded ? (
        <div className="flex flex-col gap-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="rounded-xl h-16 animate-pulse" style={{ background: 'var(--neutral-700)' }} />
          ))}
        </div>
      ) : shopProducts.length === 0 ? (
        <div className="text-center py-16" style={{ color: 'var(--neutral-500)' }}>
          <ShoppingBag size={40} className="mx-auto mb-3 opacity-40" />
          <p><EditableContent contentKey="shop-products-manager-ingen-produkter-endnu-klik-nyt" fallback="Ingen produkter endnu. Klik &quot;Nyt produkt&quot; for at starte." /></p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {shopProducts.map(p => (
            <div key={p.id} className="flex items-center gap-4 rounded-xl p-4"
              style={{ background: 'var(--neutral-700)', border: '1px solid var(--neutral-600)', opacity: p.active ? 1 : 0.55 }}>
              <div className="rounded-xl overflow-hidden flex-shrink-0"
                style={{ width: 52, height: 52, background: 'var(--neutral-600)' }}>
                {p.image_url
                  ? <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center"><ShoppingBag size={20} style={{ color: 'var(--neutral-400)' }} /></div>
                }
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white">{p.name}</p>
                <div className="flex items-center gap-2 flex-wrap mt-1">
                  <span className="text-xs" style={{ color: 'var(--neutral-400)' }}>{p.price} <EditableContent contentKey="shop-products-manager-kr" fallback="kr." /></span>
                  {p.category && <span className="text-xs" style={{ color: 'var(--neutral-500)' }}>· {p.category}</span>}
                  {(p.sizes?.length || 0) > 0 && <span className="text-xs" style={{ color: 'var(--neutral-500)' }}><EditableContent contentKey="shop-products-manager-str" fallback="· Str:" /> {p.sizes?.join(', ')}</span>}
                  {(p.colors?.length || 0) > 0 && (
                    <span className="flex gap-1 items-center">
                      {p.colors!.map(c => {
                        const hex = extractHex(c);
                        return hex ? (
                          <span key={c} title={stripHex(c)} className="w-3.5 h-3.5 rounded-full inline-block"
                            style={{ background: hex, border: '1px solid rgba(255,255,255,0.2)' }} />
                        ) : (
                          <span key={c} className="text-xs" style={{ color: 'var(--neutral-400)' }}>{c}</span>
                        );
                      })}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button onClick={() => toggleActive(p)}
                  className="text-xs px-3 py-1 rounded-lg font-medium"
                  style={{ background: p.active ? 'var(--success-tint)' : 'var(--neutral-600)', color: p.active ? 'var(--success)' : 'var(--neutral-400)' }}>
                  {p.active ? 'Aktiv' : 'Inaktiv'}
                </button>
                <button onClick={() => startEdit(p)} className="p-2 rounded-lg"
                  style={{ background: 'var(--neutral-600)', color: 'var(--neutral-300)' }}>
                  <Edit2 size={14} />
                </button>
                <button onClick={() => handleDelete(p.id)} className="p-2 rounded-lg"
                  style={{ background: 'var(--error-tint)', color: 'var(--error)' }}>
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ShopProductsManager;
