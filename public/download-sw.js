/**
 * public/download-sw.js — Download Service Worker
 *
 * HOW IT WORKS:
 * The File System Access API (showSaveFilePicker) writes to a TEMPORARY file
 * in Chrome's sandboxed storage and only copies it to the real destination on
 * close(). For files >~10 GB this hits Chrome's storage quota and the download
 * silently stops. The FSAPI temp file is the root cause — it is not avoidable.
 *
 * The real solution: make the browser treat the download like a normal server
 * response. When a server sends:
 *   Content-Disposition: attachment; filename="file.zip"
 *   Content-Type: application/octet-stream
 * the browser pipes bytes straight from the TCP socket to the OS download
 * manager — no temp file, no quota, no JS memory, any size.
 *
 * We replicate this by:
 *   1. Main thread registers this SW and sends it { token, downloadUrl, fileName }
 *      via postMessage, keyed by a unique download ID.
 *   2. Main thread navigates to /sw-download/<id> (a synthetic URL).
 *   3. This SW intercepts that fetch, fetches Google Drive using the Bearer token,
 *      and calls respondWith(new Response(googleStream, { headers: { Content-Disposition: attachment } })).
 *   4. The browser sees a normal attachment response and downloads it natively —
 *      bytes flow: Google CDN → SW fetch → browser download manager → disk.
 *      Zero JS memory. Zero temp files. No size limit.
 *
 * Progress: the main thread tracks bytes by intercepting the ReadableStream
 * through a TransformStream before handing it to the SW response.
 *
 * NOTE: SW scope must cover /sw-download/ — register with scope: '/' or '/sw-download/'.
 */

const DOWNLOAD_PREFIX = '/sw-download/';

// Pending downloads map: id → { token, downloadUrl, fileName, port }
// The port is a MessageChannel port used to stream progress back to the main thread.
const pending = new Map();

self.addEventListener('message', (event) => {
  const { type, id, token, downloadUrl, fileName, port } = event.data || {};
  if (type === 'REGISTER_DOWNLOAD') {
    pending.set(id, { token, downloadUrl, fileName, port });
  }
  if (type === 'CANCEL_DOWNLOAD') {
    pending.delete(id);
  }
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (!url.pathname.startsWith(DOWNLOAD_PREFIX)) return;

  const id = url.pathname.slice(DOWNLOAD_PREFIX.length);
  const entry = pending.get(id);
  if (!entry) return; // not our download

  pending.delete(id); // consume — one-shot

  event.respondWith(handleDownload(entry));
});

async function handleDownload({ token, downloadUrl, fileName, port }) {
  try {
    const response = await fetch(downloadUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      port?.postMessage({ type: 'ERROR', message: `Google Drive svarede med ${response.status}` });
      return new Response(`Download failed: ${response.status}`, { status: 502 });
    }

    const contentType = (response.headers.get('Content-Type') || '');
    if (contentType.includes('text/html')) {
      port?.postMessage({ type: 'ERROR', message: 'Google Drive returnerede en HTML-bekræftelsesside. Prøv igen.' });
      return new Response('HTML interstitial received instead of file data', { status: 502 });
    }

    const contentLength = response.headers.get('Content-Length');
    const total = contentLength ? parseInt(contentLength, 10) : 0;

    port?.postMessage({ type: 'START', total });

    // Wrap the body in a TransformStream that reports byte counts back to
    // the main thread via the MessageChannel port. The transform is a pure
    // passthrough — it never buffers, never copies, never accumulates.
    let received = 0;
    const startTime = Date.now();

    const { readable, writable } = new TransformStream({
      transform(chunk, controller) {
        controller.enqueue(chunk);
        received += chunk.byteLength;
        const elapsedMs = Date.now() - startTime;
        const speedBps = elapsedMs > 0 ? (received / (elapsedMs / 1000)) : 0;
        port?.postMessage({ type: 'PROGRESS', received, total, speedBps });
      },
      flush() {
        port?.postMessage({ type: 'DONE', received });
      },
    });

    // Pipe Google's response body through our progress transform.
    // Do NOT await — this must not block respondWith() from returning the Response.
    response.body.pipeTo(writable).catch((err) => {
      port?.postMessage({ type: 'ERROR', message: err.message });
    });

    // Return the readable end to the browser as a native attachment download.
    // The browser downloads this exactly like a file from a real server.
    const safeFileName = encodeURIComponent(fileName).replace(/%20/g, ' ');
    return new Response(readable, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${safeFileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        ...(contentLength ? { 'Content-Length': contentLength } : {}),
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    port?.postMessage({ type: 'ERROR', message: err.message });
    return new Response(`Download error: ${err.message}`, { status: 500 });
  }
}
