# Netlify → Vercel Migration Guide

## What changed

| Old (Netlify) | New (Vercel) |
|---|---|
| `netlify.toml` | `vercel.json` |
| `netlify/functions/ai-proxy.js` | `api/ai-proxy.js` |
| `netlify/functions/drive-download.mjs` | `api/drive-download.js` |
| `netlify/functions/drive-folder-search.js` | `api/drive-folder-search.js` |
| `netlify/functions/gofile-proxy.js` | `api/gofile-proxy.js` |
| `netlify/functions/google-drive-upload.js` | `api/google-drive-upload.js` |
| `public/_redirects` | Handled by `vercel.json` rewrites (keep the file, it is ignored by Vercel) |

## URL changes in your frontend source

You must do a **find-and-replace** across your entire `src/` folder:

| Old URL | New URL |
|---|---|
| `/.netlify/functions/ai-proxy` | `/api/ai-proxy` |
| `/.netlify/functions/drive-download` | `/api/drive-download` |
| `/.netlify/functions/drive-folder-search` | `/api/drive-folder-search` |
| `/.netlify/functions/gofile-proxy` | `/api/gofile-proxy` |
| `/.netlify/functions/google-drive-upload` | `/api/google-drive-upload` |

Also check `gofile-proxy.js` itself — it had a hardcoded self-reference
`url: \`/.netlify/functions/gofile-proxy?id=${id}\`` in the `links` array.
The new version already returns `/api/gofile-proxy` instead.

## Vercel environment variables

All your existing env vars carry over unchanged — no renames needed:

- `GEMINI_API_KEY` / `VITE_GEMINI_API_KEY`
- `GROQ_API_KEY` / `VITE_GROQ_API_KEY`
- `GOOGLE_SERVICE_ACCOUNT_KEY`
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `VITE_GOOGLE_API_KEY`
- `VITE_GOOGLE_DRIVE_FOLDER_ID`
- `VITE_GOOGLE_DRIVE_PUBLIC_FOLDER_ID`

Set these in Vercel → Project → Settings → Environment Variables.

## Netlify edge function (ip-location)

The `netlify.toml` referenced an edge function at
`/.netlify/edge-functions/ip-location`, but `useIpCoverage.ts` does **not**
call it — it calls `http://ip-api.com/json/` directly. The edge function was
either never used or already removed. No action needed.

## Deploying

1. Copy `vercel.json` to your project root (replacing `netlify.toml` — you can delete that).
2. Copy the entire `api/` folder to your project root.
3. Do the find-and-replace on `src/` (table above).
4. Delete `netlify/` folder and `netlify.toml`.
5. Push to Vercel.

## Vercel-specific notes

- **Timeout**: Vercel Hobby has a 10s function timeout; Pro has 60s. The
  `drive-download` ZIP streaming logic was designed to avoid long-running
  requests, so it should be fine on Hobby too.
- **Body size**: `google-drive-upload.js` sets `sizeLimit: "10mb"` via the
  Vercel API config, up from Netlify's 6 MB. Large uploads should still use
  the `?token=1` pattern (browser streams directly from Google).
- **SPA routing**: `vercel.json` rewrites all non-`/api/` paths to
  `/index.html`, replicating the Netlify `[[redirects]]` rule.
