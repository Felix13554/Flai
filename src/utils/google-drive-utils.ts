/**
 * google-drive-utils.ts
 *
 * Utilities for Google Drive upload, download, delete, search.
 *
 * ── Download strategy ─────────────────────────────────────────────────────────
 *
 *   Always uses the browser's normal download mechanism (?alt=media&key=APIKEY,
 *   a hidden <a> click, or a fetched Blob when we need to force a filename).
 *   No File System Access API, no direct disk writes — the browser's own
 *   download manager and Downloads folder handle everything. Simple and
 *   consistent across all browsers.
 *
 *   Blocked for files > 5 GB (METHOD_B_MAX_BYTES) since loading a Blob that
 *   large into RAM is unsafe.
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

/** Thrown when the file exceeds the safe browser-download limit (5 GB). */
export class BrowserUnsupportedError extends Error {
  public readonly fileSizeBytes: number;
  constructor(fileSizeBytes: number) {
    super("BROWSER_UNSUPPORTED_LARGE_FILE");
    this.name = "BrowserUnsupportedError";
    this.fileSizeBytes = fileSizeBytes;
  }
}

/** 5 GB — above this, loading the file into a Blob in RAM is too risky. */
export const METHOD_B_MAX_BYTES = 5 * 1024 * 1024 * 1024;

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
    methodBUrl,
    fileName: serverFileName,
    fileSizeBytes,
    isPublicFallback,
  } = info;

  const saveName  = serverFileName || fileName;
  const sizeBytes = typeof fileSizeBytes === "number" ? fileSizeBytes : 0;

  if (sizeBytes > METHOD_B_MAX_BYTES) {
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
