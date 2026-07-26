/**
 * api/drive-preview.js — Vercel Serverless Function
 *
 * Backend for the "Preview Links" feature: admin pastes a Google Drive URL
 * (single video, single photo, or a folder of photos) and Flai generates a
 * flai.dk/preview/[ID] link that clients open to view the content.
 *
 * ── Why this design ────────────────────────────────────────────────────────
 *
 *  VIDEO — this endpoint is NOT used for video playback at all. The client
 *  page embeds Google's own player directly:
 *
 *      <iframe src="https://drive.google.com/file/d/FILE_ID/preview">
 *
 *  This is Google Drive's officially supported "Embed item" mechanism (the
 *  same iframe Drive's own share dialog generates). Google's player already
 *  does adaptive streaming, range-based seeking, and is served from Google's
 *  own CDN — so playback costs Flai's server *zero* bandwidth and has no
 *  timeout/size ceiling, no matter how large or long the video is. Proxying
 *  video bytes through a Vercel serverless function would risk exactly the
 *  timeout/payload problems this project already hit (and solved) for large
 *  file downloads — so for playback we deliberately don't go anywhere near
 *  that path.
 *
 *  PHOTOS — direct hotlinking (the old `drive.google.com/uc?export=view`
 *  trick) has returned 403 for all users since Google's Jan 2024 third-party
 *  cookie change, so it can't be used. Two remaining options:
 *
 *    a) Drive API `thumbnailLink` (`lh3.googleusercontent.com/...=sNNN`) —
 *       Google's own image CDN, extremely fast, no bandwidth cost to Flai.
 *       Used here for the gallery GRID (small thumbnails load instantly).
 *       Quality degrades if you ask for a size much larger than Google's
 *       cached thumbnail, so it is NOT used for full-resolution viewing.
 *
 *    b) Authenticated proxy (`mode=image`) — this endpoint fetches the
 *       original bytes with the service-account token (same auth already
 *       used elsewhere in this project) and re-encodes them with sharp to
 *       the requested width. Used for the lightbox / full view. Long
 *       immutable Cache-Control means Vercel's edge network + the browser
 *       cache both serve repeat views without hitting this function again.
 *
 * ENDPOINTS:
 *
 *   GET /api/drive-preview?id=ID&mode=meta
 *     → { type: 'video' | 'image' | 'folder' | 'unsupported', ... }
 *
 *   GET /api/drive-preview?id=ID&mode=image&w=1600
 *     → resized JPEG bytes, long-cached
 */

import { createSign, createPrivateKey } from "crypto";
import sharp from "sharp";

export const config = {
  api: {
    bodyParser: false,
    responseLimit: false,
  },
};

// ─── Credential loading (same approach as api/gofile-proxy.js) ────────────────

function normalisePem(raw) {
  let pem = raw.replace(/\\n/g, "\n").replace(/\r/g, "");
  if (!pem.includes("\n")) {
    const m = pem.match(/(-----BEGIN [A-Z ]+-----)([A-Za-z0-9+/=\s]+)(-----END [A-Z ]+-----)/);
    if (m) {
      const body = m[2].replace(/\s/g, "");
      pem = `${m[1]}\n${(body.match(/.{1,64}/g) || []).join("\n")}\n${m[3]}\n`;
    }
  } else {
    const lines = pem.split("\n");
    const header = lines.find((l) => l.startsWith("-----BEGIN"));
    const footer = lines.find((l) => l.startsWith("-----END"));
    const body = lines.filter((l) => l && !l.startsWith("-----")).join("").replace(/\s/g, "");
    if (header && footer && body.length > 0) {
      pem = `${header}\n${(body.match(/.{1,64}/g) || []).join("\n")}\n${footer}\n`;
    }
  }
  return pem;
}

function loadCredentials() {
  const rawKey = (process.env.GOOGLE_SERVICE_ACCOUNT_KEY || "").trim();
  if (!rawKey) {
    throw Object.assign(new Error("GOOGLE_SERVICE_ACCOUNT_KEY env var is not set"), { statusCode: 500 });
  }
  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(rawKey, "base64").toString("utf8"));
  } catch (e) {
    throw Object.assign(
      new Error("Could not parse GOOGLE_SERVICE_ACCOUNT_KEY. Must be base64-encoded JSON. " + e.message),
      { statusCode: 500 }
    );
  }
  const { client_email, private_key } = parsed;
  if (!client_email || !private_key) {
    throw Object.assign(new Error("Service account JSON missing client_email/private_key"), { statusCode: 500 });
  }
  return {
    serviceAccountEmail: client_email,
    privateKey: createPrivateKey({ key: normalisePem(private_key), format: "pem" }),
  };
}

function base64urlEncode(str) {
  return Buffer.from(str).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function createJWT(serviceAccountEmail, privateKey) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64urlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64urlEncode(JSON.stringify({
    iss: serviceAccountEmail,
    scope: "https://www.googleapis.com/auth/drive.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: now, exp: now + 3600,
  }));
  const sign = createSign("RSA-SHA256");
  sign.update(`${header}.${payload}`);
  sign.end();
  return `${header}.${payload}.${base64urlEncode(sign.sign(privateKey))}`;
}

let cachedToken = null; // { token, expiresAt } — reused across warm invocations

async function getAccessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.token;
  }
  const { serviceAccountEmail, privateKey } = loadCredentials();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: createJWT(serviceAccountEmail, privateKey),
    }),
  });
  if (!res.ok) throw new Error(`OAuth2 token exchange failed (${res.status}): ${await res.text()}`);
  const json = await res.json();
  if (!json.access_token) throw new Error("OAuth2 response missing access_token");
  cachedToken = { token: json.access_token, expiresAt: Date.now() + (json.expires_in || 3500) * 1000 };
  return json.access_token;
}

// ─── Drive helpers ─────────────────────────────────────────────────────────────

const FILE_FIELDS = "id,name,mimeType,size,thumbnailLink,imageMediaMetadata(width,height,rotation),videoMediaMetadata(width,height,durationMillis)";
const FOLDER_ID_RE = /^[a-zA-Z0-9_-]+$/;

async function driveGetFile(id, token) {
  const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}` +
    `?fields=${encodeURIComponent(FILE_FIELDS)}&supportsAllDrives=true`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    throw Object.assign(new Error(`Drive file not found or inaccessible (${res.status})`), { statusCode: res.status === 404 ? 404 : 502 });
  }
  return res.json();
}

async function driveListFolder(folderId, token) {
  const fields = `nextPageToken,files(${FILE_FIELDS})`;
  const q = `'${folderId}' in parents and trashed = false`;
  let files = [];
  let pageToken;
  do {
    const url = `https://www.googleapis.com/drive/v3/files` +
      `?q=${encodeURIComponent(q)}` +
      `&fields=${encodeURIComponent(fields)}` +
      `&orderBy=name_natural` +
      `&pageSize=200` +
      `&supportsAllDrives=true&includeItemsFromAllDrives=true` +
      (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "");
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Drive folder listing failed (${res.status}): ${await res.text()}`);
    const data = await res.json();
    files = files.concat(data.files || []);
    pageToken = data.nextPageToken;
  } while (pageToken && files.length < 2000);
  return files;
}

/** Bump a Drive thumbnailLink's `=sNNN` (or `=wNNN-hNNN`) suffix up to a larger size. */
function resizeThumbnailLink(link, size) {
  if (!link) return link;
  return link.replace(/=s\d+$/, `=s${size}`).replace(/=w\d+-h\d+.*$/, `=s${size}`);
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
};

// ─── Main handler ──────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") return res.status(204).end();

  const { id, mode } = req.query;
  if (!id) return res.status(400).json({ error: "Missing ?id= parameter" });
  if (!FOLDER_ID_RE.test(id)) return res.status(400).json({ error: "Invalid id" });

  // ── mode=image — proxy + resize a single image's real bytes ────────────────
  if (mode === "image") {
    let width = parseInt(req.query.w || "1600", 10);
    if (!Number.isFinite(width) || width <= 0) width = 1600;
    width = Math.max(100, Math.min(width, 2400));

    try {
      const token = await getAccessToken();
      const driveRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media&supportsAllDrives=true`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!driveRes.ok) {
        return res.status(driveRes.status === 404 ? 404 : 502).json({ error: `Could not fetch image (${driveRes.status})` });
      }
      const original = Buffer.from(await driveRes.arrayBuffer());

      let outBuf, outType;
      try {
        outBuf = await sharp(original, { failOn: "none" })
          .rotate() // respect EXIF orientation
          .resize({ width, withoutEnlargement: true })
          .jpeg({ quality: 85, mozjpeg: true })
          .toBuffer();
        outType = "image/jpeg";
      } catch {
        // Unrecognised/exotic format (e.g. HEIC sharp can't decode) — serve original.
        outBuf = original;
        outType = driveRes.headers.get("Content-Type") || "application/octet-stream";
      }

      res.setHeader("Content-Type", outType);
      res.setHeader("Cache-Control", "public, max-age=604800, stale-while-revalidate=2592000");
      return res.status(200).send(outBuf);
    } catch (err) {
      console.error("[drive-preview] image error:", err.message);
      return res.status(err.statusCode || 502).json({ error: err.message });
    }
  }

  // ── mode=meta (default) — resolve type + (for folders) list contents ───────
  try {
    const token = await getAccessToken();
    const meta = await driveGetFile(id, token);

    if (meta.mimeType === "application/vnd.google-apps.folder") {
      const children = await driveListFolder(id, token);
      const images = children.filter((f) => (f.mimeType || "").startsWith("image/"));

      res.setHeader("Cache-Control", "public, max-age=30, stale-while-revalidate=300");
      return res.status(200).json({
        type: "folder",
        id,
        name: meta.name,
        count: images.length,
        items: images.map((f) => ({
          id: f.id,
          name: f.name,
          width: f.imageMediaMetadata?.width || null,
          height: f.imageMediaMetadata?.height || null,
          gridThumb: resizeThumbnailLink(f.thumbnailLink, 1000),
        })),
      });
    }

    if ((meta.mimeType || "").startsWith("video/")) {
      res.setHeader("Cache-Control", "public, max-age=30, stale-while-revalidate=300");
      return res.status(200).json({
        type: "video",
        id,
        name: meta.name,
        mimeType: meta.mimeType,
        durationMs: meta.videoMediaMetadata?.durationMillis ? Number(meta.videoMediaMetadata.durationMillis) : null,
        width: meta.videoMediaMetadata?.width || null,
        height: meta.videoMediaMetadata?.height || null,
        poster: resizeThumbnailLink(meta.thumbnailLink, 1600),
      });
    }

    if ((meta.mimeType || "").startsWith("image/")) {
      res.setHeader("Cache-Control", "public, max-age=30, stale-while-revalidate=300");
      return res.status(200).json({
        type: "image",
        id,
        name: meta.name,
        mimeType: meta.mimeType,
        width: meta.imageMediaMetadata?.width || null,
        height: meta.imageMediaMetadata?.height || null,
        gridThumb: resizeThumbnailLink(meta.thumbnailLink, 1000),
      });
    }

    return res.status(200).json({ type: "unsupported", mimeType: meta.mimeType || null, name: meta.name || null });
  } catch (err) {
    console.error("[drive-preview] meta error:", err.message);
    return res.status(err.statusCode || 502).json({ error: err.message });
  }
}
