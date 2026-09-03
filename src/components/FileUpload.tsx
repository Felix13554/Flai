/**
 * ImageUpload.tsx — v2 (360° support)
 *
 * Changes:
 *   - New `allow360` prop (default false). When true a "360° Panorama" toggle
 *     appears between the autocrop controls and the drop zone.
 *   - When the toggle is ON:
 *       · The file is uploaded to the `bucket` with `is360=true` in the form
 *         data so the edge function (upload-image v20) compresses and stores
 *         the panorama.
 *       · The returned URL is prefixed with "panorama:" before calling
 *         onImageUploaded() so callers can distinguish panoramas from regular
 *         images and render them in PanoramaViewer.
 *       · A live Pannellum mini-preview is shown after upload.
 *   - All existing functionality (autocrop, custom name, multi, YouTube) is
 *     unchanged.
 */

import React, { useState, useRef } from 'react';
import { Upload, X, Youtube, Images, Crop, Globe } from 'lucide-react';
import { supabase } from '../utils/supabase';
import toast from 'react-hot-toast';
import EditableContent from './EditableContent';
import PanoramaViewer from './PanoramaViewer';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtBytes(bytes: number): string {
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Autocrop (unchanged from v1) ─────────────────────────────────────────────

const AUTOCROP_TOLERANCE = 30;

async function autocropFile(file: File, freeAspect: boolean): Promise<File> {
  if (
    !file.type.startsWith('image/') ||
    file.type === 'image/gif'       ||
    file.type === 'image/svg+xml'
  ) {
    return file;
  }

  return new Promise<File>((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      try {
        const canvas  = document.createElement('canvas');
        canvas.width  = img.naturalWidth;
        canvas.height = img.naturalHeight;

        if (canvas.width === 0 || canvas.height === 0) { resolve(file); return; }

        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0);

        const { width, height } = canvas;
        const data = ctx.getImageData(0, 0, width, height).data;

        type Bg = { r: number; g: number; b: number } | null;
        const corners = [
          [0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1],
        ].map(([x, y]) => {
          const i = (y * width + x) * 4;
          return { r: data[i], g: data[i + 1], b: data[i + 2], a: data[i + 3] };
        });

        const bg: Bg = corners.some(c => c.a < 10)
          ? null
          : {
              r: Math.round(corners.reduce((s, c) => s + c.r, 0) / 4),
              g: Math.round(corners.reduce((s, c) => s + c.g, 0) / 4),
              b: Math.round(corners.reduce((s, c) => s + c.b, 0) / 4),
            };

        const isEmpty = (x: number, y: number): boolean => {
          const i = (y * width + x) * 4;
          if (data[i + 3] < 10) return true;
          if (!bg) return false;
          return (
            Math.abs(data[i]     - bg.r) <= AUTOCROP_TOLERANCE &&
            Math.abs(data[i + 1] - bg.g) <= AUTOCROP_TOLERANCE &&
            Math.abs(data[i + 2] - bg.b) <= AUTOCROP_TOLERANCE
          );
        };

        let top = 0;
        for (let y = 0; y < height; y++) {
          let rowEmpty = true;
          for (let x = 0; x < width; x++) { if (!isEmpty(x, y)) { rowEmpty = false; break; } }
          if (!rowEmpty) break;
          top++;
        }
        let bottom = height - 1;
        for (let y = height - 1; y >= top; y--) {
          let rowEmpty = true;
          for (let x = 0; x < width; x++) { if (!isEmpty(x, y)) { rowEmpty = false; break; } }
          if (!rowEmpty) break;
          bottom--;
        }
        let left = 0;
        for (let x = 0; x < width; x++) {
          let colEmpty = true;
          for (let y = top; y <= bottom; y++) { if (!isEmpty(x, y)) { colEmpty = false; break; } }
          if (!colEmpty) break;
          left++;
        }
        let right = width - 1;
        for (let x = width - 1; x >= left; x--) {
          let colEmpty = true;
          for (let y = top; y <= bottom; y++) { if (!isEmpty(x, y)) { colEmpty = false; break; } }
          if (!colEmpty) break;
          right--;
        }

        if (!freeAspect) {
          const trimX = Math.min(left, width - 1 - right);
          const trimY = Math.min(top, height - 1 - bottom);
          left   = trimX;
          right  = width - 1 - trimX;
          top    = trimY;
          bottom = height - 1 - trimY;
        }

        const cropW = right - left + 1;
        const cropH = bottom - top + 1;

        if (cropW <= 0 || cropH <= 0 || (cropW === width && cropH === height)) {
          resolve(file); return;
        }

        const out  = document.createElement('canvas');
        out.width  = cropW;
        out.height = cropH;
        out.getContext('2d')!.drawImage(canvas, left, top, cropW, cropH, 0, 0, cropW, cropH);

        out.toBlob(
          (blob) => {
            if (!blob) { resolve(file); return; }
            resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.png'), { type: 'image/png' }));
          },
          'image/png',
        );
      } catch (err) {
        console.warn('[autocrop] failed, using original:', err);
        resolve(file);
      }
    };

    img.onerror = () => { URL.revokeObjectURL(objectUrl); resolve(file); };
    img.src = objectUrl;
  });
}

// ─── Edge-function upload ─────────────────────────────────────────────────────

interface UploadResult {
  url:            string;
  fileName:       string;
  format:         string;
  originalSize:   number;
  compressedSize: number;
  reductionPct:   number;
  isPanorama?:    boolean;
}

async function uploadViaEdgeFunction(
  file:        File,
  bucket:      string,
  opts: {
    customName?: string;
    crop?:       boolean;
    freeAspect?: boolean;
    is360?:      boolean;
    maxWidth?:   number;
    maxHeight?:  number;
  } = {},
): Promise<UploadResult> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Not authenticated');

  const fileToUpload = opts.crop ? await autocropFile(file, opts.freeAspect ?? true) : file;

  const form = new FormData();
  form.append('file',      fileToUpload);
  form.append('bucket',    bucket);
  form.append('maxWidth',  String(opts.maxWidth  ?? (opts.is360 ? 8000 : 1920)));
  form.append('maxHeight', String(opts.maxHeight ?? (opts.is360 ? 4000 : 1920)));

  if (opts.customName && opts.customName.trim().length > 0) {
    form.append('customName', opts.customName.trim());
  }

  // Tell the edge function this is a panorama so it uses panorama-optimised
  // dimensions and marks it as isPanorama in the response.
  if (opts.is360) {
    form.append('is360', 'true');
    // Also set the bucket to 'panoramas' if the caller hasn't customised it.
    // The edge function v20 uses bucket=panoramas as a hint for panorama detection.
    if (bucket === 'product-images' || bucket === 'portfolio') {
      form.set('bucket', 'panoramas');
    }
  }

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const res = await fetch(`${supabaseUrl}/functions/v1/upload-image`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${session.access_token}` },
    body:    form,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? 'Upload failed');
  }

  return res.json() as Promise<UploadResult>;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface ImageUploadProps {
  onImageUploaded:    (url: string, isYoutube?: boolean) => void;
  onMultipleUploaded?: (urls: string[]) => void;
  currentImageUrl?:   string | null;
  bucket?:            string;
  allowMultiple?:     boolean;
  allow360?:          boolean;
  defaultCustomName?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

const ImageUpload: React.FC<ImageUploadProps> = ({
  onImageUploaded,
  onMultipleUploaded,
  currentImageUrl,
  bucket            = 'product-images',
  allowMultiple     = false,
  allow360          = false,
  defaultCustomName = '',
}) => {
  const [uploading,       setUploading]       = useState(false);
  const [multiUploading,  setMultiUploading]  = useState(false);
  const [uploadProgress,  setUploadProgress]  = useState<{ done: number; total: number } | null>(null);
  const [dragOver,        setDragOver]        = useState(false);
  const [compressionInfo, setCompressionInfo] = useState<{
    originalSize: number; compressedSize: number; format: string; reductionPct: number;
  } | null>(null);

  const [customName,       setCustomName]       = useState(defaultCustomName);
  const [autoCrop,         setAutoCrop]         = useState(false);
  const [cropFreeAspect,   setCropFreeAspect]   = useState(true);
  const [is360,            setIs360]            = useState(false);
  const [showYoutubeInput, setShowYoutubeInput] = useState(false);
  const [youtubeUrl,       setYoutubeUrl]       = useState('');

  // Mini-preview URL for panorama (raw, without the "panorama:" prefix)
  const [panoramaPreviewUrl, setPanoramaPreviewUrl] = useState<string | null>(null);

  const singleRef = useRef<HTMLInputElement>(null);
  const multiRef  = useRef<HTMLInputElement>(null);

  // ─── Single upload ──────────────────────────────────────────────────────────

  const handleSingleFile = async (file: File) => {
    const isVideo = file.type === 'video/mp4' || file.type === 'video/quicktime';
    const isImage = file.type.startsWith('image/');
    if (!isImage && !isVideo) { toast.error('Kun billede- og videofiler er tilladt'); return; }
    if (file.size > 100 * 1024 * 1024) { toast.error('Fil for stor — maks 100 MB'); return; }

    // For 360° images, warn if aspect ratio looks wrong
    if (is360 && isImage) {
      const ratio = await getImageAspectRatio(file);
      if (ratio !== null && (ratio < 1.5 || ratio > 2.5)) {
        toast('Advarsel: Dette billede ser ikke ud som et 360° panorama (forventet ~2:1 format)', {
          icon: '⚠️',
          duration: 4000,
        });
      }
    }

    setUploading(true);
    setCompressionInfo(null);
    setPanoramaPreviewUrl(null);

    try {
      const result = await uploadViaEdgeFunction(file, bucket, {
        customName: customName || undefined,
        crop:       autoCrop && !isVideo && !is360,
        freeAspect: cropFreeAspect,
        is360:      is360 && isImage,
      });

      if (!isVideo) {
        setCompressionInfo({
          originalSize:   result.originalSize,
          compressedSize: result.compressedSize,
          format:         result.format,
          reductionPct:   result.reductionPct,
        });
      }

      let finalUrl = result.url;

      // Prefix panorama URLs so rendering components know to use PanoramaViewer
      if (result.isPanorama || is360) {
        // Only prefix if not already prefixed (edge fn may return isPanorama:true)
        finalUrl = result.url.startsWith('panorama:') ? result.url : `panorama:${result.url}`;
        // Store the raw URL for the mini-preview
        setPanoramaPreviewUrl(result.url);
      }

      onImageUploaded(finalUrl);

      const sizeInfo = isVideo
        ? 'Video uploadet'
        : `Uploadet · ${fmtBytes(result.compressedSize)} ${result.format} (↓${result.reductionPct}%)`;

      toast.success(is360 && isImage ? `360° panorama uploadet · ${fmtBytes(result.compressedSize)}` : sizeInfo);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload fejlede');
      setCompressionInfo(null);
    } finally {
      setUploading(false);
      if (singleRef.current) singleRef.current.value = '';
    }
  };

  const handleSingleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleSingleFile(f);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleSingleFile(f);
  };

  // ─── Multi upload ───────────────────────────────────────────────────────────

  const handleMultipleFiles = async (files: File[]) => {
    const imageFiles = files.filter(f => f.type.startsWith('image/'));
    if (imageFiles.length === 0) { toast.error('Ingen billedfiler valgt'); return; }
    if (imageFiles.length !== files.length)
      toast.error(`${files.length - imageFiles.length} fil(er) sprunget over`);

    setMultiUploading(true);
    setUploadProgress({ done: 0, total: imageFiles.length });
    const urls: string[] = [];
    const errors: string[] = [];

    for (let i = 0; i < imageFiles.length; i++) {
      const perFileCustomName = customName.trim().length > 0
        ? `${customName.trim()}-${i + 1}`
        : undefined;
      try {
        const result = await uploadViaEdgeFunction(imageFiles[i], bucket, {
          customName: perFileCustomName,
          crop:       autoCrop,
          freeAspect: cropFreeAspect,
          is360:      is360,
        });
        let finalUrl = result.url;
        if (result.isPanorama || is360) {
          finalUrl = result.url.startsWith('panorama:') ? result.url : `panorama:${result.url}`;
        }
        urls.push(finalUrl);
        onImageUploaded(finalUrl);
      } catch {
        errors.push(imageFiles[i].name);
      }
      setUploadProgress({ done: i + 1, total: imageFiles.length });
    }

    if (onMultipleUploaded && urls.length > 0) onMultipleUploaded(urls);
    if (errors.length > 0) toast.error(`Kunne ikke uploade: ${errors.join(', ')}`);
    if (urls.length > 0)   toast.success(`${urls.length} billede${urls.length > 1 ? 'r' : ''} uploadet`);

    setMultiUploading(false);
    setUploadProgress(null);
    if (multiRef.current) multiRef.current.value = '';
  };

  const handleMultiChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) handleMultipleFiles(files);
  };

  // ─── YouTube ────────────────────────────────────────────────────────────────

  const handleYoutubeSubmit = () => {
    const match = youtubeUrl.match(
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    );
    if (!match) { toast.error('Ugyldig YouTube URL'); return; }
    onImageUploaded(`youtube:${match[1]}`, true);
    setYoutubeUrl(''); setShowYoutubeInput(false);
    toast.success('YouTube video tilføjet');
  };

  // ─── Helpers ────────────────────────────────────────────────────────────────

  // Determine if the current preview is a panorama URL
  const isPanoramaPreview = currentImageUrl?.startsWith('panorama:');
  const rawPanoramaUrl    = isPanoramaPreview
    ? currentImageUrl!.replace('panorama:', '')
    : (panoramaPreviewUrl ?? null);

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-3">

      {/* Current image preview */}
      {currentImageUrl && !currentImageUrl.startsWith('youtube:') && !currentImageUrl.startsWith('panorama:') && (
        <div className="relative">
          <img src={currentImageUrl} alt="Preview" className="w-full h-48 object-cover rounded-lg" />
          <button onClick={() => { onImageUploaded(''); setPanoramaPreviewUrl(null); }}
            className="absolute top-2 right-2 p-1 bg-neutral-900/80 text-white rounded hover:bg-red-600 transition-colors">
            <X size={16} />
          </button>
        </div>
      )}

      {/* 360° Panorama preview */}
      {currentImageUrl?.startsWith('panorama:') && rawPanoramaUrl && (
        <div className="relative">
          <PanoramaViewer url={rawPanoramaUrl} className="w-full" autoRotate={0.5} />
          <button onClick={() => { onImageUploaded(''); setPanoramaPreviewUrl(null); }}
            className="absolute top-2 right-2 z-20 p-1 bg-neutral-900/80 text-white rounded hover:bg-red-600 transition-colors">
            <X size={16} />
          </button>
        </div>
      )}

      {/* YouTube preview */}
      {currentImageUrl?.startsWith('youtube:') && (
        <div className="relative">
          <div className="relative w-full aspect-video">
            <iframe className="absolute inset-0 w-full h-full rounded-lg"
              src={`https://www.youtube.com/embed/${currentImageUrl.split(':')[1]}`}
              title="YouTube video" frameBorder="0" allowFullScreen />
          </div>
          <button onClick={() => onImageUploaded('')}
            className="absolute top-2 right-2 p-1 bg-neutral-900/80 text-white rounded hover:bg-red-600 transition-colors">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Options: custom name */}
      <div className="space-y-2">
        <div>
          <label className="block text-xs text-neutral-400 mb-1">
            <EditableContent contentKey="file-upload-custom-name-label" fallback="Filnavn (valgfrit)" />
          </label>
          <input
            type="text"
            value={customName}
            onChange={e => setCustomName(e.target.value)}
            placeholder="f.eks. hero-banner"
            className="form-input w-full text-sm"
            disabled={uploading || multiUploading}
          />
          <p className="text-xs text-neutral-500 mt-1">
            <EditableContent
              contentKey="file-upload-custom-name-hint"
              fallback="Lad feltet være tomt for automatisk navn. Filendelse tilføjes automatisk."
            />
          </p>
        </div>

        {/* ── 360° Panorama toggle ─────────────────────────────────────────── */}
        {allow360 && (
          <button
            type="button"
            onClick={() => {
              setIs360(v => !v);
              if (!is360) setAutoCrop(false); // autocrop doesn't make sense for panoramas
            }}
            disabled={uploading || multiUploading}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all text-sm ${
              is360
                ? 'bg-primary/15 border-primary/50 text-white shadow-lg shadow-primary/10'
                : 'bg-neutral-800/40 border-neutral-700 text-neutral-400 hover:border-neutral-500 hover:text-neutral-300'
            } ${uploading || multiUploading ? 'opacity-50 pointer-events-none' : ''}`}
          >
            {/* Globe icon */}
            <div className={`relative flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${
              is360 ? 'bg-primary/20' : 'bg-neutral-700/60'
            }`}>
              <Globe size={14} className={is360 ? 'text-primary' : 'text-neutral-500'} />
              {is360 && (
                <span className="absolute -top-1 -right-1 w-3 h-3 bg-primary rounded-full flex items-center justify-center">
                  <span className="text-white font-bold" style={{ fontSize: '7px' }}>✓</span>
                </span>
              )}
            </div>

            <div className="flex-1 text-left">
              <span className="font-medium"><EditableContent contentKey="file-upload-360-panorama" fallback="360° Panorama" /></span>
              <span className="text-xs ml-2 text-neutral-500">
                {is360
                  ? 'Komprimeres og vises i 360° viewer'
                  : 'Upload et equirectangulært panoramabillede'}
              </span>
              {is360 && (
                <p className="text-xs text-primary/80 mt-0.5">
                  <EditableContent contentKey="file-upload-pannellum-viewer-max-8000-4000" fallback="Pannellum viewer · Max 8000×4000 px · JPEG / WebP" />
                </p>
              )}
            </div>

            {/* Toggle pill */}
            <div className={`relative w-8 h-4 rounded-full transition-colors flex-shrink-0 ${is360 ? 'bg-primary' : 'bg-neutral-600'}`}>
              <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${is360 ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </div>
          </button>
        )}

        {/* Autocrop (hidden when 360 is on — meaningless for panoramas) */}
        {!is360 && (
          <>
            <button
              type="button"
              onClick={() => setAutoCrop(v => !v)}
              disabled={uploading || multiUploading}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors text-sm ${
                autoCrop
                  ? 'bg-primary/10 border-primary/40 text-white'
                  : 'bg-neutral-800/40 border-neutral-700 text-neutral-400 hover:border-neutral-500 hover:text-neutral-300'
              } ${uploading || multiUploading ? 'opacity-50 pointer-events-none' : ''}`}
            >
              <Crop size={15} className={autoCrop ? 'text-primary' : 'text-neutral-500'} />
              <div className="flex-1 text-left">
                <span className="font-medium">
                  <EditableContent contentKey="file-upload-autocrop-label" fallback="Beskær tomrum automatisk" />
                </span>
                <span className="text-xs text-neutral-500 ml-2">
                  <EditableContent
                    contentKey="file-upload-autocrop-hint"
                    fallback="Fjerner hvide/transparente kanter — ideelt til logoer"
                  />
                </span>
              </div>
              <div className={`relative w-8 h-4 rounded-full transition-colors flex-shrink-0 ${autoCrop ? 'bg-primary' : 'bg-neutral-600'}`}>
                <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${autoCrop ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </div>
            </button>

            {autoCrop && (
              <button
                type="button"
                onClick={() => setCropFreeAspect(v => !v)}
                disabled={uploading || multiUploading}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg border transition-colors text-sm ${
                  cropFreeAspect
                    ? 'bg-primary/10 border-primary/30 text-white'
                    : 'bg-neutral-800/20 border-neutral-700/60 text-neutral-400 hover:border-neutral-600 hover:text-neutral-300'
                } ${uploading || multiUploading ? 'opacity-50 pointer-events-none' : ''}`}
              >
                <div className="w-px h-4 bg-neutral-600 ml-1 flex-shrink-0" />
                <div className="flex-1 text-left">
                  <span className="font-medium text-xs">
                    <EditableContent contentKey="file-upload-free-aspect-label" fallback="Tillad ændring af størrelsesforhold" />
                  </span>
                  <span className="text-xs text-neutral-500 block mt-0.5">
                    <EditableContent
                      contentKey="file-upload-free-aspect-hint"
                      fallback={cropFreeAspect
                        ? "Beskærer hver kant uafhængigt — tættest muligt på motivet"
                        : "Beskærer symmetrisk — bevarer det originale størrelsesforhold"}
                    />
                  </span>
                </div>
                <div className={`relative w-8 h-4 rounded-full transition-colors flex-shrink-0 ${cropFreeAspect ? 'bg-primary' : 'bg-neutral-600'}`}>
                  <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${cropFreeAspect ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </div>
              </button>
            )}
          </>
        )}
      </div>

      {/* Compression result badge */}
      {compressionInfo && (
        <div className="p-3 bg-neutral-800/80 border border-neutral-700 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-neutral-300 uppercase tracking-wide flex items-center gap-1.5">
              {is360 && <Globe size={12} className="text-primary" />}
              <EditableContent contentKey="file-upload-komprimering" fallback="Komprimering" />
              {is360 && <span className="text-primary/70">· 360°</span>}
            </span>
            <span className="text-xs font-bold text-green-400 bg-green-400/10 border border-green-400/20 rounded-full px-2 py-0.5">
              ↓ {compressionInfo.reductionPct.toFixed(1)}%
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <div className="flex-1 text-center bg-neutral-700/40 rounded p-1.5">
              <div className="text-neutral-500 mb-0.5">
                <EditableContent contentKey="file-upload-original" fallback="Original" />
              </div>
              <div className="text-neutral-200 font-medium">{fmtBytes(compressionInfo.originalSize)}</div>
            </div>
            <svg className="text-neutral-600 shrink-0" width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <div className="flex-1 text-center bg-green-900/20 border border-green-800/30 rounded p-1.5">
              <div className="text-green-600 mb-0.5">{compressionInfo.format}</div>
              <div className="text-green-400 font-medium">{fmtBytes(compressionInfo.compressedSize)}</div>
            </div>
          </div>
        </div>
      )}

      {/* Drop zone */}
      <div
        className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors cursor-pointer ${
          dragOver ? 'border-primary bg-primary/10' : is360
            ? 'border-primary/30 hover:border-primary/60 hover:bg-primary/5 bg-primary/5'
            : 'border-neutral-600 hover:border-neutral-500 hover:bg-neutral-700/20'
        } ${uploading ? 'opacity-60 pointer-events-none' : ''}`}
        onClick={() => singleRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
      >
        <input
          ref={singleRef}
          type="file"
          accept={is360 ? 'image/jpeg,image/jpg,image/webp,image/png' : 'image/*,video/mp4,video/quicktime'}
          className="hidden"
          onChange={handleSingleChange}
          disabled={uploading}
        />

        {uploading ? (
          <div className="flex items-center justify-center gap-2 text-neutral-400">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary" />
            <span className="text-sm">
              {is360 ? 'Komprimerer og forbereder 360° panorama...' : 'Komprimerer og uploader...'}
            </span>
          </div>
        ) : (
          <div className="space-y-1">
            <div className="flex items-center justify-center gap-2 text-neutral-400">
              {is360
                ? <Globe size={18} className="text-primary/70" />
                : <Upload size={18} />
              }
              <span className="text-sm">
                {is360
                  ? 'Klik eller træk dit 360° panoramabillede hertil'
                  : 'Klik eller træk et billede / video hertil'
                }
              </span>
            </div>
            <p className="text-xs text-neutral-500">
              {is360
                ? 'JPEG · WebP · PNG — equirectangulært format (2:1) · Komprimeres automatisk'
                : 'JPG · PNG · WebP · AVIF · GIF · MP4 · MOV — komprimeres automatisk'
              }
            </p>
          </div>
        )}
      </div>

      {/* Multi upload — hidden when 360 mode is on */}
      {allowMultiple && !is360 && (
        <div>
          <input ref={multiRef} type="file" accept="image/*" multiple
            className="hidden" onChange={handleMultiChange} disabled={multiUploading} />
          <button type="button" onClick={() => multiRef.current?.click()} disabled={multiUploading}
            className={`w-full px-4 py-3 bg-neutral-700/30 border-2 border-dashed border-neutral-600 rounded-lg text-center hover:bg-neutral-700/50 hover:border-primary/50 transition-colors ${
              multiUploading ? 'opacity-60 pointer-events-none' : ''
            }`}>
            {multiUploading && uploadProgress ? (
              <div className="space-y-2">
                <div className="flex items-center justify-center gap-2 text-neutral-300">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary" />
                  <span className="text-sm"><EditableContent contentKey="file-upload-uploader" fallback="Uploader" /> {uploadProgress.done} / {uploadProgress.total}...</span>
                </div>
                <div className="w-full bg-neutral-700 rounded-full h-1.5">
                  <div className="bg-primary h-1.5 rounded-full transition-all duration-300"
                    style={{ width: `${(uploadProgress.done / uploadProgress.total) * 100}%` }} />
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2 text-neutral-300">
                <Images size={18} className="text-neutral-400" />
                <span className="text-sm">
                  <EditableContent contentKey="file-upload-vaelg-flere" fallback="Vælg flere billeder på én gang" />
                  {customName.trim().length > 0 && (
                    <span className="text-neutral-500 ml-1">({customName.trim()}-1, {customName.trim()}-2…)</span>
                  )}
                </span>
              </div>
            )}
          </button>
        </div>
      )}

      {/* YouTube — hidden when 360 mode is on */}
      {!is360 && (
        <div>
          {!showYoutubeInput ? (
            <button type="button" onClick={() => setShowYoutubeInput(true)}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm text-neutral-400 hover:text-white border border-neutral-700 hover:border-neutral-500 rounded-lg transition-colors">
              <Youtube size={16} />
              <span>
                <EditableContent contentKey="file-upload-tilfoej-youtube" fallback="Tilføj YouTube video i stedet" />
              </span>
            </button>
          ) : (
            <div className="flex gap-2">
              <input type="text" value={youtubeUrl} onChange={e => setYoutubeUrl(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleYoutubeSubmit()}
                placeholder="https://www.youtube.com/watch?v=..."
                className="form-input flex-1 text-sm" autoFocus />
              <button type="button" onClick={handleYoutubeSubmit}
                className="px-3 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors text-sm">
                <EditableContent contentKey="file-upload-tilfoej" fallback="Tilføj" />
              </button>
              <button type="button" onClick={() => { setShowYoutubeInput(false); setYoutubeUrl(''); }}
                className="p-2 text-neutral-400 hover:text-white transition-colors">
                <X size={16} />
              </button>
            </div>
          )}
        </div>
      )}

    </div>
  );
};

// ─── Utility: read aspect ratio from an image file ────────────────────────────

function getImageAspectRatio(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img.naturalHeight > 0 ? img.naturalWidth / img.naturalHeight : null);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

export default ImageUpload;
