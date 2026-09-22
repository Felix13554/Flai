/**
 * DriveDownload.tsx
 *
 * Download flow — a single native browser download, no client-side JS
 * buffering at all:
 *   1. Click the download button → hidden <a> click against
 *      /api/gofile-proxy?id=<id>&mode=raw
 *   2. Our server authenticates with Google Drive, opens a stream, and pipes
 *      the bytes straight through with Content-Disposition: attachment set.
 *   3. The browser sees a normal attachment response and handles it exactly
 *      like downloading from any file server — it shows up instantly in the
 *      native downloads tray and streams to disk from the first byte. No
 *      fetch(), no Blob, no size ceiling, no browser-support wall needed.
 *
 * React #310 on Safari: all hooks declared unconditionally.
 */

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Download, Home, Share2, Loader, AlertCircle, CheckCircle2,
  Folder, ChevronDown, ChevronUp, File, Film,
} from "lucide-react";
import { createClient } from "@supabase/supabase-js";
import EditableContent from "./EditableContent";
import { getGoogleDriveFile } from "../utils/google-drive-utils";

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

// ─── Helpers ───────────────────────────────────────────────────────────────────

function fmtBytes(bytes: number): string {
  if (bytes >= 1_073_741_824) return (bytes / 1_073_741_824).toFixed(2) + " GB";
  if (bytes >= 1_048_576)     return (bytes / 1_048_576).toFixed(1) + " MB";
  if (bytes >= 1_024)         return (bytes / 1_024).toFixed(0) + " KB";
  return bytes + " B";
}

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
  // No fetch(), no Blob, no client-side buffering: a single click against our
  // own /api/gofile-proxy?mode=raw endpoint, which streams the file through
  // with Content-Disposition: attachment set. The browser takes it from
  // there exactly like any normal file download — native downloads tray,
  // native progress, disk from the first byte.
  const handleDownload = useCallback(() => {
    if (!id) return;

    setDownloading(true);
    setDownloadDone(false);
    setDownloadError(null);
    setProgress({ overall: 0, status: "Download startet — se din browsers download-bjælke." });

    try {
      _triggerNativeDownload(`/api/gofile-proxy?id=${encodeURIComponent(id)}&mode=raw`);
    } catch (err: any) {
      console.error("Download error:", err);
      setDownloadError(err.message || "Download mislykkedes. Prøv igen.");
      setDownloading(false);
      setProgress(null);
      return;
    }

    // We hand off to the browser's own download manager here, so we can't
    // track byte-level progress from JS — just reflect that it started.
    window.setTimeout(() => {
      setDownloading(false);
      setDownloadDone(true);
      setProgress({ overall: 100, status: "Download startet — se din browsers download-bjælke.", done: true });
    }, 600);
  }, [id]);

  // ── Render guards (after all hooks) ──────────────────────────────────────────

  if (!id) return null;

  // Still loading file metadata.
  if (!sizeLoaded) {
    return (
      <div className="min-h-screen bg-dark flex items-center justify-center pt-16 pb-8">
        <Loader size={28} className="text-neutral-500 animate-spin" />
      </div>
    );
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
            <p className="text-green-400 text-xs mb-3"><EditableContent contentKey="drive-download-download-fuldfoert-tjek-din-downloads" fallback="Download påbegyndt" /></p>
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

// ─── Native download trigger ────────────────────────────────────────────────
// Same-origin click against our streaming endpoint. No object URL, no Blob —
// the server response itself carries Content-Disposition: attachment, so the
// browser starts a real native download the instant the click fires.

function _triggerNativeDownload(url: string): void {
  const a = document.createElement("a");
  a.href = url;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => document.body.removeChild(a), 5_000);
}

export default DriveDownload;
