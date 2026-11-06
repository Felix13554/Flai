import React, { useMemo, useRef, useState } from 'react';
import {
  Plus, CreditCard as Edit, Trash2, Save, X, Image as ImageIcon, ArrowUpDown,
  ChevronUp, ChevronDown, Star, Film, Globe,
} from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { useData } from '../../contexts/DataContext';
import ImageUpload from '../ImageUpload';
import EditableContent from '../EditableContent';
import { PortfolioMediaThumb } from '../PortfolioMediaView';
import {
  deriveImageUrl, getMediaKind, getTaskLayout, getTaskMedia, isVideoUrl, newMediaId,
} from '../../utils/portfolioMedia';
import type { PortfolioImage, PortfolioMediaItem } from '../../types';
import toast from 'react-hot-toast';

/**
 * Portfolio admin — one row in portfolio_images = one TASK (opgave) with any
 * number of images / 360° panoramas, max ONE video, and one cover image.
 * The cover is what the task card shows on /portfolio (not the "Se alle
 * billeder" container, which shows every image).
 */

interface TaskDraft {
  /** undefined → a new task. */
  id?: string;
  title: string;
  description: string;
  business_logo_url: string;
  business_website_url: string;
  media: PortfolioMediaItem[];
  cover_media_id: string | null;
}

const EMPTY_DRAFT: TaskDraft = {
  title: '',
  description: '',
  business_logo_url: '',
  business_website_url: '',
  media: [],
  cover_media_id: null,
};

const KIND_LABEL: Record<string, string> = {
  image: 'Billede',
  panorama: '360°',
  youtube: 'YouTube',
  cloudinary: 'Video',
};

const PortfolioManager: React.FC = () => {
  const { portfolioImages, refreshPortfolio } = useData();
  const [draft, setDraft] = useState<TaskDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [sliderValues, setSliderValues] = useState<Record<string, number>>({});

  // The multi-upload calls onImageUploaded once per file from an async loop, so
  // the handler must always see the latest draft → keep it in a ref too.
  const draftRef = useRef<TaskDraft | null>(null);
  const commitDraft = (next: TaskDraft | null) => {
    draftRef.current = next;
    setDraft(next);
  };

  const arrayBounds = useMemo(() => {
    if (portfolioImages.length === 0) return { min: 0, max: 100 };
    const arrays = portfolioImages.map((t) => t.array ?? 0);
    return { min: Math.min(...arrays), max: Math.max(...arrays) };
  }, [portfolioImages]);

  const sliderBg = (value: number) => {
    const pct = arrayBounds.max > 0 ? (value / arrayBounds.max) * 100 : 0;
    return `linear-gradient(to right, #f97316 0%, #f97316 ${pct}%, #404040 ${pct}%, #404040 100%)`;
  };

  const sortedTasks = useMemo(
    () => [...portfolioImages].sort((a, b) => (b.array ?? 50) - (a.array ?? 50)),
    [portfolioImages],
  );

  const totalMedia = useMemo(
    () => portfolioImages.reduce((sum, t) => sum + getTaskMedia(t).length, 0),
    [portfolioImages],
  );

  // ─── Draft editing ──────────────────────────────────────────────────────────

  const openNew = () => commitDraft({ ...EMPTY_DRAFT });

  const openEdit = (task: PortfolioImage) => {
    const media = getTaskMedia(task);
    const { cover } = getTaskLayout(task);
    commitDraft({
      id: task.id,
      title: task.title ?? '',
      description: task.description ?? '',
      business_logo_url: task.business_logo_url ?? '',
      business_website_url: task.business_website_url ?? '',
      media,
      cover_media_id: cover && getMediaKind(cover.url) === 'image' ? cover.id : null,
    });
  };

  const patchDraft = (patch: Partial<TaskDraft>) => {
    const current = draftRef.current;
    if (!current) return;
    commitDraft({ ...current, ...patch });
  };

  const addMedia = (url: string) => {
    if (!url) return; // ImageUpload reports '' when a preview is cleared
    const current = draftRef.current;
    if (!current) return;

    if (isVideoUrl(url) && current.media.some((m) => isVideoUrl(m.url))) {
      toast.error('Der kan kun være 1 video pr. opgave. Fjern den nuværende video først.');
      return;
    }

    const item: PortfolioMediaItem = { id: newMediaId(), url };
    commitDraft({
      ...current,
      media: [...current.media, item],
      // The first image added becomes the cover automatically.
      cover_media_id:
        current.cover_media_id ?? (getMediaKind(url) === 'image' ? item.id : null),
    });
  };

  const removeMedia = (id: string) => {
    const current = draftRef.current;
    if (!current) return;
    const media = current.media.filter((m) => m.id !== id);
    let cover = current.cover_media_id;
    if (cover === id) {
      cover = media.find((m) => getMediaKind(m.url) === 'image')?.id ?? null;
    }
    commitDraft({ ...current, media, cover_media_id: cover });
  };

  const moveMedia = (index: number, dir: -1 | 1) => {
    const current = draftRef.current;
    if (!current) return;
    const target = index + dir;
    if (target < 0 || target >= current.media.length) return;
    const media = [...current.media];
    [media[index], media[target]] = [media[target], media[index]];
    commitDraft({ ...current, media });
  };

  // ─── Save / delete ──────────────────────────────────────────────────────────

  const handleSave = async () => {
    const current = draftRef.current;
    if (!current) return;

    if (!current.title.trim()) { toast.error('Titel er påkrævet'); return; }
    if (current.media.length === 0) { toast.error('Tilføj mindst ét billede eller én video'); return; }
    if (current.media.filter((m) => isVideoUrl(m.url)).length > 1) {
      toast.error('Der kan kun være 1 video pr. opgave. Fjern de øvrige.');
      return;
    }

    // The cover must be an image that is still in the list.
    const coverCandidate = current.media.find(
      (m) => m.id === current.cover_media_id && getMediaKind(m.url) === 'image',
    );
    const cover = coverCandidate ?? current.media.find((m) => getMediaKind(m.url) === 'image') ?? null;

    const payload = {
      title: current.title.trim(),
      description: current.description.trim() || null,
      business_logo_url: current.business_logo_url || null,
      business_website_url: current.business_website_url.trim() || null,
      media: current.media,
      cover_media_id: cover?.id ?? null,
      // Legacy column — kept in sync for search / Meilisearch / AI suggestions.
      image_url: deriveImageUrl(current.media, cover?.id ?? null),
      // Tasks no longer belong to a bundle.
      bundle_id: null,
    };

    setSaving(true);
    try {
      if (current.id) {
        const { error } = await supabase.from('portfolio_images').update(payload).eq('id', current.id);
        if (error) throw error;
        toast.success('Opgave opdateret');
      } else {
        const maxSortOrder = portfolioImages.length > 0
          ? Math.max(...portfolioImages.map((t) => t.sort_order || 0))
          : -1;
        const { error } = await supabase
          .from('portfolio_images')
          .insert([{ ...payload, sort_order: maxSortOrder + 1 }]);
        if (error) throw error;
        toast.success('Opgave oprettet');
      }
      commitDraft(null);
      await refreshPortfolio();
    } catch (err: any) {
      console.error(err);
      const msg = String(err?.message ?? '');
      if (/media|cover_media_id/i.test(msg) && /column|schema/i.test(msg)) {
        toast.error('Databasen mangler kolonnerne "media" og "cover_media_id". Kør SQL-migrationen først.');
      } else {
        toast.error('Kunne ikke gemme opgaven');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (task: PortfolioImage) => {
    if (!confirm(`Slet opgaven "${task.title}" og alle dens medier?`)) return;
    try {
      const { error } = await supabase.from('portfolio_images').delete().eq('id', task.id);
      if (error) throw error;
      toast.success('Opgave slettet');
      if (draftRef.current?.id === task.id) commitDraft(null);
      await refreshPortfolio();
    } catch (err) {
      console.error(err);
      toast.error('Kunne ikke slette opgaven');
    }
  };

  // ─── Order (array) — higher value = shown first ───────────────────────────────

  const handleArrayChange = async (taskId: string, newArray: number) => {
    try {
      const { error } = await supabase.from('portfolio_images').update({ array: newArray }).eq('id', taskId);
      if (error) throw error;
      toast.success('Rækkefølge opdateret');
      await refreshPortfolio();
    } catch {
      toast.error('Kunne ikke opdatere rækkefølge');
    }
  };

  const handleSliderChange = (taskId: string, value: number) =>
    setSliderValues((prev) => ({ ...prev, [taskId]: value }));

  const handleSliderRelease = async (taskId: string, value: number) => {
    await handleArrayChange(taskId, value);
    setSliderValues((prev) => { const n = { ...prev }; delete n[taskId]; return n; });
  };

  // ─── Render ───────────────────────────────────────────────────────────────────

  const draftHasVideo = !!draft?.media.some((m) => isVideoUrl(m.url));

  const countsLabel = (task: PortfolioImage) => {
    const media = getTaskMedia(task);
    const images = media.filter((m) => getMediaKind(m.url) === 'image').length;
    const panos = media.filter((m) => getMediaKind(m.url) === 'panorama').length;
    const videos = media.filter((m) => isVideoUrl(m.url)).length;
    const parts: string[] = [];
    if (images) parts.push(`${images} ${images === 1 ? 'billede' : 'billeder'}`);
    if (panos) parts.push(`${panos} × 360°`);
    if (videos) parts.push(`${videos} video`);
    return parts.join(' · ');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <EditableContent
          contentKey="admin-portfolio-title"
          as="h2"
          className="text-2xl font-bold"
          fallback="Portfolio Administration"
        />
        <button onClick={openNew} className="btn-primary flex items-center">
          <Plus size={20} className="mr-2" />
          <EditableContent contentKey="portfolio-manager-ny-opgave" fallback="Ny opgave" />
        </button>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {[
          { label: 'Opgaver', value: portfolioImages.length },
          { label: 'Medier i alt', value: totalMedia },
        ].map((stat) => (
          <div key={stat.label} className="rounded-lg bg-neutral-700/20 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-neutral-400">{stat.label}</p>
                <p className="text-xl font-bold">{stat.value}</p>
              </div>
              <ImageIcon className="text-primary" size={20} />
            </div>
          </div>
        ))}
      </div>

      {/* ── Create / edit form ─────────────────────────────────────────────── */}
      {draft && (
        <div className="space-y-5 rounded-lg border-2 border-primary/30 bg-neutral-700/20 p-6">
          <h3 className="text-xl font-semibold">
            {draft.id ? 'Rediger opgave' : 'Ny opgave'}
          </h3>

          <div>
            <label className="form-label">
              <EditableContent contentKey="portfolio-manager-titel" fallback="Titel" />
            </label>
            <input
              type="text"
              value={draft.title}
              onChange={(e) => patchDraft({ title: e.target.value })}
              className="form-input"
              placeholder="Opgavens titel"
            />
          </div>

          <div>
            <label className="form-label">
              <EditableContent contentKey="portfolio-manager-beskrivelse-valgfrit" fallback="Beskrivelse (valgfrit)" />
            </label>
            <textarea
              value={draft.description}
              onChange={(e) => patchDraft({ description: e.target.value })}
              className="form-input min-h-[100px] resize-y"
              placeholder="Beskriv opgaven..."
            />
          </div>

          {/* Media list */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <label className="form-label !mb-0">
                <EditableContent contentKey="portfolio-manager-medier" fallback="Medier" />
              </label>
              <p className="text-xs text-neutral-400">
                Ubegrænset antal billeder og 360° · maks. 1 video · coveret vises på kortet
              </p>
            </div>

            {draft.media.length === 0 ? (
              <p className="rounded-lg border border-dashed border-neutral-600 p-4 text-sm text-neutral-400">
                Ingen medier endnu — upload nedenfor.
              </p>
            ) : (
              <ul className="space-y-2">
                {draft.media.map((item, index) => {
                  const kind = getMediaKind(item.url);
                  const isCover = item.id === draft.cover_media_id && kind === 'image';
                  return (
                    <li
                      key={item.id}
                      className={`flex items-center gap-3 rounded-lg border p-2 ${
                        isCover ? 'border-primary/60 bg-primary/10' : 'border-neutral-700 bg-neutral-800/50'
                      }`}
                    >
                      <div className="h-16 w-24 shrink-0 overflow-hidden rounded bg-neutral-900">
                        <PortfolioMediaThumb url={item.url} title={`Medie ${index + 1}`} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                          <span className="inline-flex items-center gap-1 text-neutral-300">
                            {kind === 'panorama' && <Globe size={14} />}
                            {(kind === 'youtube' || kind === 'cloudinary') && <Film size={14} />}
                            {KIND_LABEL[kind]}
                          </span>
                          {isCover && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-primary/20 px-2 py-0.5 text-xs font-medium text-white">
                              <Star size={12} fill="currentColor" /> Cover
                            </span>
                          )}
                        </div>
                        {kind === 'image' && !isCover && (
                          <button
                            type="button"
                            onClick={() => patchDraft({ cover_media_id: item.id })}
                            className="mt-1 text-xs text-neutral-400 underline-offset-2 hover:text-white hover:underline"
                          >
                            Brug som cover
                          </button>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center">
                        <button
                          type="button"
                          onClick={() => moveMedia(index, -1)}
                          disabled={index === 0}
                          aria-label="Flyt op"
                          className="rounded p-1.5 text-neutral-300 hover:bg-neutral-700 disabled:opacity-30"
                        >
                          <ChevronUp size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveMedia(index, 1)}
                          disabled={index === draft.media.length - 1}
                          aria-label="Flyt ned"
                          className="rounded p-1.5 text-neutral-300 hover:bg-neutral-700 disabled:opacity-30"
                        >
                          <ChevronDown size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeMedia(item.id)}
                          aria-label="Fjern"
                          className="rounded p-1.5 text-error hover:bg-neutral-700 hover:text-red-400"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            {draft.media.length > 0 && !draft.media.some((m) => getMediaKind(m.url) === 'image') && (
              <p className="text-xs text-yellow-400/80">
                Ingen billeder endnu — uden et billede er der intet cover på kortet.
              </p>
            )}

            <div className="rounded-lg bg-neutral-800/30 p-4">
              <p className="mb-3 text-sm text-neutral-400">
                Tilføj billeder (vælg flere ad gangen), et 360°-panorama
                {draftHasVideo ? '' : ' eller en video (YouTube / Cloudinary)'}.
                {draftHasVideo && ' Opgaven har allerede sin ene video.'}
              </p>
              <ImageUpload
                onImageUploaded={addMedia}
                bucket="portfolio"
                allowMultiple
                allow360
                allowCloudinaryVideo={!draftHasVideo}
              />
            </div>
          </div>

          {/* Logo */}
          <div className="border-t border-neutral-700 pt-4">
            <p className="mb-3 text-sm text-neutral-400">
              <EditableContent
                contentKey="portfolio-manager-virksomhed-valgfrit"
                fallback="Virksomhedslogo (valgfrit) — vises lille over titlen og linker til virksomhedens hjemmeside."
              />
            </p>
            <div className="mb-3">
              <label className="form-label">
                <EditableContent contentKey="portfolio-manager-virksomhed-logo" fallback="Virksomhedslogo" />
              </label>
              <ImageUpload
                onImageUploaded={(url) => patchDraft({ business_logo_url: url })}
                currentImageUrl={draft.business_logo_url || null}
                bucket="portfolio"
              />
            </div>
            <div>
              <label className="form-label">
                <EditableContent contentKey="portfolio-manager-virksomhed-website" fallback="Virksomhedens hjemmeside-link" />
              </label>
              <input
                type="url"
                value={draft.business_website_url}
                onChange={(e) => patchDraft({ business_website_url: e.target.value })}
                className="form-input"
                placeholder="https://example.com"
              />
            </div>
          </div>

          {!draft.id && (
            <p className="text-xs text-neutral-500">
              Rækkefølgen på siden kan justeres på opgavens kort, når den er oprettet.
            </p>
          )}

          <div className="flex justify-end space-x-3">
            <button onClick={() => commitDraft(null)} className="btn-secondary flex items-center" disabled={saving}>
              <X size={16} className="mr-2" />
              <EditableContent contentKey="portfolio-manager-annuller" fallback="Annuller" />
            </button>
            <button onClick={handleSave} className="btn-primary flex items-center" disabled={saving}>
              <Save size={16} className="mr-2" />
              {saving ? 'Gemmer…' : <EditableContent contentKey="portfolio-manager-gem-2" fallback="Gem" />}
            </button>
          </div>
        </div>
      )}

      {/* ── Task list ───────────────────────────────────────────────────────── */}
      <div className="space-y-4">
        <h3 className="flex items-center text-xl font-semibold">
          <ImageIcon className="mr-2" size={24} />
          <EditableContent contentKey="portfolio-manager-opgaver" fallback="Opgaver" />
        </h3>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {sortedTasks.map((task) => {
            const { cover, video } = getTaskLayout(task);
            const thumbUrl = cover?.url ?? video?.url ?? task.image_url;
            const value = sliderValues[task.id] ?? task.array ?? 0;
            const isEditing = draft?.id === task.id;
            return (
              <div
                key={task.id}
                className={`overflow-hidden rounded-lg bg-neutral-700/20 ${isEditing ? 'ring-2 ring-primary/60' : ''}`}
              >
                <div className="relative aspect-video bg-neutral-900">
                  {thumbUrl && <PortfolioMediaThumb url={thumbUrl} title={task.title} />}
                  <div className="absolute right-2 top-2 flex space-x-1">
                    <button
                      onClick={() => openEdit(task)}
                      aria-label="Rediger"
                      className="rounded bg-neutral-800/80 p-1 text-white transition-colors hover:bg-neutral-700"
                    >
                      <Edit size={16} />
                    </button>
                    <button
                      onClick={() => handleDelete(task)}
                      aria-label="Slet"
                      className="rounded bg-neutral-800/80 p-1 text-white transition-colors hover:bg-error"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                <div className="p-4">
                  <h4 className="mb-1 font-medium">{task.title}</h4>
                  <p className="mb-3 text-xs text-neutral-400">{countsLabel(task)}</p>
                  {task.description && (
                    <p className="mb-3 line-clamp-2 text-sm leading-relaxed text-neutral-300">{task.description}</p>
                  )}

                  <div className="rounded-lg bg-neutral-800/30 p-4">
                    <div className="mb-3 flex items-center">
                      <ArrowUpDown size={16} className="mr-2 text-neutral-400" />
                      <span className="text-sm font-medium text-neutral-400">
                        <EditableContent contentKey="portfolio-manager-raekkefoelge" fallback="Rækkefølge" />
                      </span>
                    </div>
                    <input
                      type="number"
                      value={task.array ?? 0}
                      onChange={(e) => handleArrayChange(task.id, parseInt(e.target.value) || 0)}
                      className="form-input mb-3 text-sm"
                    />
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs text-neutral-400">
                        <span>0</span>
                        <span className="font-medium text-neutral-300">Værdi: {value}</span>
                        <span>Højest ({arrayBounds.max})</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={arrayBounds.max}
                        value={value}
                        onChange={(e) => handleSliderChange(task.id, parseInt(e.target.value))}
                        onMouseUp={(e) => handleSliderRelease(task.id, parseInt((e.target as HTMLInputElement).value))}
                        onTouchEnd={(e) => handleSliderRelease(task.id, parseInt((e.target as HTMLInputElement).value))}
                        className="portfolio-slider h-2 w-full cursor-pointer appearance-none rounded-lg"
                        style={{ background: sliderBg(value) }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {portfolioImages.length === 0 && !draft && (
        <div className="py-12 text-center text-neutral-400">
          <ImageIcon size={48} className="mx-auto mb-4 opacity-50" />
          <p>
            <EditableContent
              contentKey="portfolio-manager-ingen-portfolio-billeder-fundet-tilfoej"
              fallback="Ingen opgaver fundet. Opret den første opgave for at komme i gang."
            />
          </p>
        </div>
      )}

      <style>{`
        .portfolio-slider::-webkit-slider-thumb {
          appearance: none; width: 20px; height: 20px;
          border-radius: 50%; background: #f97316;
          cursor: pointer; box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        }
        .portfolio-slider::-moz-range-thumb {
          width: 20px; height: 20px; border-radius: 50%;
          background: #f97316; cursor: pointer; border: none;
          box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        }
      `}</style>
    </div>
  );
};

export default PortfolioManager;
