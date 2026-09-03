/**
 * google-drive-utils.ts
 *
 * Utilities for Google Drive upload, download, delete, search.
 *
 * ── Download strategy ─────────────────────────────────────────────────────────
 *
 * Vercel serverless functions have a hard 4.5 MB response-body limit and
 * Google deprecated ?access_token= query-param downloads in 2021.
 *
 *   Method A — File System Access API (Chromium desktop only):
 *     1. GET /api/gofile-proxy?id=<id>  →  { token, downloadUrl, ... }
 *     2. fetch(downloadUrl, { headers: { Authorization: "Bearer <token>" } })
 *     3. Stream chunks → showSaveFilePicker() writable stream
 *     File goes: Google → browser RAM (chunked) → disk. Vercel = 0 bytes.
 *     Supports files of any size. Shows real MB/MB progress.
 *
 *   Method B — ?alt=media&key=APIKEY (all browsers, file must be publicly shared):
 *     1. GET /api/gofile-proxy?id=<id>  →  { methodBUrl }
 *     2. Hidden <a href=methodBUrl> click — browser download manager takes over.
 *     Uses the Drive API alt=media endpoint with an API key instead of
 *     webContentLink, which bypasses the "cannot scan for virus" warning page
 *     that Google shows for large files on the usercontent.google.com domain.
 *     File goes: Google → browser directly. Vercel = 0 bytes.
 *     ⚠️  Blocked for files > 5 GB on non-FSAPI browsers — user is shown a
 *         "use Chrome/Edge/Opera/Brave" wall instead.
 *
 * FIXES applied:
 *   - FIX #2: FSAPI failure now preserves the original error detail in the
 *     fallback warning log, so root cause is not silently swallowed.
 *   - FIX #6: downloadGoogleDriveFile now returns { wasStreamed: boolean }.
 *     Method B returns wasStreamed=false so the caller can avoid showing a
 *     false "download complete" success state — the file is only handed to
 *     the browser's download manager, not confirmed saved to disk.
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

/**
 * FIX #6: Return value from downloadGoogleDriveFile.
 * wasStreamed=true  → Method A completed; file is confirmed written to disk.
 * wasStreamed=false → Method B fired; file is in the browser's download queue
 *                    but may not be saved yet. Do not show a success state.
 */
export interface DownloadResult {
  wasStreamed: boolean;
}

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

/**
 * Download the full file in one shot. Bytes go Google → browser, never Vercel.
 *
 * Method A (Chromium + File System Access API):
 *   Gets token from proxy, fetches Google directly with Authorization header,
 *   streams chunks straight to disk. Shows real MB/MB progress bar. Any size.
 *   Returns { wasStreamed: true } — file is confirmed on disk.
 *
 * Method B (?alt=media&key=APIKEY, all browsers, publicly shared files only):
 *   Hidden <a> click — browser download manager takes over. No progress bar.
 *   Bypasses the Google virus-scan interstitial (unlike webContentLink).
 *   Blocked for files > 5 GB — throws BrowserUnsupportedError instead.
 *   Returns { wasStreamed: false } — download is in progress but not confirmed.
 *
 * FIX #6: The return value lets callers distinguish between a confirmed save
 * (Method A) and a browser-managed download (Method B), so the UI can avoid
 * showing a false "download complete" checkmark for Method B.
 */
export async function downloadGoogleDriveFile(
  fileId: string,
  fileName: string = "download.zip",
  onProgress?: DownloadProgressCallback
): Promise<DownloadResult> {

  // ── Step 1: Get token + URLs from proxy (tiny JSON, safe on Vercel) ─────────
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

  const saveName   = serverFileName || fileName;
  const sizeBytes  = typeof fileSizeBytes === "number" ? fileSizeBytes : 0;
  const fsapiAvail = hasFSAPI();

  // ── Method A: File System Access API (Chromium, requires service account token) ─
  // Only available when FSAPI is supported and the SA has direct access.
  if (canStreamDirect && token && downloadUrl && fsapiAvail) {
    try {
      await _downloadViaFSAPI(token, downloadUrl, saveName, onProgress);
      return { wasStreamed: true };
    } catch (err: any) {
      if (err?.name === "AbortError") throw err; // user cancelled save dialog

      // FIX #2: Log the full original error so the root cause is preserved in
      // the console. Previously only err.message was logged, losing the stack
      // and any additional context from the FSAPI implementation.
      console.warn("[download] FSAPI failed, falling back to Method B:", err);
    }
  }

  // ── Method B: ?alt=media&key=APIKEY (all browsers, public files) ─────────
  // Guard: if file > 5 GB and browser has no FSAPI, refuse and show browser wall.
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
    throw new Error(
      "Download-URL mangler. Kontakt support eller prøv igen."
    );
  }

  _downloadViaAltMedia(methodBUrl, saveName, onProgress);

  // FIX #6: Return wasStreamed=false so the caller knows the file has only been
  // handed to the browser's download manager, not confirmed saved to disk.
  return { wasStreamed: false };
}

// ─── Method A implementation ──────────────────────────────────────────────────

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

  // Fetch directly from Google with the Authorization header.
  // This completely bypasses Vercel — bytes go Google → browser → disk.
  const response = await fetch(downloadUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error(`Google Drive svarede med ${response.status}`);
  }
  if (!response.body) {
    throw new Error("Din browser understøtter ikke streaming.");
  }

  const contentLength = response.headers.get("Content-Length");
  const total = contentLength ? parseInt(contentLength, 10) : 0;
  const writable = await handle.createWritable();
  const reader = response.body.getReader();
  let received = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      await writable.write(value);
      received += value.byteLength;
      const pct = total > 0 ? Math.min(99, Math.round((received / total) * 100)) : 0;
      const mb  = (received / 1_048_576).toFixed(1);
      onProgress?.({
        overall: pct,
        status: total > 0
          ? `Downloader… ${mb} MB / ${(total / 1_048_576).toFixed(1)} MB`
          : `Downloader… ${mb} MB`,
      });
    }
    await writable.close();
    onProgress?.({ overall: 100, status: "Download fuldført!", done: true });
  } catch (err) {
    await writable.abort();
    throw err;
  }
}

// ─── Method B implementation — ?alt=media&key=APIKEY ─────────────────────────
// Uses the Drive API directly instead of webContentLink, which avoids the
// "We can't scan this file for viruses" interstitial Google shows on usercontent.
//
// NOTE: This function returns immediately after triggering the browser download.
// The file is NOT confirmed saved to disk — it is in the browser's download queue.
// The caller receives wasStreamed=false and must not show a "complete" success state.

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

  // Do NOT set done:true here — the download has not completed.
  // The caller uses wasStreamed=false to handle this case appropriately.
  onProgress?.({
    overall: 100,
    status: "Download startet — se din browsers download-bjælke.",
  });
}
