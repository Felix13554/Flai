/**
 * api/drive-folder-search.js — Vercel Serverless Function
 *
 * Replaces: netlify/functions/drive-folder-search.js
 * Old URL:  /.netlify/functions/drive-folder-search
 * New URL:  /api/drive-folder-search
 *
 * Searches a Google Drive folder for files whose name contains a given
 * customer name or booking ID, then returns the matching file(s) so the
 * admin can link one to a booking.
 *
 * GET /api/drive-folder-search?q=SEARCH_TERM&folderId=FOLDER_ID
 *
 * ENV VARS (same as before):
 *   GOOGLE_SERVICE_ACCOUNT_KEY         — base64-encoded service-account JSON blob
 *   VITE_GOOGLE_DRIVE_PUBLIC_FOLDER_ID — default folder to search in
 *
 * FIXES applied:
 *   - FIX #7: folderId is now validated against /^[a-zA-Z0-9_-]+$/ before being
 *     interpolated into the Drive API query string. Google Drive IDs only ever
 *     contain alphanumeric characters, underscores, and hyphens; anything else
 *     is rejected with a 400 before touching the API.
 */

import { createSign, createPrivateKey } from "crypto";

function b64url(str) {
  return Buffer.from(str)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

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
    const footer = lines.find((l) => l.startsWith("-----END"));
    const body = lines.filter((l) => l && !l.startsWith("-----")).join("").replace(/\s/g, "");
    if (header && footer && body) {
      pem = `${header}\n${(body.match(/.{1,64}/g) || []).join("\n")}\n${footer}\n`;
    }
  }
  return pem;
}

function loadCredentials() {
  const rawKey = (process.env.GOOGLE_SERVICE_ACCOUNT_KEY || "").trim();
  if (!rawKey) throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY is not set");

  let parsed;
  try {
    const json = Buffer.from(rawKey, "base64").toString("utf8");
    parsed = JSON.parse(json);
  } catch (e) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY base64/JSON parse failed: " + e.message);
  }

  const email  = parsed.client_email;
  const keyRaw = parsed.private_key;
  if (!email || !keyRaw) throw new Error("JSON key missing client_email or private_key");

  const privateKey = createPrivateKey({ key: normalisePem(keyRaw), format: "pem" });
  return { email, privateKey };
}

function makeJwt(email, privateKey) {
  const now = Math.floor(Date.now() / 1000);
  const header  = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({
    iss: email,
    scope: "https://www.googleapis.com/auth/drive.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const input = `${header}.${payload}`;
  const sign = createSign("RSA-SHA256");
  sign.update(input);
  sign.end();
  return `${input}.${b64url(sign.sign(privateKey))}`;
}

async function getAccessToken(email, privateKey) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: makeJwt(email, privateKey),
    }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`OAuth2 token exchange failed (${res.status}): ${txt}`);
  }
  return (await res.json()).access_token;
}

// FIX #7: Drive folder IDs only contain alphanumeric chars, underscores, hyphens.
// Validate before interpolating into the query string to prevent API query injection.
const DRIVE_ID_RE = /^[a-zA-Z0-9_-]+$/;

async function searchFolderFiles(token, folderId, query) {
  const driveQuery = [
    `'${folderId}' in parents`,
    `name contains '${query.replace(/'/g, "\\'")}'`,
    `trashed = false`,
  ].join(" and ");

  const fields = "files(id,name,size,mimeType,modifiedTime,webViewLink)";
  const url = `https://www.googleapis.com/drive/v3/files` +
    `?q=${encodeURIComponent(driveQuery)}` +
    `&fields=${encodeURIComponent(fields)}` +
    `&orderBy=modifiedTime+desc` +
    `&pageSize=20` +
    `&supportsAllDrives=true` +
    `&includeItemsFromAllDrives=true`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Drive search failed (${res.status}): ${txt.slice(0, 300)}`);
  }

  const data = await res.json();
  return data.files || [];
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};

export default async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const query    = (req.query.q || "").trim();
  const folderId = (
    req.query.folderId ||
    process.env.VITE_GOOGLE_DRIVE_PUBLIC_FOLDER_ID ||
    ""
  ).trim();
  const baseUrl  = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : (process.env.URL || "");

  if (!query) return res.status(400).json({ error: "Missing ?q= search term" });
  if (!folderId) return res.status(400).json({
    error: "Missing folderId parameter and VITE_GOOGLE_DRIVE_PUBLIC_FOLDER_ID env var is not set",
  });

  // FIX #7: Reject folder IDs that contain characters outside the Drive ID
  // character set. This prevents query injection via the folderId parameter —
  // a malicious value like "root) or (1=1" would otherwise be interpolated
  // directly into the Drive API query string.
  if (!DRIVE_ID_RE.test(folderId)) {
    return res.status(400).json({
      error: "Invalid folderId: must contain only alphanumeric characters, underscores, and hyphens.",
    });
  }

  try {
    const { email, privateKey } = loadCredentials();
    const token = await getAccessToken(email, privateKey);
    const files = await searchFolderFiles(token, folderId, query);

    return res.status(200).json({
      query,
      folderId,
      count: files.length,
      files: files.map((f) => ({
        id: f.id,
        name: f.name,
        size: f.size || null,
        mimeType: f.mimeType || "application/octet-stream",
        modifiedTime: f.modifiedTime || null,
        webViewLink: f.webViewLink || `https://drive.google.com/file/d/${f.id}/view`,
        downloadUrl: `${baseUrl}/api/drive-download?id=${f.id}`,
      })),
    });
  } catch (err) {
    console.error("drive-folder-search error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
