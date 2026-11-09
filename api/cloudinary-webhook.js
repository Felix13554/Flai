/**
 * api/cloudinary-webhook.js — Vercel Serverless Function
 *
 * Alle videoer på Flai er færdige Flai-versions-zip-sæt (11 filer lavet lokalt med
 * Quick Action'en "Flai Videoversioner"). Filerne leveres uden transformation, så der
 * er intet at varme op. Webhook'en gør derfor ingenting ved uploads – den findes kun
 * så en allerede oprettet webhook i Cloudinary Console stadig får et gyldigt svar
 * (og kan fjernes der, når det passer).
 *
 *   POST /api/cloudinary-webhook      (kaldes af Cloudinary, ikke af browseren)
 *
 * Der forventes aldrig videoer uden zip-version, og der laves aldrig transformationer
 * af videoer herfra.
 *
 * Sikkerhed: Cloudinary underskriver hver besked (SHA-1/SHA-256 af rå body + timestamp
 * + API secret i X-Cld-Signature). Uden gyldig underskrift svarer vi 401.
 * CLOUDINARY_API_SECRET skal være sat i Vercel (Project → Environment Variables).
 */

import { createHash, timingSafeEqual } from 'node:crypto'

const API_SECRET = process.env.CLOUDINARY_API_SECRET || ''

export const config = { maxDuration: 10 }

const MAX_AGE_SECONDS = 2 * 60 * 60 // Cloudinary: signaturen gælder i 2 timer

async function readRawBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  return Buffer.concat(chunks).toString('utf8')
}

function safeEqual(a, b) {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  return ba.length === bb.length && timingSafeEqual(ba, bb)
}

/** true hvis underskriften passer (Cloudinary kan bruge SHA-1 eller SHA-256). */
export function isValidSignature(rawBody, timestamp, signature, secret = API_SECRET) {
  if (!rawBody || !timestamp || !signature || !secret) return false
  const age = Math.abs(Date.now() / 1000 - Number(timestamp))
  if (!Number.isFinite(age) || age > MAX_AGE_SECONDS) return false
  const payload = rawBody + timestamp + secret
  return ['sha1', 'sha256'].some((algo) =>
    safeEqual(createHash(algo).update(payload).digest('hex'), String(signature).toLowerCase()),
  )
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  if (!API_SECRET) {
    console.error('[webhook] CLOUDINARY_API_SECRET mangler i Vercel')
    return res.status(500).json({ error: 'Server not configured' })
  }

  // Signaturen er beregnet på den RÅ body, så den læses før noget parser den.
  const raw = await readRawBody(req)
  const ts = req.headers['x-cld-timestamp']
  const sig = req.headers['x-cld-signature']
  if (!isValidSignature(raw, ts, sig)) {
    console.warn('[webhook] afvist: ugyldig eller for gammel underskrift')
    return res.status(401).json({ error: 'Invalid signature' })
  }

  // Zip-sæt er færdige filer: ingen opvarmning, ingen transformationer.
  return res.status(200).json({ ok: true, ignored: 'video-sets-need-no-warmup' })
}
