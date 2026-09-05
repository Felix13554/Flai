/**
 * google-drive-utils.ts
 *
 * Utilities for Google Drive upload, download, delete, search.
 *
 * ── Download strategy ─────────────────────────────────────────────────────────
 *
 *   Method A — File System Access API (Chromium desktop only):
 *     1. GET /api/gofile-proxy?id=<id>  →  { token, downloadUrl, ... }
 *     2. fetch(downloadUrl, { headers: { Authorization: "Bearer <token>" } })
 *     3. Stream via response.body.pipeThrough(progressTransform).pipeTo(writable)
 *     File goes: Google → browser → disk. Vercel = 0 bytes.
 *     Supports files of any size. Shows real GB/GB progress + ETA.
 *
 *   Method B — ?alt=media&key=APIKEY (all browsers, publicly shared files):
 *     Hidden <a> click — browser download manager takes over.
 *     Blocked for files > 5 GB on non-FSAPI browsers.
 *
 * FIXES:
 *   #1  _downloadViaFSAPI now uses native ReadableStream.pipeThrough() +
 *       WritableStream.pipeTo() instead of a manual JS read loop.  This removes
 *       the JS scheduler from the hot path and improves throughput on large files.
 *
 *   #2  createWritable() is called with { keepExistingData: false } (explicit).
 *       Without this flag some Chromium versions keep stale bytes from a
 *       previous file when the user picks an existing file and clicks "Replace",
 *       which caused the download to stall at ~7 KB and never complete.
 *
 *   #3  A progress TransformStream replaces the old manual chunk-counting loop,
 *       decoupling progress tracking from the write path entirely.
 */

export interface GoogleDriveUploadResult {
  success: boolean;
  fileId: string;
  fileName: string;
  webViewLink: string;
  webContentLink: string;
}

export interface GoogleDriveFileInfo {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  webViewLink: string;
  webContentLink: string;
  isZip?: boolean;
}

export type DownloadProgressCallback = (event: {
  overall: number;
  status: string;
  done?: boolean;
  error?: string;
}) => void;

/** Thrown when the browser lacks FSAPI and the file exceeds the safe Method B limit (5 GB). */
export class BrowserUnsupportedError extends Error {
  public readonly fileSizeBytes: number;
  constructor(fileSizeBytes: number) {
    super("BROWSER_UNSUPPORTED_LARGE_FILE");
    this.name = "BrowserUnsupportedError";
    this.fileSizeBytes = fileSizeBytes;
  }
}

/** 5 GB — above this, Method B (browser download manager) is too risky without FSAPI. */
export const METHOD_B_MAX_BYTES = 5 * 1024 * 1024 * 1024;

/** Returns true if the browser supports File System Access API (needed for large files). */
export function hasFSAPI(): boolean {
  return typeof window !== "undefined" && "showSaveFilePicker" in window;
}

// ─── Upload ────────────────────────────────────────────────────────────────────

export async function uploadToGoogleDrive(
  file: File,
  onProgress?: (progress: number) => void
): Promise<GoogleDriveUploadResult> {
  onProgress?.(0);

  const fileData = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? result);
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });

  onProgress?.(50);

  return new Promise<GoogleDriveUploadResult>((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(50 + Math.round((e.loaded / e.total) * 50));
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status === 200) {
        try {
          resolve(JSON.parse(xhr.responseText) as GoogleDriveUploadResult);
          onProgress?.(100);
        } catch {
          reject(new Error("Invalid response from upload proxy"));
        }
      } else {
        let message = `Upload failed (HTTP ${xhr.status})`;
        try {
          const errBody = JSON.parse(xhr.responseText);
          if (errBody?.error) message = errBody.error;
        } catch { /* ignore */ }
        reject(new Error(message));
      }
    });

    xhr.addEventListener("error", () => reject(new Error("Network error during upload")));

    xhr.open("POST", "/api/google-drive-upload");
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.send(JSON.stringify({
      fileData,
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
    }));
  });
}

// ─── Metadata ─────────────────────────────────────────────────────────────────

export async function getGoogleDriveFile(fileId: string): Promise<GoogleDriveFileInfo> {
  const res = await fetch(`/api/gofile-proxy?id=${encodeURIComponent(fileId)}`);
  if (!res.ok) throw new Error(`Failed to get file info: ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.detail || data.error);
  const id = data.fileId || fileId;
  return {
    id,
    name:           data.fileName || "download",
    size:           parseInt(data.size || "0", 10),
    mimeType:       data.mimeType || "application/octet-stream",
    webViewLink:    `https://drive.google.com/file/d/${id}/view`,
    webContentLink: data.webContentLink || "",
    isZip:          data.isZip ?? false,
  };
}

// ─── Delete ────────────────────────────────────────────────────────────────────

export async function deleteGoogleDriveFile(fileId: string): Promise<boolean> {
  const response = await fetch(
    `/api/google-drive-upload?deleteId=${fileId}`,
    { method: "DELETE" }
  );
  if (!response.ok) throw new Error(`Failed to delete file: ${response.status}`);
  return true;
}

// ─── URL helpers ───────────────────────────────────────────────────────────────

export function extractGoogleDriveId(url: string): string | null {
  if (!url) return null;
  const appRoute = url.match(/\/file\/gdrive\/([a-zA-Z0-9_-]+)/);
  if (appRoute) return appRoute[1];
  if (!url.includes("/") && !url.includes("http")) return url;
  const fileMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileMatch) return fileMatch[1];
  const idMatch = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idMatch) return idMatch[1];
  const ucMatch = url.match(/uc\?.*id=([a-zA-Z0-9_-]+)/);
  if (ucMatch) return ucMatch[1];
  return null;
}

/**
 * extractGoogleDriveIdOrFolder
 *
 * Like extractGoogleDriveId, but also recognises Drive *folder* URLs and tells
 * the caller whether the resolved ID is a folder or a single file. Used by the
 * preview-link admin form, where the admin can paste either a link to one
 * photo/video file, or a link to a folder containing multiple photos.
 *
 * Recognised formats:
 *   https://drive.google.com/drive/folders/FOLDER_ID
 *   https://drive.google.com/drive/u/0/folders/FOLDER_ID
 *   https://drive.google.com/file/d/FILE_ID/view
 *   https://drive.google.com/open?id=FILE_ID
 *   a bare ID pasted directly
 */
export function extractGoogleDriveIdOrFolder(
  url: string
): { id: string; isFolder: boolean } | null {
  if (!url) return null;
  const trimmed = url.trim();

  const folderMatch = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (folderMatch) return { id: folderMatch[1], isFolder: true };

  const fileId = extractGoogleDriveId(trimmed);
  if (fileId) return { id: fileId, isFolder: false };

  // Bare ID pasted with no URL wrapper at all — assume a file, the backend
  // /api/drive-preview?mode=meta call will correct this if it's actually a folder.
  if (/^[a-zA-Z0-9_-]{10,}$/.test(trimmed)) return { id: trimmed, isFolder: false };

  return null;
}

// ─── Drive folder search ───────────────────────────────────────────────────────

export interface DriveFolderSearchResult {
  id: string;
  name: string;
  size: string | null;
  mimeType: string;
  modifiedTime: string | null;
  webViewLink: string;
  downloadUrl: string;
}

export async function searchDriveFolder(
  query: string,
  folderId?: string
): Promise<DriveFolderSearchResult[]> {
  const params = new URLSearchParams({ q: query });
  if (folderId) params.set("folderId", folderId);
  const res = await fetch(`/api/drive-folder-search?${params.toString()}`);
  if (!res.ok) {
    let msg = `Search failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) msg = body.error;
    } catch { /* ignore */ }
    throw new Error(msg);
  }
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return (data.files || []) as DriveFolderSearchResult[];
}

// ─── Download ─────────────────────────────────────────────────────────────────

export async function downloadGoogleDriveFile(
  fileId: string,
  fileName: string = "download.zip",
  onProgress?: DownloadProgressCallback
): Promise<{ wasStreamed: boolean }> {

  onProgress?.({ overall: 0, status: "Henter filinfo…" });

  const proxyRes = await fetch(`/api/gofile-proxy?id=${encodeURIComponent(fileId)}`);
  if (!proxyRes.ok) {
    let detail = `Server fejl (${proxyRes.status})`;
    try {
      const body = await proxyRes.json();
      detail = body.detail || body.error || detail;
    } catch { /* ignore */ }
    throw new Error(detail);
  }

  const info = await proxyRes.json();
  if (info.error) throw new Error(info.detail || info.error);

  const {
    token,
    downloadUrl,
    methodBUrl,
    fileName: serverFileName,
    fileSizeBytes,
    canStreamDirect,
    isPublicFallback,
  } = info;

  const saveName    = serverFileName || fileName;
  const sizeBytes   = typeof fileSizeBytes === "number" ? fileSizeBytes : 0;
  const fsapiAvail  = hasFSAPI();

  // ── Method A: File System Access API ──────────────────────────────────────
  if (canStreamDirect && token && downloadUrl && fsapiAvail) {
    try {
      await _downloadViaFSAPI(token, downloadUrl, saveName, onProgress);
      return { wasStreamed: true };
    } catch (err: any) {
      if (err?.name === "AbortError") throw err;
      console.warn("[download] FSAPI failed, falling back to Method B:", err.message);
    }
  }

  // ── Method B ──────────────────────────────────────────────────────────────
  if (!fsapiAvail && sizeBytes > METHOD_B_MAX_BYTES) {
    throw new BrowserUnsupportedError(sizeBytes);
  }

  if (!methodBUrl) {
    if (isPublicFallback) {
      throw new Error(
        "Filen er privat i Google Drive. " +
        "Sæt adgang til 'Alle med linket' i Google Drive, eller del filen direkte med service-kontoen."
      );
    }
    throw new Error("Download-URL mangler. Kontakt support eller prøv igen.");
  }

  _downloadViaAltMedia(methodBUrl, saveName, onProgress);
  return { wasStreamed: false };
}

// ─── Method A implementation ──────────────────────────────────────────────────
//
// FIX #1: Uses response.body.pipeThrough(progressTransform).pipeTo(writable)
//   — native Web Streams pipe with no JS scheduler in the hot path.
//
// FIX #2: createWritable({ keepExistingData: false }) is passed explicitly.
//   Without this, replacing an existing file in some Chromium builds keeps
//   stale bytes from the previous file, causing the download to appear to
//   complete at ~7 KB while the rest of the stream is silently discarded.
//
// FIX #3: Progress is tracked via a TransformStream that counts bytes as they
//   pass through, fully decoupled from the write path.

async function _downloadViaFSAPI(
  token: string,
  downloadUrl: string,
  fileName: string,
  onProgress?: DownloadProgressCallback
): Promise<void> {
  onProgress?.({ overall: 1, status: "Åbner gem-dialog…" });

  const handle = await (window as any).showSaveFilePicker({
    suggestedName: fileName,
    types: [{
      description: "ZIP Archive",
      accept: { "application/zip": [".zip"], "application/octet-stream": [] },
    }],
  });

  onProgress?.({ overall: 3, status: "Forbinder til Google Drive…" });

  const response = await fetch(downloadUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error(`Google Drive svarede med ${response.status}`);
  }
  if (!response.body) {
    throw new Error("Din browser understøtter ikke streaming.");
  }

  const contentType = response.headers.get("Content-Type") || "";
  if (contentType.includes("text/html")) {
    throw new Error(
      "Google Drive returnerede en HTML-bekræftelsesside i stedet for fildata. " +
      "Kontrollér at filen er delt korrekt og prøv igen."
    );
  }

  const contentLength = response.headers.get("Content-Length");
  const total = contentLength ? parseInt(contentLength, 10) : 0;
  const startTime = Date.now();
  let received = 0;

  /** Format bytes as GB with 3 decimal places */
  function fmtGB(bytes: number): string {
    return (bytes / 1_073_741_824).toFixed(3) + " GB";
  }

  /** Format seconds as "Xm Ys" or "Xs" */
  function fmtTime(seconds: number): string {
    if (seconds < 60) return `${Math.ceil(seconds)}s`;
    const m = Math.floor(seconds / 60);
    const s = Math.ceil(seconds % 60);
    return `${m}m ${s}s`;
  }

  // FIX #3: Progress TransformStream — counts bytes as they flow through,
  // then passes them on unmodified to the writable.
  const progressTransform = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      received += chunk.byteLength;

      const pct = total > 0 ? Math.min(99, Math.round((received / total) * 100)) : 0;
      const elapsedMs = Date.now() - startTime;
      const speedBps  = elapsedMs > 0 ? (received / (elapsedMs / 1000)) : 0;

      let status: string;
      if (total > 0) {
        const receivedGB = fmtGB(received);
        const totalGB    = fmtGB(total);
        if (speedBps > 0) {
          const remainingSec = (total - received) / speedBps;
          status = `Downloader… ${receivedGB} / ${totalGB} — ${fmtTime(remainingSec)} tilbage`;
        } else {
          status = `Downloader… ${receivedGB} / ${totalGB}`;
        }
      } else {
        status = `Downloader… ${fmtGB(received)}`;
      }

      onProgress?.({ overall: pct, status });
      controller.enqueue(chunk);
    },
  });

  // FIX #2: Pass keepExistingData: false so any pre-existing file content is
  // truncated before writing begins.  This prevents the "replace → 7 KB stuck"
  // bug where the new stream appears to finish instantly because the writable
  // was never actually truncated and reports success after the first few KB.
  const writable = await handle.createWritable({ keepExistingData: false });

  try {
    // FIX #1: Native pipe — no JS read loop, no backpressure management needed.
    await response.body
      .pipeThrough(progressTransform)
      .pipeTo(writable);

    onProgress?.({ overall: 100, status: "Download fuldført!", done: true });
  } catch (err) {
    // pipeTo() closes the writable on success and aborts on error.
    // If it throws, the writable has already been aborted by the stream
    // machinery, so we just re-throw.
    throw err;
  }
}

// ─── Method B implementation — ?alt=media&key=APIKEY ─────────────────────────

function _downloadViaAltMedia(
  url: string,
  fileName: string,
  onProgress?: DownloadProgressCallback
): void {
  onProgress?.({
    overall: 0,
    status: "Download startet — se din browsers download-bjælke.",
  });

  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => document.body.removeChild(a), 10_000);

  onProgress?.({
    overall: 100,
    status: "Download startet — se din browsers download-bjælke.",
    done: true,
  });
}
