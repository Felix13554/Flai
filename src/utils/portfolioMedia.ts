/**
 * portfolioMedia.ts
 *
 * Helpers for a portfolio TASK (one row in `portfolio_images`) that holds
 * several media items in `media` (jsonb list of { id, url }).
 *
 * `url` uses the same prefixes as everywhere else on the site:
 *   https://…        → image
 *   panorama:https:… → 360° panorama
 *   youtube:ID       → YouTube video
 *   cloudinary:ID    → Cloudinary video
 *
 * Rules the portfolio page and the admin share:
 *   • max ONE video per task (the "primary video"); unlimited images + 360°
 *   • one cover image (`cover_media_id`) — shown on the task card
 *   • everything except the primary video is the "gallery"
 *     (the "Se alle billeder" container)
 */

import type { PortfolioImage, PortfolioMediaItem } from '../types';
import { isCloudinaryMedia, isYoutubeMedia } from './cloudinaryMedia';

export type PortfolioMediaKind = 'image' | 'panorama' | 'youtube' | 'cloudinary';

export const PANORAMA_PREFIX = 'panorama:';

export function getMediaKind(url: string): PortfolioMediaKind {
  if (url.startsWith(PANORAMA_PREFIX)) return 'panorama';
  if (isYoutubeMedia(url)) return 'youtube';
  if (isCloudinaryMedia(url)) return 'cloudinary';
  return 'image';
}

export function isVideoUrl(url: string): boolean {
  const kind = getMediaKind(url);
  return kind === 'youtube' || kind === 'cloudinary';
}

export function newMediaId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function isValidItem(item: unknown): item is PortfolioMediaItem {
  const m = item as PortfolioMediaItem;
  return !!m && typeof m.id === 'string' && typeof m.url === 'string' && m.url.trim() !== '';
}

/**
 * All media of a task, in order. Falls back to the legacy single `image_url`
 * when `media` is missing/empty (e.g. before the SQL migration has been run).
 */
export function getTaskMedia(task: Pick<PortfolioImage, 'id' | 'image_url' | 'media'>): PortfolioMediaItem[] {
  const raw = Array.isArray(task.media) ? task.media.filter(isValidItem) : [];
  if (raw.length > 0) return raw;
  if (typeof task.image_url === 'string' && task.image_url.trim() !== '') {
    return [{ id: `legacy-${task.id}`, url: task.image_url }];
  }
  return [];
}

export interface TaskMediaLayout {
  /** The one video shown next to the cover (null if the task has none). */
  video: PortfolioMediaItem | null;
  /** The cover (null only if the task has no images/360° at all). */
  cover: PortfolioMediaItem | null;
  /** Everything except the primary video — what "Se alle billeder" shows. */
  gallery: PortfolioMediaItem[];
}

export function getTaskLayout(task: Pick<PortfolioImage, 'id' | 'image_url' | 'media' | 'cover_media_id'>): TaskMediaLayout {
  const items = getTaskMedia(task);
  const video = items.find((m) => isVideoUrl(m.url)) ?? null;
  const gallery = items.filter((m) => m !== video);

  const chosen = task.cover_media_id ? gallery.find((m) => m.id === task.cover_media_id) : undefined;
  const cover =
    chosen ??
    gallery.find((m) => getMediaKind(m.url) === 'image') ??
    gallery[0] ??
    null;

  return { video, cover, gallery };
}

/**
 * The value to keep in the legacy `image_url` column (search, Meilisearch, AI
 * suggestions): the cover if there is one, otherwise the first medium.
 */
export function deriveImageUrl(media: PortfolioMediaItem[], coverId: string | null | undefined): string {
  const cover = coverId ? media.find((m) => m.id === coverId) : undefined;
  const firstImage = media.find((m) => getMediaKind(m.url) === 'image');
  return (cover ?? firstImage ?? media[0])?.url ?? '';
}
