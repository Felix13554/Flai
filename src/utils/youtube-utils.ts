/**
 * youtube-utils.ts
 *
 * Parses a YouTube video ID out of whatever URL format the admin pastes into
 * the Preview Links form. YouTube video IDs are always exactly 11 characters
 * of [A-Za-z0-9_-].
 *
 * Recognised formats:
 *   https://www.youtube.com/watch?v=VIDEO_ID
 *   https://youtu.be/VIDEO_ID
 *   https://www.youtube.com/embed/VIDEO_ID
 *   https://www.youtube.com/shorts/VIDEO_ID
 *   a bare 11-character ID pasted directly
 */

const YT_ID_RE = /^[a-zA-Z0-9_-]{11}$/;

export function extractYouTubeId(url: string): string | null {
  if (!url) return null;
  const trimmed = url.trim();

  // Bare ID, no URL wrapper.
  if (YT_ID_RE.test(trimmed)) return trimmed;

  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.replace(/^www\./, '');

    if (host === 'youtu.be') {
      const id = parsed.pathname.slice(1).split('/')[0];
      return YT_ID_RE.test(id) ? id : null;
    }

    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
      if (parsed.pathname === '/watch') {
        const id = parsed.searchParams.get('v');
        return id && YT_ID_RE.test(id) ? id : null;
      }
      const embedMatch = parsed.pathname.match(/^\/(embed|shorts|live)\/([a-zA-Z0-9_-]{11})/);
      if (embedMatch) return embedMatch[2];
    }
  } catch {
    // Not a valid URL at all — fall through to null below.
  }

  return null;
}
