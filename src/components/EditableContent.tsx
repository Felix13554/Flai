import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Edit3, Save, X, Upload, Palette, Check } from 'lucide-react';
import { useSiteContent } from '../hooks/useSiteContent';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import ImageUpload from './ImageUpload';
import toast from 'react-hot-toast';
import {
  getAdminSettings,
  hardcodedKeyRegistry,
  domRegistry,
  togglePickedKey,
  getPickingState,
  getSelectedKeys,
  type AdminSettings,
} from './ContentManagementPanel';

interface EditableContentProps {
  contentKey: string;
  fallback?: string;
  description?: string;
  category?: string;
  className?: string;
  as?: 'span' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'p' | 'div' | 'img' | 'a';
  style?: React.CSSProperties;
  alt?: string;
  src?: string;
  href?: string;
  target?: string;
  rel?: string;
  children?: React.ReactNode;
}

const EditableContent: React.FC<EditableContentProps> = ({
  contentKey,
  fallback = '',
  description,
  category,
  className = '',
  as: Component = 'span',
  style,
  alt,
  src,
  href,
  target,
  rel,
  children,
  ...props
}) => {
  const { isAdmin } = useAuth();
  const { getContent, getContentItem, updateContent, addContent } = useSiteContent();

  const [isEditing, setIsEditing]             = useState(false);
  const [editValue, setEditValue]             = useState('');
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [adminSettings, setAdminSettings]     = useState<AdminSettings>(getAdminSettings);

  // Picking / click-to-group state
  const [isPicking, setIsPicking]   = useState(false);
  const [isPicked, setIsPicked]     = useState(false);
  const [isHovered, setIsHovered]   = useState(false);

  // DOM ref — registered in domRegistry for viewport scanning
  const wrapperRef = useRef<HTMLElement | null>(null);

  const setWrapperRef = useCallback((el: HTMLElement | null) => {
    wrapperRef.current = el;
    if (el) {
      domRegistry.set(contentKey, el);
      // Add data attribute for DOM position sorting
      el.setAttribute('data-content-key', contentKey);
    } else {
      domRegistry.delete(contentKey);
    }
  }, [contentKey]);

  // ── Sync admin settings ───────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: Event) => setAdminSettings((e as CustomEvent<AdminSettings>).detail);
    window.addEventListener('adminSettingsChanged', handler);
    return () => window.removeEventListener('adminSettingsChanged', handler);
  }, []);

  // ── Sync picking state ────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: Event) => {
      const { state, selectedKeys } = (e as CustomEvent).detail;
      setIsPicking(state === 'picking');
      setIsPicked((selectedKeys as string[]).includes(contentKey));
    };
    window.addEventListener('pickingStateChanged', handler);
    // Initialise from global in case this component mounts after picking starts
    setIsPicking(getPickingState() === 'picking');
    setIsPicked(getSelectedKeys().has(contentKey));
    return () => window.removeEventListener('pickingStateChanged', handler);
  }, [contentKey]);

  // ── Self-register metadata ────────────────────────────────────────────────
  useEffect(() => {
    hardcodedKeyRegistry.set(contentKey, {
      fallback,
      category: category ?? 'uncategorized',
      description: description ?? contentKey,
      pageHint: window.location.pathname,
    });
    window.dispatchEvent(new CustomEvent('hardcodedKeyRegistered'));
    return () => { domRegistry.delete(contentKey); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentKey, fallback, category, description]);

  // ── Data ──────────────────────────────────────────────────────────────────
  const contentItem = getContentItem(contentKey);
  const value       = getContent(contentKey, fallback);



  // ── Non-admin render ───────────────────────────────────────────────────────
  if (!isAdmin) {
    const Tag = Component as React.ElementType;

    if (contentItem?.type === 'image' || Component === 'img') {
      return (
        <img
          ref={setWrapperRef as React.RefCallback<HTMLImageElement>}
          src={value || src}
          alt={alt ?? contentItem?.description}
          className={className}
          style={{ display: 'block', ...style }}
          width={props.width ?? undefined}
          height={props.height ?? undefined}
          fetchPriority="high"
          loading="eager"
          {...props}
        />
      );
    }

    if (contentItem?.type === 'video') return <span />;

    return (
      <Tag ref={setWrapperRef} className={className} style={style} href={href} target={target} rel={rel} {...props}>
        {children ?? value}
      </Tag>
    );
  }

  // ── Click handler: picking mode intercepts normal edit click ─────────────
  const handlePickClick = (e: React.MouseEvent) => {
    if (!isPicking) return;
    e.preventDefault();
    e.stopPropagation();
    togglePickedKey(contentKey);
  };

  const overlayDisabled = adminSettings.disableEditOverlay;

  const pickingWrapStyle: React.CSSProperties = isPicking ? {
    outline: isPicked
      ? '2.5px solid var(--success)'
      : isHovered
        ? '2.5px solid var(--primary-hover)'
        : '1.5px dashed var(--neutral-500)',
    outlineOffset: '2px',
    cursor: 'pointer',
    borderRadius: '3px',
  } : {};

  // ── Admin edit handlers ───────────────────────────────────────────────────
  const handleEdit = () => {
    setEditValue(value);
    setIsEditing(true);
  };

  const handleSave = async () => {
    try {
      const existingItem = getContentItem(contentKey);
      if (existingItem) {
        await updateContent(contentKey, editValue);
      } else {
        await addContent({ key: contentKey, value: editValue, type: 'text', description: description ?? contentKey, category: category ?? 'uncategorized' });
      }
      setIsEditing(false);
      toast.success('Indhold opdateret');
    } catch (err) {
      console.error('handleSave error:', err);
      toast.error('Kunne ikke gemme indhold');
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setShowColorPicker(false);
    setEditValue('');
  };

  const handleImageUpload = async (url: string) => {
    try {
      const existingItem = getContentItem(contentKey);
      if (existingItem) {
        await updateContent(contentKey, url);
      } else {
        await addContent({ key: contentKey, value: url, type: 'image', description: description ?? contentKey, category: category ?? 'uncategorized' });
      }
      setIsEditing(false);
      toast.success('Billede opdateret');
    } catch (err) {
      console.error('handleImageUpload error:', err);
      toast.error('Kunne ikke gemme billede');
    }
  };

  const handleColorChange = async (color: string) => {
    try {
      const existingItem = getContentItem(contentKey);
      if (existingItem) {
        await updateContent(contentKey, color);
      } else {
        await addContent({ key: contentKey, value: color, type: 'color', description: description ?? contentKey, category: category ?? 'uncategorized' });
      }
    } catch (err) {
      console.error('handleColorChange error:', err);
      toast.error('Kunne ikke gemme farve');
    }
  };

  // ── Admin edit interface ──────────────────────────────────────────────────
  const renderEditingInterface = () => {
    // Image
    if (contentItem?.type === 'image' || Component === 'img') {
      return (
        <div ref={setWrapperRef as React.RefCallback<HTMLDivElement>} className="relative group inline-block"
          style={pickingWrapStyle}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          onClick={handlePickClick}
        >
          <img src={value || src} alt={alt ?? contentItem?.description}
            className={`${className} ${isEditing ? 'opacity-50' : ''}`} style={{ display: 'block', ...style }} {...props} />
          {isPicked && (
            <div className="absolute top-1 left-1 w-5 h-5 rounded-full bg-success flex items-center justify-center z-10">
              <Check size={11} className="text-white" />
            </div>
          )}
          {!overlayDisabled && !isPicking && !isEditing && (
            <button onClick={handleEdit}
              className="absolute top-1 right-1 p-1 bg-primary text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10"
              title={`Rediger: ${contentItem?.description ?? contentKey}`}>
              <Upload size={12} />
            </button>
          )}
          {isEditing && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
              <div className="bg-neutral-800 rounded-lg p-6 max-w-sm w-full mx-4 border border-neutral-700">
                <h3 className="text-lg font-semibold mb-4 text-white">Rediger billede</h3>
                <ImageUpload onImageUploaded={handleImageUpload} bucket="site-content" />
                <div className="flex justify-end mt-4">
                  <button onClick={handleCancel} className="px-3 py-1.5 text-sm bg-neutral-600 text-white rounded hover:bg-neutral-500"><X size={16} /></button>
                </div>
              </div>
            </div>
          )}
        </div>
      );
    }

    // Video
    if (contentItem?.type === 'video') {
      return (
        <div ref={setWrapperRef as React.RefCallback<HTMLDivElement>} className="relative group inline-block w-full"
          style={pickingWrapStyle}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          onClick={handlePickClick}
        >
          <div className="p-4 bg-neutral-800 rounded-lg border border-neutral-700">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-white">{contentItem?.description}</p>
              {!overlayDisabled && !isPicking && !isEditing && (
                <button onClick={handleEdit} className="p-1 bg-primary text-white rounded hover:bg-primary-dark"><Edit3 size={14} /></button>
              )}
            </div>
            {!isEditing ? (
              <p className="text-xs text-neutral-300 break-all">{value || 'Ingen video-URL indstillet'}</p>
            ) : (
              <div className="flex items-center space-x-2 mt-2">
                <input type="text" value={editValue} onChange={e => setEditValue(e.target.value)}
                  className="form-input text-sm flex-1" placeholder="YouTube / Vimeo / .mp4 URL" autoFocus />
                <button onClick={handleSave} className="p-1 bg-success text-white rounded"><Save size={16} /></button>
                <button onClick={handleCancel} className="p-1 bg-error text-white rounded"><X size={16} /></button>
              </div>
            )}
          </div>
        </div>
      );
    }

    // Color
    if (contentItem?.type === 'color') {
      const Tag = Component as React.ElementType;
      return (
        <div ref={setWrapperRef as React.RefCallback<HTMLDivElement>} className="relative group inline-block"
          style={pickingWrapStyle}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          onClick={handlePickClick}
        >
          {isPicked && (
            <div className="absolute -top-1 -left-1 w-4 h-4 rounded-full bg-success flex items-center justify-center z-10">
              <Check size={9} className="text-white" />
            </div>
          )}
          <Tag className={className} style={{ ...style, color: value }} href={href} target={target} rel={rel} {...props}>
            {children ?? ''}
          </Tag>
          {!overlayDisabled && !isPicking && (
            showColorPicker ? (
              <div className="absolute top-full left-0 mt-2 bg-neutral-800 rounded-lg shadow-lg p-4 z-50 border border-neutral-700">
                <h3 className="text-sm font-semibold mb-2 text-white">Vælg farve</h3>
                <input type="color" value={value} onChange={e => handleColorChange(e.target.value)} className="w-full h-10 rounded border" />
                <div className="flex justify-end mt-2">
                  <button onClick={handleCancel} className="px-2 py-1 text-xs bg-neutral-600 text-white rounded"><X size={12} /></button>
                </div>
              </div>
            ) : (
              <button onClick={() => setShowColorPicker(true)}
                className="absolute -top-1 -right-1 p-1 bg-primary text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                title={`Rediger farve: ${contentItem?.description}`}>
                <Palette size={12} />
              </button>
            )
          )}
        </div>
      );
    }

    // Text (default)
    const Tag = Component as React.ElementType;

    // ── Lightweight inline render when not actively editing or picking ────────
    // This avoids the <div> wrapper being injected inside <button> elements
    // (which causes invalid HTML + the parent button's hover styles bleed through).
    // The full wrapper with pick-ring and edit pencil is only used when needed.
    if (!isEditing && !isPicking && !isPicked && overlayDisabled) {
      return (
        <Tag
          ref={setWrapperRef as React.RefCallback<HTMLElement>}
          className={className}
          style={style}
          href={href}
          target={target}
          rel={rel}
          {...props}
        >
          {children ?? value}
        </Tag>
      );
    }

    // When not editing and overlay is enabled but we're NOT inside a button context,
    // use the full group wrapper for the hover edit pencil.
    // Detect button context: if Component is 'span' the parent might be a button —
    // we still show the pencil but use a span wrapper instead of div to keep HTML valid.
    const WrapTag = (Component === 'span' || Component === 'a') ? 'span' : 'div';

    return (
      <WrapTag
        ref={setWrapperRef as React.RefCallback<HTMLElement>}
        className="relative group inline-block"
        style={pickingWrapStyle}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={isPicking ? handlePickClick : undefined}
      >
        {isPicked && !isEditing && (
          <span className="absolute -top-1 -left-1 w-4 h-4 rounded-full bg-success flex items-center justify-center z-10 pointer-events-none">
            <Check size={9} className="text-white" />
          </span>
        )}
        {isEditing ? (
          <span className="inline-flex items-center space-x-2">
            {Component === 'p' || contentItem?.description?.includes('beskrivelse') ? (
              <textarea value={editValue} onChange={e => setEditValue(e.target.value)} className="form-input min-w-[200px]" rows={3} autoFocus />
            ) : (
              <input type="text" value={editValue} onChange={e => setEditValue(e.target.value)} className="form-input min-w-[200px]" autoFocus />
            )}
            <button onClick={e => { e.stopPropagation(); handleSave(); }} className="p-1 bg-success text-white rounded"><Save size={16} /></button>
            <button onClick={e => { e.stopPropagation(); handleCancel(); }} className="p-1 bg-error text-white rounded"><X size={16} /></button>
          </span>
        ) : (
          <>
            <Tag className={className} style={style} href={href} target={target} rel={rel} {...props}>
              {children ?? value}
            </Tag>
            {!overlayDisabled && !isPicking && (
              <button
                onClick={e => { e.stopPropagation(); e.preventDefault(); handleEdit(); }}
                className="absolute -top-1 -right-1 p-1 bg-primary text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10"
                title={`Rediger: ${contentItem?.description ?? contentKey}`}
              >
                <Edit3 size={12} />
              </button>
            )}
          </>
        )}
      </WrapTag>
    );
  };

  return renderEditingInterface();
};

export default EditableContent;
