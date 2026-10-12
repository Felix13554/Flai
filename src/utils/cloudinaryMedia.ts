/**
 * cloudinaryMedia.ts
 *
 * Helpers for the `cloudinary:PUBLIC_ID` media value — the Cloudinary
 * alternative to the `youtube:VIDEO_ID` value used by Portfolio, Products,
 * home sections, etc.
 *
 * Media values are stored as plain strings with a type prefix:
 *   "youtube:VIDEO_ID"      → YouTube embed
 *   "cloudinary:PUBLIC_ID"  → Cloudinary video (same delivery URLs as the hero)
 *   "panorama:https://…"    → 360° viewer
 *   anything else           → image
 *
 * The admin pastes a Cloudinary link (copied from Admin → Video) and
 * `parseCloudinaryInput` reduces it to the bare public_id, exactly like the
 * homepage hero carousel does with `extractCloudinaryPublicId`.
 *
 * Side-effect-free: only imports ./cloudinaryUrls (NOT heroPreload).
 */

import { extractCloudinaryPublicId } from './cloudinaryUrls';

export const CLOUDINARY_PREFIX = 'cloudinary:';
export const YOUTUBE_PREFIX = 'youtube:';

export function isCloudinaryMedia(value?: string | null): boolean {
  return !!value && value.startsWith(CLOUDINARY_PREFIX);
}

export function isYoutubeMedia(value?: string | null): boolean {
  return !!value && value.startsWith(YOUTUBE_PREFIX);
}

/** True for any value that renders as a video (YouTube or Cloudinary). */
export function isVideoMedia(value?: string | null): boolean {
  return isCloudinaryMedia(value) || isYoutubeMedia(value);
}

/** "cloudinary:abc/def" → "abc/def" (empty string if not a cloudinary value). */
export function getCloudinaryMediaId(value?: string | null): string {
  return isCloudinaryMedia(value) ? (value as string).slice(CLOUDINARY_PREFIX.length) : '';
}

/** "abc/def" → "cloudinary:abc/def" */
export function toCloudinaryMedia(publicId: string): string {
  return `${CLOUDINARY_PREFIX}${publicId}`;
}

// Cloudinary public_ids: letters, digits, _ - . and / for folders.
const PUBLIC_ID_RE = /^[A-Za-z0-9_\-./]+$/;

/**
 * Turns whatever the admin pastes into a bare Cloudinary public_id.
 *
 * Accepts:
 *   - a full Cloudinary delivery URL (HLS .m3u8, .mp4, .webm, with or without
 *     transformation segments / version) — e.g. what Admin → Video copies
 *   - an already-prefixed value ("cloudinary:my_video")
 *   - a bare public_id ("my_video" or "folder/my_video")
 *
 * Returns null if the input is empty, is a URL that isn't a Cloudinary URL
 * (e.g. a YouTube link), or isn't a valid public_id.
 */
export function parseCloudinaryInput(input: string): string | null {
  let value = (input || '').trim();
  if (!value) return null;

  if (isCloudinaryMedia(value)) value = value.slice(CLOUDINARY_PREFIX.length).trim();
  if (!value) return null;

  if (/^https?:\/\//i.test(value)) {
    if (!/^https?:\/\/res\.cloudinary\.com\//i.test(value)) return null;
    value = extractCloudinaryPublicId(value);
  } else if (/cloudinary\.com\//i.test(value)) {
    // Pasted without the scheme (res.cloudinary.com/…)
    value = extractCloudinaryPublicId(value.replace(/^\/\//, ''));
  }

  value = value.trim();
  // A Cloudinary URL that has no /upload/ part can't be reduced to an id.
  if (!value || /cloudinary\.com/i.test(value) || !PUBLIC_ID_RE.test(value)) return null;
  return value;
}

/**
 * Parses a pasted Cloudinary link straight into a storable media value
 * ("cloudinary:PUBLIC_ID"), or null if it isn't a valid Cloudinary link/id.
 */
export function parseCloudinaryMediaValue(input: string): string | null {
  const id = parseCloudinaryInput(input);
  return id ? toCloudinaryMedia(id) : null;
}

/** True if the pasted text looks like a Cloudinary delivery URL (not a bare id). */
export function looksLikeCloudinaryUrl(input: string): boolean {
  return /(^|\/\/)res\.cloudinary\.com\//i.test((input || '').trim());
}
