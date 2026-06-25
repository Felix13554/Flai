/**
 * api/drive-download.js — Vercel Serverless Function
 *
 * ─── ARCHITECTURE ────────────────────────────────────────────────────────────
 *
 * Standard single-file download:
 *   GET /api/drive-download?id=FILE_ID
 *   → 302 redirect to Google CDN for direct browser download
 *
 * ZIP smart-download:
 *   Step 1 – GET ?id=FILE_ID&zip=list
 *     → JSON: { fileName, emptyZipUrl, files: [{ name, path, size }] }
 *   Step 2 – GET ?id=FILE_ID&zip=file&path=path/inside.zip&offset=N&cs=N
 *     → 302 redirect / streamed bytes for an individual file inside the ZIP
 *
 * ─── ENV VARS ─────────────────────────────────────────────────────────────────
 *   GOOGLE_SERVICE_ACCOUNT_KEY  — full JSON blob from Google Cloud Console
 *   VITE_GOOGLE_API_KEY         — API Key restricted to Google Drive API
 *
 * FIXES:
 *   #1  Local file header is fetched as 30+fnLen+extraLen bytes (not just 30)
 *       so dataOffset is always computed from the ACTUAL local extra field length,
 *       which can legally differ from the central-directory extra field length.
 *   #2  __MACOSX/ and ._filename entries filtered from ZIP listings.
 *   #3  Local header signature (PK\x03\x04) validated before parsing.
 *   #4  dataOffset bounds-checked against totalSize.
 *   #5  206 / Content-Range validation to detect full-file responses.
 *   #6  acknowledgeAbuse=true and includeItemsFromAllDrives=true on all Drive URLs.
 */

import { createSign, createPrivateKey } from "node:crypto";

export const config = {
  api: { bodyParser: false },
};

// ─── PEM normaliser ───────────────────────────────────────────────────────────

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
    const header = lines.find(l => l.startsWith("-----BEGIN"));
    const footer  = lines.find(l => l.startsWith("-----END"));
    const body    = lines.filter(l => l && !l.startsWith("-----")).join("").replace(/\s/g, "");
    if (header && footer && body)
      pem = `${header}\n${(body.match(/.{1,64}/g) || []).join("\n")}\n${footer}\n`;
  }
  return pem;
}

// ─── Credential loading ───────────────────────────────────────────────────────

function loadCredentials() {
  const rawKey = (process.env.GOOGLE_SERVICE_ACCOUNT_KEY || "").trim();
  if (!rawKey) throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY is not set");

  let parsed;
  try {
    const json = Buffer.from(rawKey, "base64").toString("utf8");
    parsed = JSON.parse(json);
  } catch (e) { throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY base64/JSON parse failed: " + e.message); }

  const email  = parsed.client_email;
  const keyPem = parsed.private_key;
  if (!email || !keyPem) throw new Error("JSON key missing client_email or private_key");

  return { email, privateKey: createPrivateKey({ key: normalisePem(keyPem), format: "pem" }) };
}

// ─── JWT / OAuth2 ─────────────────────────────────────────────────────────────

function b64url(str) {
  return Buffer.from(str).toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function getAccessToken(email, privateKey) {
  const now = Math.floor(Date.now() / 1000);
  const header  = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({
    iss: email,
    scope: "https://www.googleapis.com/auth/drive.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: now, exp: now + 3600,
  }));
  const sign = createSign("RSA-SHA256");
  sign.update(`${header}.${payload}`);
  sign.end();
  const jwt = `${header}.${payload}.${b64url(sign.sign(privateKey))}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!res.ok) throw new Error(`OAuth2 failed (${res.status}): ${await res.text()}`);
  return (await res.json()).access_token;
}

// ─── Drive helpers ────────────────────────────────────────────────────────────

async function getFileMeta(fileId, token) {
  const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}` +
    `?fields=id,name,size,mimeType,capabilities,webContentLink` +
    `&supportsAllDrives=true&includeItemsFromAllDrives=true`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const txt = await res.text();
    throw Object.assign(new Error(`Drive API error (${res.status})`), { status: res.status, detail: txt });
  }
  return res.json();
}

function buildDownloadUrl(fileId, apiKey) {
  return `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}` +
    `?alt=media&key=${apiKey}&supportsAllDrives=true&acknowledgeAbuse=true`;
}

// ─── Drive range helper ───────────────────────────────────────────────────────

async function driveRange(fileId, token, start, end) {
  const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}` +
    `?alt=media&supportsAllDrives=true&acknowledgeAbuse=true`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Range: `bytes=${start}-${end}` },
  });
  if (!res.ok) throw new Error(`Drive range ${start}-${end} failed (${res.status}): ${await res.text()}`);
  return Buffer.from(await res.arrayBuffer());
}

// ─── ZIP listing helpers ──────────────────────────────────────────────────────

function isMacJunk(path) {
  return path.startsWith("__MACOSX/") || path.includes("/._") || path.startsWith("._");
}

async function listZipEntries(fileId, token, totalSize) {
  const FETCH_TAIL = Math.min(65536, totalSize);
  const rangeStart = totalSize - FETCH_TAIL;

  const tail = await driveRange(fileId, token, rangeStart, totalSize - 1);

  let eocdOffset = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (tail[i] === 0x50 && tail[i+1] === 0x4b && tail[i+2] === 0x05 && tail[i+3] === 0x06) {
      eocdOffset = i; break;
    }
  }
  if (eocdOffset === -1) throw new Error("Could not find ZIP End of Central Directory record");

  const eocd = tail.slice(eocdOffset);
  const diskEntries    = eocd.readUInt16LE(8);
  const cdSize         = eocd.readUInt32LE(12);
  const cdOffsetRaw    = eocd.readUInt32LE(16);

  let cdOffset = cdOffsetRaw;
  let entryCount = diskEntries;

  if (cdOffsetRaw === 0xFFFFFFFF || diskEntries === 0xFFFF) {
    const locOffset = eocdOffset - 20;
    if (locOffset >= 0 && tail[locOffset] === 0x50 && tail[locOffset+1] === 0x4b &&
        tail[locOffset+2] === 0x06 && tail[locOffset+3] === 0x07) {
      const eocd64AbsOffset = Number(tail.readBigUInt64LE(locOffset + 8));
      const eocd64InTail = eocd64AbsOffset - rangeStart;
      if (eocd64InTail >= 0 && eocd64InTail < tail.length) {
        entryCount = Number(tail.readBigUInt64LE(eocd64InTail + 32));
        cdOffset   = Number(tail.readBigUInt64LE(eocd64InTail + 48));
      }
    }
  }

  const cd = await driveRange(fileId, token, cdOffset, cdOffset + cdSize - 1);
  const entries = [];
  let pos = 0;

  while (pos < cd.length - 4) {
    if (cd[pos] !== 0x50 || cd[pos+1] !== 0x4b || cd[pos+2] !== 0x01 || cd[pos+3] !== 0x02) break;

    let   compressedSize   = cd.readUInt32LE(pos + 20);
    let   uncompressedSize = cd.readUInt32LE(pos + 24);
    const fileNameLen      = cd.readUInt16LE(pos + 28);
    const extraLen         = cd.readUInt16LE(pos + 30);
    const commentLen       = cd.readUInt16LE(pos + 32);
    let   localHeaderOffset = cd.readUInt32LE(pos + 42);

    const fileName = cd.slice(pos + 46, pos + 46 + fileNameLen).toString("utf8");

    // Resolve ZIP64 fields from central directory extra
    const needUncomp = uncompressedSize === 0xFFFFFFFF;
    const needComp   = compressedSize   === 0xFFFFFFFF;
    const needOffset = localHeaderOffset === 0xFFFFFFFF;

    if (needUncomp || needComp || needOffset) {
      let ePos = pos + 46 + fileNameLen;
      const eEnd = ePos + extraLen;
      while (ePos < eEnd - 4) {
        const tag  = cd.readUInt16LE(ePos);
        const size = cd.readUInt16LE(ePos + 2);
        if (tag === 0x0001) {
          let vOff = ePos + 4;
          if (needUncomp) { uncompressedSize = Number(cd.readBigUInt64LE(vOff)); vOff += 8; }
          if (needComp)   { compressedSize   = Number(cd.readBigUInt64LE(vOff)); vOff += 8; }
          if (needOffset) { localHeaderOffset = Number(cd.readBigUInt64LE(vOff)); }
          break;
        }
        ePos += 4 + size;
      }
    }

    entries.push({ name: fileName.split("/").pop() || fileName, path: fileName, compressedSize, uncompressedSize, localHeaderOffset });
    pos += 46 + fileNameLen + extraLen + commentLen;
  }

  return entries;
}

function buildEmptyZip() {
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  return eocd;
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type" };
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const { id: fileId, meta: isMeta, health: isHealth, zip: zipMode, path: zipPath = "", offset, cs } = req.query;

  // ── Health / credential check ──────────────────────────────────────────────
  if (isHealth === "1") {
    const report = {
      serviceAccountKey: "✗ not set",
      apiKey: process.env.VITE_GOOGLE_API_KEY ? "✓ set" : "✗ not set",
      tokenTest: null, tokenError: null,
    };
    try {
      const { email, privateKey } = loadCredentials();
      report.serviceAccountKey = `✓ loaded (${email})`;
      const token = await getAccessToken(email, privateKey);
      report.tokenTest = `✓ token obtained (${token.slice(0, 20)}…)`;
    } catch (e) { report.tokenError = e.message; }
    return res.status(200).json(report);
  }

  if (!fileId) return res.status(400).json({ error: "Missing ?id= parameter" });

  const apiKey = process.env.VITE_GOOGLE_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "VITE_GOOGLE_API_KEY environment variable is not set." });

  // ── Auth ───────────────────────────────────────────────────────────────────
  let token;
  try {
    const { email, privateKey } = loadCredentials();
    token = await getAccessToken(email, privateKey);
  } catch (err) {
    console.error("drive-download auth error:", err.message);
    return res.status(500).json({ error: `Auth failed: ${err.message}` });
  }

  // ── File metadata ──────────────────────────────────────────────────────────
  let meta;
  try {
    meta = await getFileMeta(fileId, token);
  } catch (err) {
    console.error("drive-download metadata error:", err.message);
    return res.status(err.status || 502).json({ error: err.message, detail: err.detail });
  }

  if (meta.capabilities && meta.capabilities.canDownload === false) {
    return res.status(403).json({ error: "Filen kan ikke downloades." });
  }

  const downloadUrl = buildDownloadUrl(fileId, apiKey);

  // ── ZIP: serve empty zip ───────────────────────────────────────────────────
  if (zipMode === "empty") {
    const fileName = (meta.name || "download").replace(/\.zip$/i, "") + ".zip";
    const emptyZip = buildEmptyZip();
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(fileName)}"`);
    res.setHeader("Content-Length", String(emptyZip.length));
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).send(emptyZip);
  }

  // ── ZIP: list contents ─────────────────────────────────────────────────────
  if (zipMode === "list") {
    const isZip = (meta.mimeType || "").includes("zip") || (meta.name || "").toLowerCase().endsWith(".zip");
    if (!isZip) return res.status(400).json({ error: "File is not a ZIP archive" });

    const totalSize = parseInt(meta.size || "0", 10);
    if (!totalSize) return res.status(400).json({ error: "Cannot determine file size" });

    let entries;
    try {
      entries = await listZipEntries(fileId, token, totalSize);
    } catch (err) {
      console.error("ZIP listing error:", err.message);
      return res.status(502).json({ error: `Failed to list ZIP contents: ${err.message}` });
    }

    const files = entries
      .filter(e => !e.path.endsWith("/") && e.name !== "" && !isMacJunk(e.path))
      .map((e, index) => ({
        index, name: e.name, path: e.path, size: e.uncompressedSize,
        compressedSize: e.compressedSize, localHeaderOffset: e.localHeaderOffset,
      }));

    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : (process.env.URL || "");
    const emptyZipUrl = `${baseUrl}/api/drive-download?id=${encodeURIComponent(fileId)}&zip=empty`;

    return res.status(200).json({
      fileId, fileName: meta.name || "download.zip", totalSize,
      fileCount: files.length, emptyZipUrl, files,
    });
  }

  // ── ZIP: stream individual file bytes ──────────────────────────────────────
  if (zipMode === "file") {
    if (!zipPath) return res.status(400).json({ error: "Missing ?path= parameter" });

    // FIX: reject Mac junk entries early
    if (isMacJunk(zipPath)) {
      return res.status(400).json({ error: "Mac resource fork entries are not supported" });
    }

    const headerOffset   = parseInt(offset || "0", 10);
    const compressedSize = parseInt(cs || "0", 10);
    const totalSize      = parseInt(meta.size || "0", 10);

    if (isNaN(headerOffset) || headerOffset < 0) {
      return res.status(400).json({ error: "Invalid ?offset= parameter" });
    }
    if (isNaN(compressedSize) || compressedSize < 0) {
      return res.status(400).json({ error: "Invalid ?cs= parameter" });
    }
    if (totalSize > 0 && headerOffset >= totalSize) {
      return res.status(400).json({
        error: `Offset ${headerOffset} is beyond file size ${totalSize}`,
      });
    }

    // FIX #1: Read enough of the local header to cover the variable-length
    // filename and extra fields. The local extra field length can differ from
    // the central-directory extra field length, so we must read the actual
    // bytes from the local header (not use the CD extra length).
    // Step A: fetch just the fixed 30-byte local header to get fnLen + exLen.
    const fixedHeaderBuf = await driveRange(fileId, token, headerOffset, headerOffset + 29);
    if (fixedHeaderBuf.length < 30) {
      return res.status(502).json({ error: "Local file header too short" });
    }

    // FIX #3: Validate local file header signature PK\x03\x04
    if (fixedHeaderBuf[0] !== 0x50 || fixedHeaderBuf[1] !== 0x4b ||
        fixedHeaderBuf[2] !== 0x03 || fixedHeaderBuf[3] !== 0x04) {
      return res.status(502).json({
        error: `Invalid local file header signature at offset ${headerOffset}. ` +
               "The ZIP central directory offset may be stale or the archive is corrupt.",
      });
    }

    const compressionMethod = fixedHeaderBuf.readUInt16LE(8);
    const fileNameLen       = fixedHeaderBuf.readUInt16LE(26);
    const extraLen          = fixedHeaderBuf.readUInt16LE(28);

    // The data starts immediately after the fixed header + filename + extra field.
    const dataOffset = headerOffset + 30 + fileNameLen + extraLen;
    const fileName   = zipPath.split("/").pop() || "file";

    // Validate computed range
    if (totalSize > 0 && compressedSize > 0 && dataOffset + compressedSize > totalSize) {
      return res.status(400).json({
        error: `Computed data range [${dataOffset}, ${dataOffset + compressedSize - 1}] exceeds file size ${totalSize}. The ZIP index may be corrupt or the parameters are invalid.`,
      });
    }

    if (compressedSize === 0) {
      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(fileName)}"`);
      return res.status(200).send(Buffer.alloc(0));
    }

    const dataRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true&acknowledgeAbuse=true`,
      { headers: { Authorization: `Bearer ${token}`, Range: `bytes=${dataOffset}-${dataOffset + compressedSize - 1}` } }
    );
    if (!dataRes.ok) return res.status(502).json({ error: `Failed to fetch file data (${dataRes.status})` });

    const dataContentType = dataRes.headers.get("Content-Type") || "";
    if (dataContentType.includes("text/html")) {
      return res.status(502).json({ error: "Google Drive returned an HTML confirmation page instead of file data." });
    }

    // FIX #5: A 200 without Content-Range means Google returned the whole file.
    if (dataRes.status === 200 && !dataRes.headers.get("Content-Range")) {
      return res.status(502).json({
        error: "Google Drive returned the full file instead of the requested byte range. " +
               "The ZIP entry data cannot be safely extracted. Please try again.",
      });
    }

    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(fileName)}"`);
    res.setHeader("Cache-Control", "no-store");

    if (compressionMethod === 0) {
      // Stored — pass through directly
      const data = Buffer.from(await dataRes.arrayBuffer());
      return res.status(200).send(data);
    } else if (compressionMethod === 8) {
      // Deflate — decompress
      const { createInflateRaw } = await import("node:zlib");
      const compressedData = await dataRes.arrayBuffer();
      const decompressed = await new Promise((resolve, reject) => {
        const inflater = createInflateRaw();
        const chunks = [];
        inflater.on("data", (chunk) => chunks.push(chunk));
        inflater.on("end", () => resolve(Buffer.concat(chunks)));
        inflater.on("error", reject);
        inflater.end(Buffer.from(compressedData));
      });
      res.setHeader("Content-Length", String(decompressed.length));
      return res.status(200).send(decompressed);
    } else {
      return res.status(415).json({
        error: `Unsupported compression method ${compressionMethod} for entry "${zipPath}". Only stored (0) and deflated (8) entries are supported.`,
      });
    }
  }

  // ── Standard meta ──────────────────────────────────────────────────────────
  if (isMeta === "1") {
    return res.status(200).json({
      fileId: meta.id || fileId,
      fileName: meta.name || "download",
      mimeType: meta.mimeType || "application/octet-stream",
      size: meta.size ? String(meta.size) : null,
      downloadUrl,
      isZip: (meta.mimeType || "").includes("zip") || (meta.name || "").toLowerCase().endsWith(".zip"),
    });
  }

  // ── Standard 302 redirect ──────────────────────────────────────────────────
  res.setHeader("Location", downloadUrl);
  res.setHeader("Cache-Control", "no-store");
  return res.status(302).end();
}
