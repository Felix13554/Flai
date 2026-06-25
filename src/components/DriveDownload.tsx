/**
 * DriveDownload.tsx
 *
 * Download flow:
 *
 *   FSAPI browsers (Chrome, Edge, Opera, Brave) — ZIP files:
 *     1. GET /api/gofile-proxy?id=<id>  →  { token, downloadUrl, fileSizeBytes }
 *        (tiny JSON response, safe on Vercel)
 *     2. fetch(downloadUrl, { Authorization: Bearer <token> })
 *        — fetches the raw ZIP directly from Google, Vercel carries 0 bytes
 *     3. response.body.pipeThrough(progressTransform).pipeTo(writable)
 *        — native pipe straight to FSAPI writable on disk
 *     The ZIP file is saved as-is; the user extracts it locally.
 *     This completely avoids Vercel's function timeout — the data path is
 *     Google → browser → disk with no serverless function in the middle.
 *
 *   FSAPI browsers — non-ZIP files:
 *     Same token+direct-stream approach, same path.
 *
 *   Non-FSAPI browsers:
 *     Method B (?alt=media&key=APIKEY). If > 5 GB → browser wall.
 *
 * FIXES:
 *   - ZIP + FSAPI branch now streams Google → disk directly (no Vercel proxy).
 *     Previously it used gofile-proxy?mode=stream which hit Vercel's function
 *     timeout at ~3-5 GB, aborted the writable, and fell back to Method B.
 *   - createWritable({ keepExistingData: false }) — explicit truncation so
 *     replacing an existing file doesn't stall at 7 KB.
 *   - Native pipeThrough/pipeTo replaces manual read loop.
 *   - React #310 on Safari: all hooks declared unconditionally.
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Download, Home, Share2, Loader, AlertCircle, CheckCircle2,
  Folder, ChevronDown, ChevronUp, File,
} from "lucide-react";
import { createClient } from "@supabase/supabase-js";
import EditableContent from "./EditableContent";
import {
  getGoogleDriveFile,
  hasFSAPI,
  METHOD_B_MAX_BYTES,
  BrowserUnsupportedError,
  type DownloadProgressCallback,
} from "../utils/google-drive-utils";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

// ─── Types ─────────────────────────────────────────────────────────────────────

interface FileEntry {
  index: number;
  name: string;
  path: string;
  size: number;
}

interface FolderInfo {
  folderName: string;
  fileCount: number;
  totalUncompressedBytes: number;
  files: FileEntry[];
}

interface DownloadProgress {
  overall: number;
  status: string;
  done?: boolean;
  error?: string;
}

// ─── Browser logos ─────────────────────────────────────────────────────────────

const CDN = "https://cdnjs.cloudflare.com/ajax/libs/browser-logos/75.0.1";
const SUPPORTED_BROWSERS = [
  { name: "Google Chrome",  img: `${CDN}/chrome/chrome_64x64.png`,  img2x: `${CDN}/chrome/chrome_128x128.png`,  url: "https://www.google.com/chrome/" },
  { name: "Microsoft Edge", img: `${CDN}/edge/edge_64x64.png`,      img2x: `${CDN}/edge/edge_128x128.png`,      url: "https://www.microsoft.com/edge" },
  { name: "Opera",          img: `${CDN}/opera/opera_64x64.png`,    img2x: `${CDN}/opera/opera_128x128.png`,    url: "https://www.opera.com/" },
  { name: "Brave",          img: `${CDN}/brave/brave_64x64.png`,    img2x: `${CDN}/brave/brave_128x128.png`,    url: "https://brave.com/" },
];

// ─── Helpers ───────────────────────────────────────────────────────────────────

function fmtBytes(bytes: number): string {
  if (bytes >= 1_073_741_824) return (bytes / 1_073_741_824).toFixed(2) + " GB";
  if (bytes >= 1_048_576)     return (bytes / 1_048_576).toFixed(1) + " MB";
  if (bytes >= 1_024)         return (bytes / 1_024).toFixed(0) + " KB";
  return bytes + " B";
}

function fmtGB(bytes: number): string {
  return (bytes / 1_073_741_824).toFixed(3) + " GB";
}

function fmtTime(seconds: number): string {
  if (seconds < 60) return `${Math.ceil(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.ceil(seconds % 60);
  return `${m}m ${s}s`;
}

// ─── Browser wall ──────────────────────────────────────────────────────────────

interface BrowserWallProps {
  fileSizeBytes: number;
  shareUrl: string | null;
  onNavigateHome: () => void;
}

const BrowserWall: React.FC<BrowserWallProps> = ({ fileSizeBytes, shareUrl, onNavigateHome }) => {
  const sizeGB = fileSizeBytes > 0
    ? (fileSizeBytes / (1024 ** 3)).toFixed(1) + " GB"
    : "over 5 GB";
  return (
    <div className="min-h-screen bg-dark flex items-center justify-center pt-16 pb-8">
      <div className="text-center max-w-lg w-full px-4">
        <div className="mb-5">
          <div className="mx-auto w-16 h-16 rounded-full bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
            <AlertCircle size={32} className="text-amber-400" />
          </div>
        </div>
        <h1 className="text-2xl font-bold text-white mb-2"><EditableContent contentKey="drive-download-browser-ikke-understoettet" fallback="Browser ikke understøttet" /></h1>
        <p className="text-neutral-300 mb-2 leading-relaxed">
          <EditableContent contentKey="drive-download-denne-mappe-er" fallback="Denne mappe er" /> <span className="text-white font-semibold">{sizeGB}</span> <EditableContent contentKey="drive-download-og-kraever-direkte-streaming-til" fallback="og kræver           direkte streaming til harddisken. Din nuværende browser understøtter ikke denne funktion." />
        </p>
        <p className="text-neutral-400 text-sm mb-8">
          <EditableContent contentKey="drive-download-aabn-denne-side-i-en" fallback="Åbn denne side i en af følgende browsere for at downloade:" />
        </p>
        <div className="flex items-end justify-center gap-8 mb-8 flex-wrap">
          {SUPPORTED_BROWSERS.map(({ name, img, img2x, url }) => (
            <a key={name} href={url} target="_blank" rel="noopener noreferrer"
               className="flex flex-col items-center gap-2.5 group" title={`Download ${name}`}>
              <img src={img} srcSet={`${img} 1x, ${img2x} 2x`} alt={name} width={56} height={56}
                className="rounded-xl shadow-lg shadow-black/40 ring-2 ring-transparent group-hover:ring-white/25 group-hover:scale-110 transition-all duration-200"
                loading="eager" decoding="async" />
              <span className="text-xs text-neutral-400 group-hover:text-white transition-colors whitespace-nowrap">{name}</span>
            </a>
          ))}
        </div>
        <div className="bg-neutral-800/60 border border-neutral-700/60 rounded-lg px-4 py-3 mb-6 text-sm text-neutral-400 text-left">
          <span className="text-neutral-300 font-medium"><EditableContent contentKey="drive-download-tip" fallback="Tip:" /></span>{" "}
          <EditableContent contentKey="drive-download-kopi-r-sidens-url-og" fallback="Kopiér sidens URL og indsæt den i Chrome, Edge, Opera eller Brave for straks at starte download." />
        </div>
        <div className="flex flex-col gap-3">
          {shareUrl && (
            <a href={shareUrl.startsWith("http") ? shareUrl : `https://${shareUrl}`}
               target="_blank" rel="noopener noreferrer"
               className="flex items-center justify-center gap-2 bg-neutral-700 hover:bg-neutral-600 text-white font-semibold py-3 px-6 rounded-lg transition-colors">
              <Share2 size={20} /> <EditableContent contentKey="drive-download-del-projekt" fallback="Del projekt" />
            </a>
          )}
          <button onClick={onNavigateHome}
            className="flex items-center justify-center gap-2 bg-neutral-700 hover:bg-neutral-600 text-white font-semibold py-3 px-6 rounded-lg transition-colors">
            <Home size={20} /> <EditableContent contentKey="drive-download-til-forside" fallback="Til forside" />
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Folder info panel ─────────────────────────────────────────────────────────

interface FolderInfoPanelProps {
  folderInfo: FolderInfo;
  expanded: boolean;
  onToggle: () => void;
}

const FolderInfoPanel: React.FC<FolderInfoPanelProps> = ({ folderInfo, expanded, onToggle }) => (
  <div className="bg-neutral-800/60 border border-neutral-700/60 rounded-lg mb-4 text-left overflow-hidden">
    <button
      onClick={onToggle}
      className="w-full flex items-center justify-between px-4 py-3 text-sm text-neutral-300 hover:text-white hover:bg-neutral-700/40 transition-colors"
    >
      <span className="flex items-center gap-2">
        <Folder size={15} className="text-primary" />
        <span>{folderInfo.fileCount} <EditableContent contentKey="drive-download-filer" fallback="filer ·" /> {fmtBytes(folderInfo.totalUncompressedBytes)}</span>
      </span>
      {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
    </button>
    {expanded && (
      <div className="border-t border-neutral-700/60 max-h-48 overflow-y-auto">
        {folderInfo.files.map((f) => (
          <div key={f.path} className="flex items-center gap-2 px-4 py-2 text-xs text-neutral-400 border-b border-neutral-800/60 last:border-0">
            <File size={12} className="shrink-0 text-neutral-500" />
            <span className="truncate flex-1">{f.path}</span>
            <span className="shrink-0 text-neutral-500">{fmtBytes(f.size)}</span>
          </div>
        ))}
      </div>
    )}
  </div>
);

// ─── Main component ────────────────────────────────────────────────────────────

const DriveDownload: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // ── ALL hooks declared unconditionally (fixes React #310 on Safari) ─────────
  // FSAPI is checked inside state/effect, never at module level, so hook order
  // is always identical regardless of browser capabilities.
  const [fsapiAvailable,  setFsapiAvailable]  = useState(false);
  const [shareUrl,        setShareUrl]         = useState<string | null>(null);
  const [fileName,        setFileName]         = useState<string>("download");
  const [folderName,      setFolderName]       = useState<string>("download");
  const [fileSizeBytes,   setFileSizeBytes]    = useState<number>(0);
  const [sizeLoaded,      setSizeLoaded]       = useState<boolean>(false);
  const [isZip,           setIsZip]            = useState<boolean>(false);

  const [folderInfo,         setFolderInfo]         = useState<FolderInfo | null>(null);
  const [folderInfoLoading,  setFolderInfoLoading]  = useState(false);
  const [folderInfoError,    setFolderInfoError]    = useState<string | null>(null);
  const [folderInfoExpanded, setFolderInfoExpanded] = useState(false);

  const [downloading,   setDownloading]   = useState(false);
  const [downloadDone,  setDownloadDone]  = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [progress,      setProgress]      = useState<DownloadProgress | null>(null);

  // Whether we should show the browser wall (determined after sizeLoaded)
  const [showBrowserWall, setShowBrowserWall] = useState(false);

  // Abort controller ref so we can cancel in-flight downloads
  const abortRef = useRef<AbortController | null>(null);

  // ── Detect FSAPI once, client-side only ──────────────────────────────────────
  useEffect(() => {
    setFsapiAvailable(hasFSAPI());
  }, []);

  // ── Load file metadata ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!id) { navigate("/"); return; }

    getGoogleDriveFile(id)
      .then((info) => {
        const name = info.name || "download";
        setFileName(name);
        setFolderName(name.replace(/\.zip$/i, ""));
        if (info.size) setFileSizeBytes(info.size);
        if (info.isZip) setIsZip(true);
        setSizeLoaded(true);
      })
      .catch(() => { setSizeLoaded(true); });

    (async () => {
      try {
        const { data: booking } = await supabase
          .from("bookings")
          .select("share_project_url")
          .eq("zip_file_url", window.location.href)
          .maybeSingle();
        if (booking?.share_project_url) setShareUrl(booking.share_project_url);
      } catch { /* ignore */ }
    })();
  }, [id, navigate]);

  // ── Decide browser wall once we know FSAPI status + file size ───────────────
  useEffect(() => {
    if (!sizeLoaded) return;
    if (!fsapiAvailable && fileSizeBytes > METHOD_B_MAX_BYTES) {
      setShowBrowserWall(true);
    }
  }, [sizeLoaded, fsapiAvailable, fileSizeBytes]);

  // ── Auto-load folder info from ZIP index ─────────────────────────────────────
  useEffect(() => {
    if (!id || !isZip || folderInfo || folderInfoLoading) return;
    setFolderInfoLoading(true);
    setFolderInfoError(null);
    fetch(`/api/gofile-proxy?id=${encodeURIComponent(id)}&mode=info`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setFolderInfo({
          folderName: data.fileName || folderName,
          fileCount: data.fileCount,
          totalUncompressedBytes: data.totalUncompressedBytes,
          files: data.files,
        });
      })
      .catch((err) => setFolderInfoError(err.message))
      .finally(() => setFolderInfoLoading(false));
  }, [id, isZip, folderInfo, folderInfoLoading, folderName]);

  // ── Download handler ─────────────────────────────────────────────────────────
  const handleDownload = useCallback(async () => {
    if (!id) return;

    setDownloading(true);
    setDownloadDone(false);
    setDownloadError(null);
    setProgress(null);

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      if (fsapiAvailable && isZip) {
        // ── Method A: ZIP + FSAPI — stream raw ZIP directly from Google to disk ──
        //
        // CRITICAL: we do NOT route through gofile-proxy?mode=stream here.
        // That endpoint re-encodes the ZIP server-side inside a Vercel function,
        // which has a hard execution timeout (10 s Hobby / 60 s Pro).  At typical
        // broadband speeds a 25-40 GB file hits that ceiling at 3-5 GB, the
        // function closes the response body, writable.abort() is called, and the
        // download silently falls back to Method B.
        //
        // Instead: get only the auth token from the proxy (a tiny JSON call that
        // completes in < 1 s), then fetch the raw ZIP directly from Google's CDN
        // with an Authorization header.  The data path is:
        //
        //   Google CDN → browser (RAM never accumulates) → FSAPI writable → disk
        //
        // Vercel carries exactly 0 bytes of file data and has no timeout to hit.

        setProgress({ overall: 0, status: "Henter filinfo…" });

        const proxyRes = await fetch(`/api/gofile-proxy?id=${encodeURIComponent(id)}`, { signal: abort.signal });
        if (!proxyRes.ok) {
          let detail = `Server fejl (${proxyRes.status})`;
          try { const b = await proxyRes.json(); detail = b.detail || b.error || detail; } catch { /* */ }
          throw new Error(detail);
        }
        const info = await proxyRes.json();
        if (info.error) throw new Error(info.detail || info.error);

        const { token, downloadUrl: googleUrl, fileName: serverFileName, fileSizeBytes: serverSize } = info;
        const saveName = serverFileName || fileName;

        if (!token || !googleUrl) {
          throw new Error(
            "Service account token ikke tilgængeligt. " +
            "Kontrollér at GOOGLE_SERVICE_ACCOUNT_KEY er sat korrekt i Vercel."
          );
        }

        setProgress({ overall: 1, status: "Åbner gem-dialog…" });

        const handle = await (window as any).showSaveFilePicker({
          suggestedName: saveName,
          types: [{ description: "ZIP Archive", accept: { "application/zip": [".zip"], "application/octet-stream": [] } }],
        });

        setProgress({ overall: 2, status: "Forbinder til Google Drive…" });

        // Fetch directly from Google — Authorization header, no Vercel in path.
        const response = await fetch(googleUrl, {
          headers: { Authorization: `Bearer ${token}` },
          signal: abort.signal,
        });

        if (!response.ok) {
          throw new Error(`Google Drive svarede med ${response.status}`);
        }

        const contentType = response.headers.get("Content-Type") || "";
        if (contentType.includes("text/html")) {
          throw new Error(
            "Google Drive returnerede en HTML-bekræftelsesside i stedet for fildata. " +
            "Kontrollér at filen er delt korrekt med service-kontoen."
          );
        }

        if (!response.body) throw new Error("Din browser understøtter ikke streaming.");

        const contentLength = response.headers.get("Content-Length");
        const total = contentLength ? parseInt(contentLength, 10) : (serverSize || 0);

        // Progress TransformStream — counts bytes as they pass through to disk.
        let received = 0;
        const startTime = Date.now();

        const progressTransform = new TransformStream<Uint8Array, Uint8Array>({
          transform(chunk, controller) {
            received += chunk.byteLength;
            const pct = total > 0 ? Math.min(99, Math.round((received / total) * 100)) : 0;
            const elapsedMs = Date.now() - startTime;
            const speedBps  = elapsedMs > 0 ? received / (elapsedMs / 1000) : 0;

            let status: string;
            if (total > 0 && speedBps > 0) {
              const remSec = (total - received) / speedBps;
              status = `Downloader… ${fmtGB(received)} / ${fmtGB(total)} — ${fmtTime(remSec)} tilbage`;
            } else if (total > 0) {
              status = `Downloader… ${fmtGB(received)} / ${fmtGB(total)}`;
            } else {
              status = `Downloader… ${fmtGB(received)}`;
            }

            setProgress({ overall: pct, status });
            controller.enqueue(chunk);
          },
        });

        // keepExistingData: false — truncate any pre-existing file so "Replace"
        // doesn't stall at 7 KB with stale bytes from the previous download.
        const writable = await handle.createWritable({ keepExistingData: false });

        // Native pipe: Google CDN → progressTransform → disk.
        // No JS scheduler in the hot path; backpressure handled by the platform.
        await response.body
          .pipeThrough(progressTransform)
          .pipeTo(writable);

        setProgress({ overall: 100, status: "Download fuldført!", done: true });
        setDownloadDone(true);

      } else if (!fsapiAvailable) {
        // ── Method B (non-FSAPI) ───────────────────────────────────────────────
        // BrowserUnsupportedError for >5 GB was already gated by showBrowserWall
        // state, but we guard here too in case the wall hasn't rendered yet.
        if (fileSizeBytes > METHOD_B_MAX_BYTES) {
          throw new BrowserUnsupportedError(fileSizeBytes);
        }

        // Fetch the proxy endpoint to get the methodBUrl (alt=media with API key).
        // We then use fetch+blob+object URL instead of a bare <a> click so that:
        //   a) The browser always sees the full Content-Length from Google.
        //   b) The file lands in Downloads with the correct name immediately — no
        //      lingering .crswap because the blob is already complete before we
        //      trigger the save.
        // For very large files on non-FSAPI browsers (already blocked above) this
        // would require loading everything into RAM, hence the 5 GB guard.
        setProgress({ overall: 0, status: "Henter filinfo…" });

        const proxyRes = await fetch(`/api/gofile-proxy?id=${encodeURIComponent(id)}`, { signal: abort.signal });
        if (!proxyRes.ok) {
          let detail = `Server fejl (${proxyRes.status})`;
          try { const b = await proxyRes.json(); detail = b.detail || b.error || detail; } catch { /* */ }
          throw new Error(detail);
        }
        const info = await proxyRes.json();
        if (info.error) throw new Error(info.detail || info.error);

        const methodBUrl: string | null = info.methodBUrl || null;
        const saveName: string = info.fileName || fileName;

        if (!methodBUrl) {
          throw new Error(
            info.isPublicFallback
              ? "Filen er privat i Google Drive. Sæt adgang til 'Alle med linket' i Google Drive."
              : "Download-URL mangler. Kontakt support eller prøv igen."
          );
        }

        setProgress({ overall: 5, status: "Forbinder til Google Drive…" });

        // Fetch the file directly from Google (methodBUrl already has alt=media +
        // acknowledgeAbuse=true so no virus-scan interstitial will be returned).
        const driveRes = await fetch(methodBUrl, { signal: abort.signal });
        if (!driveRes.ok) {
          throw new Error(`Google Drive svarede med ${driveRes.status}`);
        }

        // Guard: if Google returns HTML instead of bytes (e.g. session cookie wall)
        const ct = driveRes.headers.get("Content-Type") || "";
        if (ct.includes("text/html")) {
          throw new Error(
            "Google Drive returnerede en HTML-side i stedet for fildata. " +
            "Kontrollér at filen er delt korrekt og prøv igen."
          );
        }

        if (!driveRes.body) {
          // No streaming API (old Safari) — fall back to blob via arrayBuffer
          setProgress({ overall: 10, status: "Downloader…" });
          const buf = await driveRes.arrayBuffer();
          const blob = new Blob([buf]);
          _triggerBlobDownload(blob, saveName);
          setProgress({ overall: 100, status: "Download startet — se din browsers download-bjælke.", done: true });
          setDownloadDone(true);
          return;
        }

        // Stream with progress — works on modern Safari 15.4+ (ReadableStream)
        const contentLength = driveRes.headers.get("Content-Length");
        const total = contentLength ? parseInt(contentLength, 10) : 0;
        const reader = driveRes.body.getReader();
        const chunks: Uint8Array[] = [];
        let received = 0;
        const startTime = Date.now();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          received += value.byteLength;

          const elapsedMs = Date.now() - startTime;
          const speedBps  = elapsedMs > 0 ? received / (elapsedMs / 1000) : 0;
          const pct = total > 0 ? Math.min(95, Math.round((received / total) * 100)) : 0;

          let status: string;
          if (total > 0 && speedBps > 0) {
            const remSec = (total - received) / speedBps;
            status = `Downloader… ${fmtGB(received)} / ${fmtGB(total)} — ${fmtTime(remSec)} tilbage`;
          } else if (total > 0) {
            status = `Downloader… ${fmtGB(received)} / ${fmtGB(total)}`;
          } else {
            status = `Downloader… ${fmtBytes(received)}`;
          }
          setProgress({ overall: pct, status });
        }

        // All bytes received — assemble blob and trigger save
        const blob = new Blob(chunks);
        _triggerBlobDownload(blob, saveName);
        setProgress({ overall: 100, status: "Download startet — se din browsers download-bjælke.", done: true });
        setDownloadDone(true);

      } else {
        // ── fsapiAvailable but not a ZIP: direct FSAPI stream from Google ──────
        // Get token from proxy (gofile-proxy default mode) then stream directly.
        setProgress({ overall: 0, status: "Henter filinfo…" });

        const proxyRes = await fetch(`/api/gofile-proxy?id=${encodeURIComponent(id)}`, { signal: abort.signal });
        if (!proxyRes.ok) {
          let detail = `Server fejl (${proxyRes.status})`;
          try { const b = await proxyRes.json(); detail = b.detail || b.error || detail; } catch { /* */ }
          throw new Error(detail);
        }
        const info = await proxyRes.json();
        if (info.error) throw new Error(info.detail || info.error);

        const { token, downloadUrl, methodBUrl, fileName: serverFileName, fileSizeBytes: serverSize } = info;
        const saveName = serverFileName || fileName;

        // Prefer FSAPI direct stream with SA token; fall back to Method B blob
        if (token && downloadUrl) {
          setProgress({ overall: 1, status: "Åbner gem-dialog…" });

          const handle = await (window as any).showSaveFilePicker({
            suggestedName: saveName,
            types: [{ description: "Fil", accept: { "application/octet-stream": [] } }],
          });

          setProgress({ overall: 3, status: "Forbinder til Google Drive…" });

          const response = await fetch(downloadUrl, {
            headers: { Authorization: `Bearer ${token}` },
            signal: abort.signal,
          });

          if (!response.ok) throw new Error(`Google Drive svarede med ${response.status}`);
          const ctCheck = response.headers.get("Content-Type") || "";
          if (ctCheck.includes("text/html")) {
            throw new Error("Google Drive returnerede en HTML-bekræftelsesside i stedet for fildata.");
          }
          if (!response.body) throw new Error("Din browser understøtter ikke streaming.");

          const contentLength = response.headers.get("Content-Length");
          const total = contentLength ? parseInt(contentLength, 10) : 0;
          const writable = await handle.createWritable();
          const reader = response.body.getReader();
          let received = 0;
          const startTime = Date.now();

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              await writable.write(value);
              received += value.byteLength;

              const elapsedMs = Date.now() - startTime;
              const speedBps  = elapsedMs > 0 ? received / (elapsedMs / 1000) : 0;
              const pct = total > 0 ? Math.min(99, Math.round((received / total) * 100)) : 0;

              let status: string;
              if (total > 0 && speedBps > 0) {
                const remSec = (total - received) / speedBps;
                status = `Downloader… ${fmtGB(received)} / ${fmtGB(total)} — ${fmtTime(remSec)} tilbage`;
              } else {
                status = `Downloader… ${fmtBytes(received)}`;
              }
              setProgress({ overall: pct, status });
            }
            await writable.close();
            setProgress({ overall: 100, status: "Download fuldført!", done: true });
            setDownloadDone(true);
          } catch (err) {
            await writable.abort();
            throw err;
          }
        } else if (methodBUrl) {
          // No SA token (public file) — use blob download (avoids .crswap)
          const sizeCheck = typeof serverSize === "number" ? serverSize : fileSizeBytes;
          if (!fsapiAvailable && sizeCheck > METHOD_B_MAX_BYTES) {
            throw new BrowserUnsupportedError(sizeCheck);
          }
          setProgress({ overall: 0, status: "Forbinder til Google Drive…" });
          const driveRes = await fetch(methodBUrl, { signal: abort.signal });
          if (!driveRes.ok) throw new Error(`Google Drive svarede med ${driveRes.status}`);
          const ctCheck2 = driveRes.headers.get("Content-Type") || "";
          if (ctCheck2.includes("text/html")) {
            throw new Error("Google Drive returnerede en HTML-side i stedet for fildata.");
          }
          const buf = await driveRes.arrayBuffer();
          _triggerBlobDownload(new Blob([buf]), saveName);
          setProgress({ overall: 100, status: "Download startet — se din browsers download-bjælke.", done: true });
          setDownloadDone(true);
        } else {
          throw new Error("Ingen gyldig download-URL tilgængelig. Kontakt support.");
        }
      }
    } catch (err: any) {
      if (err?.name === "AbortError") {
        setDownloading(false);
        setProgress(null);
        return;
      }
      if (err instanceof BrowserUnsupportedError) {
        setFileSizeBytes(err.fileSizeBytes);
        setSizeLoaded(true);
        setShowBrowserWall(true);
        setDownloading(false);
        setProgress(null);
        return;
      }
      console.error("Download error:", err);
      setDownloadError(err.message || "Download mislykkedes. Prøv igen.");
    } finally {
      setDownloading(false);
      abortRef.current = null;
    }
  }, [id, fileName, folderName, isZip, fsapiAvailable, fileSizeBytes]);

  // ── Render guards (after all hooks) ──────────────────────────────────────────

  if (!id) return null;

  // Still loading size — show spinner (applies to non-FSAPI browsers only until
  // we know whether to show the wall; FSAPI browsers proceed directly).
  if (!sizeLoaded && !fsapiAvailable) {
    return (
      <div className="min-h-screen bg-dark flex items-center justify-center pt-16 pb-8">
        <Loader size={28} className="text-neutral-500 animate-spin" />
      </div>
    );
  }

  if (showBrowserWall) {
    return <BrowserWall fileSizeBytes={fileSizeBytes} shareUrl={shareUrl} onNavigateHome={() => navigate("/")} />;
  }

  // ── Normal download UI ────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-dark flex items-center justify-center pt-16 pb-8">
      <div className="text-center max-w-md w-full px-4">

        <div className="mb-6">
          {downloadDone
            ? <CheckCircle2 size={52} className="mx-auto text-green-400" />
            : <Folder size={52} className="mx-auto text-primary" />
          }
        </div>

        <EditableContent contentKey="drive-download-ready-title" as="h1"
          className="text-2xl font-bold text-white mb-2" fallback="Klar til download" />
        <EditableContent contentKey="drive-download-ready-description" as="p"
          className="text-neutral-300 mb-6"
          fallback="Dine filer er klar. Klik knappen nedenfor for at starte download." />

        {/* ── Folder info card ── */}
        <div className="bg-neutral-800/40 border border-primary/30 rounded-xl p-4 mb-5 text-left">
          <div className="flex items-start gap-3 mb-3">
            <div className="mt-0.5 w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
              <Folder size={18} className="text-primary" />
            </div>
            <div>
              <p className="text-white font-semibold text-sm"><EditableContent contentKey="drive-download-dine-filer" fallback="Dine filer" /></p>
              <p className="text-neutral-400 text-xs mt-0.5">
                <EditableContent contentKey="drive-download-serveren-leverer-filerne-i-zip" fallback="Serveren leverer filerne i ZIP format." />
              </p>
            </div>
          </div>

          {folderInfoLoading && (
            <div className="flex items-center gap-2 text-xs text-neutral-400 mb-3">
              <Loader size={12} className="animate-spin" /> <EditableContent contentKey="drive-download-indlaeser-filliste" fallback="Indlæser filliste…" />
            </div>
          )}
          {folderInfoError && (
            <div className="text-xs text-amber-400 mb-3">
              <EditableContent contentKey="drive-download-kunne-ikke-indlaese-filliste" fallback="Kunne ikke indlæse filliste:" /> {folderInfoError}
            </div>
          )}
          {folderInfo && (
            <FolderInfoPanel
              folderInfo={folderInfo}
              expanded={folderInfoExpanded}
              onToggle={() => setFolderInfoExpanded((v) => !v)}
            />
          )}

          {/* Download progress */}
          {downloading && progress && (
            <div className="mb-3">
              <div className="flex justify-between text-xs text-neutral-300 mb-1.5">
                <span>{progress.status}</span>
                {progress.overall > 0 && <span>{progress.overall}%</span>}
              </div>
              <div className="w-full bg-neutral-700 rounded-full h-2 overflow-hidden">
                {progress.overall > 0
                  ? <div className="h-2 rounded-full bg-primary transition-all duration-300"
                      style={{ width: `${progress.overall}%` }} />
                  : <div className="h-2 rounded-full bg-primary animate-pulse w-full" />
                }
              </div>
            </div>
          )}
          {downloadDone && !downloading && (
            <p className="text-green-400 text-xs mb-3"><EditableContent contentKey="drive-download-download-fuldfoert-tjek-din-downloads" fallback="Download fuldført — tjek din downloads-mappe." /></p>
          )}
          {downloadError && (
            <div className="flex items-center gap-2 bg-red-900/30 border border-red-500/40 text-red-300 rounded-lg px-3 py-2 mb-3 text-xs">
              <AlertCircle size={13} className="shrink-0" />
              <span>{downloadError}</span>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <button
            onClick={handleDownload}
            disabled={downloading || downloadDone}
            className="flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors"
          >
            {downloading
              ? <Loader size={20} className="animate-spin" />
              : downloadDone
              ? <CheckCircle2 size={20} />
              : <Download size={20} />
            }
            {downloading
              ? "Downloader…"
              : downloadDone
              ? "Downloadet"
              : "Download dine filer"
            }
          </button>

          {shareUrl && (
            <a href={shareUrl.startsWith("http") ? shareUrl : `https://${shareUrl}`}
               target="_blank" rel="noopener noreferrer"
               className="flex items-center justify-center gap-2 bg-neutral-700 hover:bg-neutral-600 text-white font-semibold py-3 px-6 rounded-lg transition-colors">
              <Share2 size={20} />
              <EditableContent contentKey="drive-download-share-button" as="span" fallback="Del projekt" />
            </a>
          )}

          <button onClick={() => navigate("/")}
            className="flex items-center justify-center gap-2 bg-neutral-700 hover:bg-neutral-600 text-white font-semibold py-3 px-6 rounded-lg transition-colors">
            <Home size={20} />
            <EditableContent contentKey="drive-download-home-button" as="span" fallback="Til forside" />
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Blob download helper (avoids .crswap by delivering fully-loaded blob) ─────
// Using an object URL means the browser saves the file in a single atomic write
// rather than streaming it through the download manager's temp file mechanism.

function _triggerBlobDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  // Revoke after a short delay so the browser has time to initiate the save
  setTimeout(() => {
    URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }, 10_000);
}

export default DriveDownload;
