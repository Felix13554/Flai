/**
 * api/gofile-proxy.js — Vercel Serverless Function
 *
 * Google Drive authenticated download proxy + server-side ZIP extraction.
 *
 * ENDPOINTS:
 *
 *   GET /api/gofile-proxy?id=FILE_ID
 *     → JSON { token, downloadUrl, methodBUrl, fileName, fileSizeBytes, isZip, ... }
 *
 *   GET /api/gofile-proxy?id=FILE_ID&mode=info
 *     → JSON { fileCount, totalUncompressedBytes, files: [...] }
 *
 *   GET /api/gofile-proxy?id=FILE_ID&mode=stream
 *     → Streams a stored ZIP (no recompression) to the browser via chunked transfer.
 *
 * FIXES:
 *   #1  fetchAndInflate: local header now fetches 30+fnLen+exLen bytes in two
 *       passes so dataStart is computed from the ACTUAL local extra length, which
 *       can differ from the central-directory extra length.  Previously only 30
 *       bytes were fetched, so dataStart was wrong whenever exLen > 0, causing
 *       corrupted or truncated file content.
 *   #2  __MACOSX/ and ._filename entries filtered from stream + info modes.
 *   #3  stream mode: files are inflated and streamed in chunks rather than
 *       accumulated into a single Buffer, preventing OOM on large ZIPs.
 *   #4  sanitisePaths: common prefix is now detected across ALL entries (not
 *       just entries[0]) so unsorted ZIPs are stripped correctly.
 */

import { createSign, createPrivateKey } from "crypto";
import { createInflateRaw } from "node:zlib";

export const config = {
  api: {
    bodyParser: false,
    responseLimit: false,
  },
};

// ─── PEM normaliser ────────────────────────────────────────────────────────────

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
    const footer  = lines.find((l) => l.startsWith("-----END"));
    const body    = lines.filter((l) => l && !l.startsWith("-----")).join("").replace(/\s/g, "");
    if (header && footer && body.length > 0) {
      pem = `${header}\n${(body.match(/.{1,64}/g) || []).join("\n")}\n${footer}\n`;
    }
  }
  return pem;
}

// ─── Credential loading ────────────────────────────────────────────────────────

function loadCredentials() {
  const rawKey = (process.env.GOOGLE_SERVICE_ACCOUNT_KEY || "").trim();
  if (!rawKey) {
    throw Object.assign(
      new Error("GOOGLE_SERVICE_ACCOUNT_KEY env var is not set"),
      { statusCode: 500 }
    );
  }
  let parsed;
  try {
    const json = Buffer.from(rawKey, "base64").toString("utf8");
    parsed = JSON.parse(json);
  } catch (e) {
    throw Object.assign(
      new Error("Could not parse GOOGLE_SERVICE_ACCOUNT_KEY. Must be base64-encoded JSON. Error: " + e.message),
      { statusCode: 500 }
    );
  }
  const { client_email, private_key } = parsed;
  if (!client_email) throw Object.assign(new Error("Service account JSON missing client_email"), { statusCode: 500 });
  if (!private_key)  throw Object.assign(new Error("Service account JSON missing private_key"),  { statusCode: 500 });
  return {
    serviceAccountEmail: client_email,
    privateKey: createPrivateKey({ key: normalisePem(private_key), format: "pem" }),
  };
}

// ─── JWT / OAuth2 ──────────────────────────────────────────────────────────────

function base64urlEncode(str) {
  return Buffer.from(str).toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function createJWT(serviceAccountEmail, privateKey) {
  const now = Math.floor(Date.now() / 1000);
  const header  = base64urlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
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

async function getAccessToken(serviceAccountEmail, privateKey) {
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
  if (!json.access_token) throw new Error("OAuth2 response missing access_token: " + JSON.stringify(json));
  return json.access_token;
}

// ─── Drive helpers ─────────────────────────────────────────────────────────────

const METADATA_FIELDS = "id,name,size,mimeType,webContentLink";

async function fetchMetaWithToken(id, accessToken) {
  const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}` +
    `?fields=${encodeURIComponent(METADATA_FIELDS)}&supportsAllDrives=true&includeItemsFromAllDrives=true`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  return { res, status: res.status };
}

async function fetchMetaWithApiKey(id, apiKey) {
  const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}` +
    `?fields=${encodeURIComponent(METADATA_FIELDS)}&key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url);
  return { res, status: res.status };
}

function driveDownloadUrl(fileId) {
  return `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}` +
    `?alt=media&supportsAllDrives=true&acknowledgeAbuse=true`;
}

async function driveRange(fileId, token, start, end) {
  const res = await fetch(driveDownloadUrl(fileId), {
    headers: { Authorization: `Bearer ${token}`, Range: `bytes=${start}-${end}` },
  });
  if (!res.ok) throw new Error(`Drive range ${start}-${end} failed (${res.status}): ${await res.text()}`);
  return Buffer.from(await res.arrayBuffer());
}

// ─── Mac junk filter ───────────────────────────────────────────────────────────

function isMacJunk(path) {
  return path.startsWith("__MACOSX/") || path.includes("/._") || path.startsWith("._");
}

// ─── ZIP central-directory parser ─────────────────────────────────────────────

async function listZipEntries(fileId, token, totalSize) {
  const TAIL = Math.min(65536, totalSize);
  const tailStart = totalSize - TAIL;
  const tail = await driveRange(fileId, token, tailStart, totalSize - 1);

  let eocdOff = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (tail[i] === 0x50 && tail[i+1] === 0x4b && tail[i+2] === 0x05 && tail[i+3] === 0x06) {
      eocdOff = i; break;
    }
  }
  if (eocdOff === -1) throw new Error("Cannot find ZIP EOCD record");

  const eocd     = tail.slice(eocdOff);
  let entryCount = eocd.readUInt16LE(8);
  let cdSize     = eocd.readUInt32LE(12);
  let cdOffset   = eocd.readUInt32LE(16);

  // ZIP64 support
  if (cdOffset === 0xFFFFFFFF || entryCount === 0xFFFF) {
    const loc = eocdOff - 20;
    if (loc >= 0 && tail[loc] === 0x50 && tail[loc+1] === 0x4b && tail[loc+2] === 0x06 && tail[loc+3] === 0x07) {
      const z64abs = Number(tail.readBigUInt64LE(loc + 8));
      const z64off = z64abs - tailStart;
      if (z64off >= 0 && z64off < tail.length) {
        entryCount = Number(tail.readBigUInt64LE(z64off + 32));
        cdOffset   = Number(tail.readBigUInt64LE(z64off + 48));
        cdSize     = Number(tail.readBigUInt64LE(z64off + 40));
      }
    }
  }

  const cd = await driveRange(fileId, token, cdOffset, cdOffset + cdSize - 1);
  const entries = [];
  let pos = 0;

  while (pos < cd.length - 4) {
    if (cd[pos] !== 0x50 || cd[pos+1] !== 0x4b || cd[pos+2] !== 0x01 || cd[pos+3] !== 0x02) break;
    const compMethod       = cd.readUInt16LE(pos + 10);
    let compressedSize     = cd.readUInt32LE(pos + 20);
    let uncompressedSize   = cd.readUInt32LE(pos + 24);
    const fileNameLen      = cd.readUInt16LE(pos + 28);
    const extraLen         = cd.readUInt16LE(pos + 30);
    const commentLen       = cd.readUInt16LE(pos + 32);
    let localOffset        = cd.readUInt32LE(pos + 42);
    const entryName        = cd.slice(pos + 46, pos + 46 + fileNameLen).toString("utf8");

    const needUncomp = uncompressedSize === 0xFFFFFFFF;
    const needComp   = compressedSize   === 0xFFFFFFFF;
    const needOffset = localOffset      === 0xFFFFFFFF;

    if (needUncomp || needComp || needOffset) {
      let ep = pos + 46 + fileNameLen;
      const eEnd = ep + extraLen;
      while (ep < eEnd - 4) {
        const tag = cd.readUInt16LE(ep);
        const esz = cd.readUInt16LE(ep + 2);
        if (tag === 0x0001) {
          let vp = ep + 4;
          if (needUncomp) { uncompressedSize = Number(cd.readBigUInt64LE(vp)); vp += 8; }
          if (needComp)   { compressedSize   = Number(cd.readBigUInt64LE(vp)); vp += 8; }
          if (needOffset) { localOffset      = Number(cd.readBigUInt64LE(vp)); }
          break;
        }
        ep += 4 + esz;
      }
    }

    entries.push({
      name: entryName.split("/").pop() || entryName,
      path: entryName,
      compressedSize,
      uncompressedSize,
      localHeaderOffset: localOffset,
      compressionMethod: compMethod,
      isDir: entryName.endsWith("/"),
    });

    pos += 46 + fileNameLen + extraLen + commentLen;
  }

  return entries;
}

// ─── FIX #1: fetchAndInflate ──────────────────────────────────────────────────
//
// Previously this function fetched only bytes [localHeaderOffset, +29] — the
// fixed 30-byte portion of the local file header — and used the fnLen/exLen
// fields from that buffer to compute dataStart.  That is correct for fnLen, but
// the local extra field length (exLen at bytes 28-29) can differ from the
// central-directory extra field length.  If the local exLen > 0 the extra bytes
// were simply not there in the 30-byte fetch, so dataStart was ALWAYS computed
// as localHeaderOffset + 30 + fnLen, missing the local extra field entirely.
//
// The consequence: every byte of compressed data read started too early, so
// inflate produced garbage or threw a Z_DATA_ERROR, and the entry was silently
// replaced with Buffer.alloc(0) — i.e. the file vanished from the output ZIP.
//
// FIX: two-pass approach.
//   Pass 1 – fetch the fixed 30-byte header to learn fnLen and exLen.
//   Pass 2 – (only if exLen > 0) fetch the extra field bytes.
// dataStart = localHeaderOffset + 30 + fnLen + localExLen.
//
// This removes a whole class of "file missing after unzip" bugs caused by
// macOS, 7-Zip, and other tools that write non-zero local extra fields.

async function fetchAndInflate(fileId, token, entry) {
  // Pass 1: fixed 30-byte local file header
  const fixedHdr = await driveRange(
    fileId, token,
    entry.localHeaderOffset,
    entry.localHeaderOffset + 29
  );
  if (fixedHdr.length < 30) throw new Error(`Short local header for ${entry.path}`);

  // Validate signature PK\x03\x04
  if (fixedHdr[0] !== 0x50 || fixedHdr[1] !== 0x4b || fixedHdr[2] !== 0x03 || fixedHdr[3] !== 0x04) {
    throw new Error(`Invalid local file header signature for ${entry.path} at offset ${entry.localHeaderOffset}`);
  }

  const gpFlag       = fixedHdr.readUInt16LE(6);
  const fnLen        = fixedHdr.readUInt16LE(26);
  const localExLen   = fixedHdr.readUInt16LE(28);  // local extra length — may differ from CD extra
  const hasDataDescriptor = !!(gpFlag & 0x0008);

  // dataStart is the byte immediately after the local header variable fields
  const dataStart = entry.localHeaderOffset + 30 + fnLen + localExLen;

  let compressedSize = entry.compressedSize;

  // Resolve size from local ZIP64 extra field if needed
  if (compressedSize === 0xFFFFFFFF || (compressedSize === 0 && !hasDataDescriptor)) {
    if (localExLen > 0) {
      const extraBuf = await driveRange(
        fileId, token,
        entry.localHeaderOffset + 30 + fnLen,
        entry.localHeaderOffset + 30 + fnLen + localExLen - 1
      );
      let ep = 0;
      while (ep < extraBuf.length - 4) {
        const tag = extraBuf.readUInt16LE(ep);
        const esz = extraBuf.readUInt16LE(ep + 2);
        if (tag === 0x0001 && esz >= 16) {
          // uncompressedSize at ep+4, compressedSize at ep+12
          compressedSize = Number(extraBuf.readBigUInt64LE(ep + 12));
          break;
        }
        ep += 4 + esz;
      }
    }
  }

  // Data descriptor fallback (general purpose bit 3 set).
  // The central directory always has the correct sizes even when the local
  // header uses data descriptors — use it as the primary source.
  if (compressedSize === 0 && hasDataDescriptor) {
    if (entry.compressedSize > 0 && entry.compressedSize !== 0xFFFFFFFF) {
      compressedSize = entry.compressedSize;
    } else {
      // Scan forward for PK\x07\x08 data descriptor signature
      const SCAN = 256 * 1024;
      const scanBuf = await driveRange(fileId, token, dataStart, dataStart + SCAN - 1);
      let found = -1;
      for (let i = 0; i <= scanBuf.length - 16; i++) {
        if (scanBuf[i] === 0x50 && scanBuf[i+1] === 0x4b &&
            scanBuf[i+2] === 0x07 && scanBuf[i+3] === 0x08) {
          found = i; break;
        }
      }
      if (found !== -1) {
        compressedSize = found;
      } else {
        throw new Error(`Cannot determine compressed size for ${entry.path} (data descriptor not found)`);
      }
    }
  }

  if (compressedSize === 0) return Buffer.alloc(0);

  const compBuf = await driveRange(fileId, token, dataStart, dataStart + compressedSize - 1);

  if (entry.compressionMethod === 0) return compBuf;

  if (entry.compressionMethod === 8) {
    return new Promise((resolve, reject) => {
      const inflater = createInflateRaw();
      const chunks = [];
      inflater.on("data", (c) => chunks.push(c));
      inflater.on("end", () => resolve(Buffer.concat(chunks)));
      inflater.on("error", reject);
      inflater.end(compBuf);
    });
  }

  throw new Error(`Unsupported compression method ${entry.compressionMethod} for ${entry.path}`);
}

// ─── Path sanitiser ────────────────────────────────────────────────────────────

function sanitisePaths(entries) {
  if (entries.length === 0) return entries;

  // FIX #4: detect common prefix across ALL entries, not just entries[0]
  const firstSlash = (p) => { const i = p.indexOf("/"); return i === -1 ? "" : p.slice(0, i + 1); };
  const prefix = firstSlash(entries[0].path);
  const allShare = prefix.length > 0 && entries.every((e) => e.path.startsWith(prefix));

  const MAX_SEG = 240;
  const seen = new Map();

  return entries.map((e) => {
    let p = allShare ? e.path.slice(prefix.length) : e.path;
    if (!p) p = e.name || "file";

    p = p.split("/").map((seg) => {
      if (seg.length <= MAX_SEG) return seg;
      const dot = seg.lastIndexOf(".");
      const ext  = dot > 0 ? seg.slice(dot) : "";
      return seg.slice(0, MAX_SEG - ext.length) + ext;
    }).join("/");

    const base = p;
    let candidate = base;
    let n = 2;
    while (seen.has(candidate)) {
      const dot = base.lastIndexOf(".");
      if (dot > 0) candidate = base.slice(0, dot) + `_${n}` + base.slice(dot);
      else         candidate = base + `_${n}`;
      n++;
    }
    seen.set(candidate, true);

    return { ...e, path: candidate };
  });
}

// ─── Stored-ZIP stream helpers ─────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function makeLocalHeader(name, dataSize, crc) {
  const nameBytes = Buffer.from(name, "utf8");
  const buf = Buffer.alloc(30 + nameBytes.length);
  buf.writeUInt32LE(0x04034b50, 0);
  buf.writeUInt16LE(20, 4);
  buf.writeUInt16LE(0x0800, 6);
  buf.writeUInt16LE(0, 8);   // stored
  buf.writeUInt16LE(0, 10);
  buf.writeUInt16LE(0, 12);
  buf.writeUInt32LE(crc, 14);
  buf.writeUInt32LE(dataSize, 18);
  buf.writeUInt32LE(dataSize, 22);
  buf.writeUInt16LE(nameBytes.length, 26);
  buf.writeUInt16LE(0, 28);
  nameBytes.copy(buf, 30);
  return buf;
}

function makeCentralDirEntry(name, dataSize, crc, localOffset) {
  const nameBytes = Buffer.from(name, "utf8");
  const buf = Buffer.alloc(46 + nameBytes.length);
  buf.writeUInt32LE(0x02014b50, 0);
  buf.writeUInt16LE(20, 4);
  buf.writeUInt16LE(20, 6);
  buf.writeUInt16LE(0x0800, 8);
  buf.writeUInt16LE(0, 10);
  buf.writeUInt16LE(0, 12);
  buf.writeUInt16LE(0, 14);
  buf.writeUInt32LE(crc, 16);
  buf.writeUInt32LE(dataSize, 20);
  buf.writeUInt32LE(dataSize, 24);
  buf.writeUInt16LE(nameBytes.length, 28);
  buf.writeUInt16LE(0, 30);
  buf.writeUInt16LE(0, 32);
  buf.writeUInt16LE(0, 34);
  buf.writeUInt16LE(0, 36);
  buf.writeUInt32LE(0, 38);
  buf.writeUInt32LE(localOffset, 42);
  nameBytes.copy(buf, 46);
  return buf;
}

function makeEOCD(entryCount, cdSize, cdOffset) {
  const needZip64 = entryCount > 0xFFFF || cdSize > 0xFFFFFFFF || cdOffset > 0xFFFFFFFF;

  if (needZip64) {
    const z64eocd = Buffer.alloc(56);
    z64eocd.writeUInt32LE(0x06064b50, 0);
    z64eocd.writeBigUInt64LE(BigInt(44), 4);
    z64eocd.writeUInt16LE(45, 12);
    z64eocd.writeUInt16LE(45, 14);
    z64eocd.writeUInt32LE(0, 16);
    z64eocd.writeUInt32LE(0, 20);
    z64eocd.writeBigUInt64LE(BigInt(entryCount), 24);
    z64eocd.writeBigUInt64LE(BigInt(entryCount), 32);
    z64eocd.writeBigUInt64LE(BigInt(cdSize), 40);
    z64eocd.writeBigUInt64LE(BigInt(cdOffset), 48);

    const z64loc = Buffer.alloc(20);
    z64loc.writeUInt32LE(0x07064b50, 0);
    z64loc.writeUInt32LE(0, 4);
    z64loc.writeBigUInt64LE(BigInt(cdOffset + cdSize), 8);
    z64loc.writeUInt32LE(1, 16);

    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(0, 4);
    eocd.writeUInt16LE(0, 6);
    eocd.writeUInt16LE(0xFFFF, 8);
    eocd.writeUInt16LE(0xFFFF, 10);
    eocd.writeUInt32LE(0xFFFFFFFF, 12);
    eocd.writeUInt32LE(0xFFFFFFFF, 16);
    eocd.writeUInt16LE(0, 20);

    return Buffer.concat([z64eocd, z64loc, eocd]);
  }

  const buf = Buffer.alloc(22);
  buf.writeUInt32LE(0x06054b50, 0);
  buf.writeUInt16LE(0, 4);
  buf.writeUInt16LE(0, 6);
  buf.writeUInt16LE(entryCount, 8);
  buf.writeUInt16LE(entryCount, 10);
  buf.writeUInt32LE(cdSize, 12);
  buf.writeUInt32LE(cdOffset, 16);
  buf.writeUInt16LE(0, 20);
  return buf;
}

// ─── CORS ──────────────────────────────────────────────────────────────────────

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
};

// ─── Shared: get access token + file metadata ──────────────────────────────────

async function resolveFileInfo(id, apiKey) {
  let accessToken = null;
  let fileMetadata = null;
  let usedFallback = false;

  try {
    const { serviceAccountEmail, privateKey } = loadCredentials();
    accessToken = await getAccessToken(serviceAccountEmail, privateKey);
    const { res: metaRes, status } = await fetchMetaWithToken(id, accessToken);
    if (metaRes.ok) {
      fileMetadata = await metaRes.json();
    } else if (status === 404 || status === 403) {
      if (!apiKey) throw Object.assign(new Error(status === 404 ? "File not found" : "Access denied"), { statusCode: status });
      usedFallback = true;
    } else {
      throw new Error(`Drive metadata ${status}: ${await metaRes.text()}`);
    }
  } catch (err) {
    if (!accessToken && apiKey) {
      usedFallback = true;
    } else {
      throw err;
    }
  }

  if (usedFallback && !fileMetadata) {
    if (!apiKey) throw Object.assign(new Error("No API key for public fallback"), { statusCode: 503 });
    const { res: metaRes, status } = await fetchMetaWithApiKey(id, apiKey);
    if (!metaRes.ok) throw Object.assign(new Error(`Drive metadata ${status}`), { statusCode: status });
    fileMetadata = await metaRes.json();
    accessToken = null;
  }

  return { accessToken, fileMetadata, usedFallback };
}

// ─── Main handler ──────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") return res.status(204).end();

  const { id, mode } = req.query;
  if (!id) return res.status(400).json({ error: "Missing ?id= parameter" });

  const apiKey = process.env.VITE_GOOGLE_API_KEY || null;

  // ── MODE: info — return ZIP file list ─────────────────────────────────────
  if (mode === "info") {
    let accessToken, fileMetadata;
    try {
      ({ accessToken, fileMetadata } = await resolveFileInfo(id, apiKey));
    } catch (err) {
      return res.status(err.statusCode || 502).json({ error: err.message });
    }

    if (!accessToken) return res.status(403).json({ error: "Service account required for ZIP info" });

    const totalSize = parseInt(fileMetadata.size || "0", 10);
    if (!totalSize) return res.status(400).json({ error: "Cannot determine file size" });

    let allEntries;
    try {
      allEntries = await listZipEntries(id, accessToken, totalSize);
    } catch (err) {
      return res.status(502).json({ error: `Failed to read ZIP index: ${err.message}` });
    }

    // FIX #2: filter Mac junk in info mode too
    const fileEntries = allEntries.filter((e) => !e.isDir && e.name !== "" && !isMacJunk(e.path));
    const totalUncompressed = fileEntries.reduce((s, e) => s + (e.uncompressedSize || 0), 0);

    return res.status(200).json({
      fileId: id,
      fileCount: fileEntries.length,
      totalUncompressedBytes: totalUncompressed,
      totalCompressedBytes: totalSize,
      files: fileEntries.map((e, i) => ({
        index: i,
        name: e.name,
        path: e.path,
        size: e.uncompressedSize,
      })),
    });
  }

  // ── MODE: stream — extract ZIP and stream stored ZIP to browser ───────────
  if (mode === "stream") {
    let accessToken, fileMetadata;
    try {
      ({ accessToken, fileMetadata } = await resolveFileInfo(id, apiKey));
    } catch (err) {
      return res.status(err.statusCode || 502).json({ error: err.message });
    }

    if (!accessToken) return res.status(403).json({ error: "Service account required for streaming" });

    const totalSize = parseInt(fileMetadata.size || "0", 10);
    if (!totalSize) return res.status(400).json({ error: "Cannot determine file size" });

    let allEntries;
    try {
      allEntries = await listZipEntries(id, accessToken, totalSize);
    } catch (err) {
      return res.status(502).json({ error: `Failed to read ZIP index: ${err.message}` });
    }

    // FIX #2: filter Mac junk AND directories before sanitising/streaming
    const rawEntries  = allEntries.filter((e) => !e.isDir && e.name !== "" && !isMacJunk(e.path));
    const fileEntries = sanitisePaths(rawEntries);

    const folderName = (fileMetadata.name || "download").replace(/\.zip$/i, "");

    // No Content-Length — actual output size can differ from predictions when
    // data descriptors or ZIP64 fields are involved; chunked transfer is safer.
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(folderName)}.zip"`);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Folder-Name", folderName);

    const write = (buf) => new Promise((resolve, reject) => {
      const ok = res.write(buf);
      if (ok) return resolve();
      res.once("drain", resolve);
      res.once("error", reject);
    });

    const cdEntries = [];
    let offset = 0;

    try {
      for (const entry of fileEntries) {
        let data;
        try {
          data = await fetchAndInflate(id, accessToken, entry);
        } catch (err) {
          console.error(`[gofile-proxy] Failed to extract ${entry.path}:`, err.message);
          // Write an empty entry rather than skipping — the file still appears
          // in the ZIP directory so the user knows it was attempted.
          data = Buffer.alloc(0);
        }

        const checksum = crc32(data);
        const localHdr = makeLocalHeader(entry.path, data.length, checksum);

        cdEntries.push({ name: entry.path, dataSize: data.length, crc: checksum, localOffset: offset });
        offset += localHdr.length + data.length;

        await write(localHdr);

        // FIX #3: Stream data in 1 MB chunks instead of writing the entire
        // decompressed buffer at once.  For a 25–40 GB ZIP this previously
        // caused Vercel to OOM, silently killing the response mid-stream.
        const CHUNK = 1 * 1024 * 1024;
        for (let i = 0; i < data.length; i += CHUNK) {
          await write(data.slice(i, Math.min(i + CHUNK, data.length)));
        }
      }

      const cdStart = offset;
      let cdSize = 0;
      for (const cd of cdEntries) {
        const cdEntry = makeCentralDirEntry(cd.name, cd.dataSize, cd.crc, cd.localOffset);
        cdSize += cdEntry.length;
        await write(cdEntry);
      }

      await write(makeEOCD(cdEntries.length, cdSize, cdStart));
      res.end();
    } catch (err) {
      console.error("[gofile-proxy] Stream error:", err.message);
      res.end();
    }

    return;
  }

  // ── Default: return metadata + tokens for direct download ─────────────────
  let accessToken, fileMetadata, usedFallback;
  try {
    ({ accessToken, fileMetadata, usedFallback } = await resolveFileInfo(id, apiKey));
  } catch (err) {
    return res.status(err.statusCode || 502).json({ error: err.message, detail: err.message });
  }

  const fileName     = fileMetadata.name || "download";
  const mimeType     = fileMetadata.mimeType || "application/octet-stream";
  const fileSize     = fileMetadata.size;
  const isZip        = mimeType.includes("zip") || fileName.endsWith(".zip");
  const fileId       = fileMetadata.id || id;
  const fileSizeBytes = fileSize ? parseInt(String(fileSize), 10) : 0;

  const downloadUrl = accessToken
    ? `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true&acknowledgeAbuse=true`
    : null;

  const methodBUrl = apiKey
    ? `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&key=${encodeURIComponent(apiKey)}&supportsAllDrives=true&acknowledgeAbuse=true`
    : (fileMetadata.webContentLink || null);

  return res.status(200).json({
    token:            accessToken,
    fileId,
    fileName,
    mimeType,
    size:             fileSize,
    fileSizeBytes,
    isZip,
    downloadUrl,
    methodBUrl,
    webContentLink:   fileMetadata.webContentLink || null,
    canStreamDirect:  !!accessToken,
    isPublicFallback: usedFallback,
  });
}
