/**
 * DriveDownload.tsx
 *
 * Download flow — always via the browser's normal download mechanism:
 *   1. GET /api/gofile-proxy?id=<id>  →  { methodBUrl, fileName, fileSizeBytes }
 *   2. fetch(methodBUrl) → arrayBuffer → Blob → hidden <a download> click
 *      (or a plain <a> click when we don't need to track progress)
 *   Files land in the browser's normal Downloads folder. No File System
 *   Access API, no direct disk writes — simple and consistent everywhere.
 *   Files > 5 GB (METHOD_B_MAX_BYTES) show a browser-wall message instead,
 *   since buffering that much into RAM as a Blob isn't safe.
 *
 * React #310 on Safari: all hooks declared unconditionally.
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Download, Home, Share2, Loader, AlertCircle, CheckCircle2,
  Folder, ChevronDown, ChevronUp, File, Film,
} from "lucide-react";
import { createClient } from "@supabase/supabase-js";
import EditableContent from "./EditableContent";
import {
  getGoogleDriveFile,
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

// ─── File kind detection ────────────────────────────────────────────────────────
// Only extensions a plain <img> tag can actually render get a real thumbnail
// request — everything else falls back to a placeholder icon instantly,
// no network round-trip wasted on formats browsers can't decode (RAW, HEIC…).

const IMAGE_EXT = new Set(["jpg", "jpeg", "png", "gif", "webp", "bmp", "avif", "svg"]);
const VIDEO_EXT = new Set(["mp4", "mov", "avi", "mkv", "wmv", "m4v", "webm", "mts", "m2ts", "flv"]);

function getExt(name: string): string {
  const i = name.lastIndexOf(".");
  return i === -1 ? "" : name.slice(i + 1).toLowerCase();
}

function getFileKind(name: string): "image" | "video" | "other" {
  const ext = getExt(name);
  if (IMAGE_EXT.has(ext)) return "image";
  if (VIDEO_EXT.has(ext)) return "video";
  return "other";
}

// ─── File tile (Finder-style grid item) ────────────────────────────────────────

interface FileTileProps {
  file: FileEntry;
  driveId: string;
}

const FileTile: React.FC<FileTileProps> = ({ file, driveId }) => {
  const kind = getFileKind(file.name);
  const [imgFailed, setImgFailed] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const showImage = kind === "image" && !imgFailed;

  return (
    <div
      className="flex flex-col items-center gap-1 p-1 rounded-md hover:bg-neutral-700/40 transition-colors"
      title={file.name}
    >
      <div className="w-full aspect-square rounded-md bg-neutral-900/70 border border-neutral-700/50 overflow-hidden flex items-center justify-center relative">
        {showImage && !imgLoaded && (
          <div className="absolute inset-0 animate-pulse bg-neutral-700/40" />
        )}
        {showImage ? (
          <img
            src={`/api/gofile-proxy?id=${encodeURIComponent(driveId)}&mode=thumb&path=${encodeURIComponent(file.path)}`}
            alt={file.name}
            loading="lazy"
            decoding="async"
            className={`w-full h-full object-cover transition-opacity duration-300 ${imgLoaded ? "opacity-100" : "opacity-0"}`}
            onLoad={() => setImgLoaded(true)}
            onError={() => setImgFailed(true)}
          />
        ) : kind === "video" ? (
          <Film size={18} className="text-neutral-500" />
        ) : (
          <File size={18} className="text-neutral-500" />
        )}
      </div>
      <span className="text-[10px] text-neutral-400 leading-tight text-center w-full truncate">
        {file.name}
      </span>
    </div>
  );
};

// ─── Folder info panel ─────────────────────────────────────────────────────────

interface FolderInfoPanelProps {
  folderInfo: FolderInfo;
  expanded: boolean;
  onToggle: () => void;
  driveId: string;
}

// ─── Folder grouping ────────────────────────────────────────────────────────────

interface FileGroup {
  dirPath: string;   // "" for files at the root of the ZIP
  dirName: string;   // last path segment, for display
  files: FileEntry[];
}

function groupFilesByFolder(files: FileEntry[]): FileGroup[] {
  const groups = new Map<string, FileEntry[]>();
  for (const f of files) {
    const slash = f.path.lastIndexOf("/");
    const dirPath = slash === -1 ? "" : f.path.slice(0, slash);
    if (!groups.has(dirPath)) groups.set(dirPath, []);
    groups.get(dirPath)!.push(f);
  }
  // Root files first, then subfolders alphabetically.
  return Array.from(groups.entries())
    .sort(([a], [b]) => (a === "" ? -1 : b === "" ? 1 : a.localeCompare(b)))
    .map(([dirPath, groupFiles]) => ({
      dirPath,
      dirName: dirPath === "" ? "" : dirPath.split("/").pop() || dirPath,
      files: groupFiles,
    }));
}

const FolderInfoPanel: React.FC<FolderInfoPanelProps> = ({ folderInfo, expanded, onToggle, driveId }) => {
  const groups = React.useMemo(() => groupFilesByFolder(folderInfo.files), [folderInfo.files]);
  const hasSubfolders = groups.length > 1 || groups[0]?.dirPath !== "";

  return (
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
        <div className="border-t border-neutral-700/60 max-h-80 overflow-y-auto p-2 space-y-2">
          {groups.map((group) => (
            <div key={group.dirPath} className="rounded-md border border-neutral-700/50 bg-neutral-900/30 overflow-hidden">
              {hasSubfolders && (
                <div className="flex items-center gap-1.5 px-2 py-1.5 text-[11px] font-medium text-neutral-300 bg-neutral-800/50 border-b border-neutral-700/50">
                  <Folder size={12} className="text-primary shrink-0" />
                  <span className="truncate">
                    {group.dirPath === "" ? (
                      <EditableContent contentKey="drive-download-root-folder" fallback="Rodmappe" />
                    ) : group.dirName}
                  </span>
                  <span className="text-neutral-500 shrink-0">· {group.files.length}</span>
                </div>
              )}
              <div className="p-1.5">
                <div
                  className="grid gap-1"
                  style={{ gridTemplateColumns: "repeat(auto-fill, minmax(60px, 1fr))" }}
                >
                  {group.files.map((f) => (
                    <FileTile key={f.path} file={f} driveId={driveId} />
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Main component ────────────────────────────────────────────────────────────

const DriveDownload: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // ── ALL hooks declared unconditionally (fixes React #310 on Safari) ─────────
  // FSAPI is checked inside state/effect, never at module level, so hook order
  // is always identical regardless of browser capabilities.
  const [shareUrl,        setShareUrl]         = useState<string | null>(null);
  const [fileName,        setFileName]         = useState<string>("download");
  const [folderName,      setFolderName]       = useState<string>("download");
  const [fileSizeBytes,   setFileSizeBytes]    = useState<number>(0);
  const [sizeLoaded,      setSizeLoaded]       = useState<boolean>(false);
  const [isZip,           setIsZip]            = useState<boolean>(false);

  const [folderInfo,         setFolderInfo]         = useState<FolderInfo | null>(null);
  const [folderInfoLoading,  setFolderInfoLoading]  = useState(false);
  const [folderInfoError,    setFolderInfoError]    = useState<string | null>(null);
  const [folderInfoExpanded, setFolderInfoExpanded] = useState(true);

  const [downloading,   setDownloading]   = useState(false);
  const [downloadDone,  setDownloadDone]  = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [progress,      setProgress]      = useState<DownloadProgress | null>(null);

  // Whether we should show the browser wall (determined after sizeLoaded)
  const [showBrowserWall, setShowBrowserWall] = useState(false);

  // Abort controller ref so we can cancel in-flight downloads
  const abortRef = useRef<AbortController | null>(null);

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

  // ── Decide browser wall once we know the file size ───────────────────────────
  useEffect(() => {
    if (!sizeLoaded) return;
    if (fileSizeBytes > METHOD_B_MAX_BYTES) {
      setShowBrowserWall(true);
    }
  }, [sizeLoaded, fileSizeBytes]);

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
      // Guard: >5 GB is too risky to buffer as a Blob in RAM.
      if (fileSizeBytes > METHOD_B_MAX_BYTES) {
        throw new BrowserUnsupportedError(fileSizeBytes);
      }

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
      const serverSize = typeof info.fileSizeBytes === "number" ? info.fileSizeBytes : fileSizeBytes;

      if (serverSize > METHOD_B_MAX_BYTES) {
        throw new BrowserUnsupportedError(serverSize);
      }

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
        // No streaming API (old Safari) — fall back to plain arrayBuffer
        setProgress({ overall: 10, status: "Downloader…" });
        const buf = await driveRes.arrayBuffer();
        _triggerBlobDownload(new Blob([buf]), saveName);
        setProgress({ overall: 100, status: "Download startet — se din browsers download-bjælke.", done: true });
        setDownloadDone(true);
        return;
      }

      // Stream with progress, then hand the finished Blob to the browser's
      // normal download mechanism — simple, and works the same everywhere.
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

      // All bytes received — assemble blob and trigger the browser download.
      const blob = new Blob(chunks);
      _triggerBlobDownload(blob, saveName);
      setProgress({ overall: 100, status: "Download startet — se din browsers download-bjælke.", done: true });
      setDownloadDone(true);
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
  }, [id, fileName, fileSizeBytes]);

  // ── Render guards (after all hooks) ──────────────────────────────────────────

  if (!id) return null;

  // Still loading size — show spinner until we know whether to show the wall.
  if (!sizeLoaded) {
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
              driveId={id}
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
