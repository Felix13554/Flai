/**
 * api/cloudinary-webhook.js — Vercel Serverless Function
 *
 * Varmer automatisk de tre størrelser (720/1280/1920, H.264 MP4) op, når en
 * video bliver uploadet eller erstattet i Cloudinary, så første besøgende ikke
 * venter på en transkodning. Det er bevidst KUN disse tre: hver ekstra variant
 * koster transformations-credits.
 *
 *   POST /api/cloudinary-webhook      (kaldes af Cloudinary, ikke af browseren)
 *
 * ─── OPSÆTNING (én gang) ─────────────────────────────────────────────────────
 *  1. Vercel → Project → Environment Variables: CLOUDINARY_API_SECRET skal
 *     findes (den er der allerede). Bruges til at tjekke Cloudinarys underskrift.
 *  2. Cloudinary Console → Settings → Webhooks → Add Webhook Notification URL:
 *       URL:           https://flai.dk/api/cloudinary-webhook
 *       Notifications: Upload   (dækker både ny video og erstat/overwrite)
 *  3. Upload en testvideo og se Vercel → Logs: "[webhook] varmer op …".
 *  4. Fjern ALLE "Eager"-transformationer fra upload-presetet "Herovideo"
 *     (Cloudinary Console → Settings → Upload → Upload presets → Herovideo →
 *     Transform). Presetet bestiller ellers HLS, MP4, WebM og et poster
 *     for hver upload, som siden slet ikke bruger – og det koster credits
 *     hver gang. Webhook'en her varmer de tre varianter, der bruges.
 *
 * ─── SIKKERHED ───────────────────────────────────────────────────────────────
 * Cloudinary underskriver hver besked: SHA-1/SHA-256 af (rå body + timestamp +
 * API secret) i headeren X-Cld-Signature. Uden gyldig underskrift (eller hvis
 * den er over 2 timer gammel) svarer vi 401 og gør ingenting, så ingen udefra
 * kan få os til at lave betalte transkodninger.
 */

import { createHash, timingSafeEqual } from 'node:crypto'
import { buildJobs, warmUrl, runPool } from './_lib/cloudinaryWarm.js'

const API_SECRET = process.env.CLOUDINARY_API_SECRET || ''

// Hobby-planen tillader op til 60 s.
export const config = { maxDuration: 60 }

const MAX_AGE_SECONDS = 2 * 60 * 60 // Cloudinary: signaturen gælder i 2 timer
const BUDGET_MS = 55_000
const CONCURRENCY = 8

/**
 * Lader opvarmningen køre videre efter vi har svaret Cloudinary. Vercel stiller
 * waitUntil til rådighed via request-konteksten (det samme @vercel/functions
 * bruger indeni), så vi slipper for en ekstra pakke. Findes den ikke, returnerer
 * vi false, og så venter handleren selv.
 */
function keepAlive(promise) {
  try {
    const ctx = globalThis[Symbol.for('@vercel/request-context')]?.get?.()
    if (ctx && typeof ctx.waitUntil === 'function') {
      ctx.waitUntil(promise)
      return true
    }
  } catch {
    /* falder tilbage nedenfor */
  }
  return false
}

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

export async function warmVideo(publicId, budgetMs = BUDGET_MS) {
  const deadline = Date.now() + budgetMs
  // Kun de tre størrelser siderne bruger, i ét format – se cloudinaryWarm.js.
  const jobs = buildJobs([publicId])
  const stats = { ready: 0, built: 0, failed: 0 }
  const formats = new Set()

  await runPool(
    jobs.map((j) => async () => {
      const r = await warmUrl(j.url, undefined, deadline)
      if (r.error) { stats.failed++; return }
      if (r.waited) stats.built++
      else stats.ready++
      if (r.type) formats.add(r.type)
    }),
    CONCURRENCY,
  )
  console.log(
    `[webhook] ${publicId}: ${jobs.length} forespørgsler – ${stats.ready} klar, ${stats.built} lavet, ` +
      `${stats.failed} ikke færdig i tide. Formater: ${[...formats].join(', ') || '–'}`,
  )
  return stats
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

  let event
  try {
    event = JSON.parse(raw)
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' })
  }

  // Kun nye/erstattede videoer. Alt andet (billeder, delete, eager …) ignoreres.
  if (event.notification_type !== 'upload' || event.resource_type !== 'video' || !event.public_id) {
    return res.status(200).json({ ok: true, ignored: true })
  }

  // Videoer fra en Flai-versions-zip er færdige filer (ingen transformation at varme op).
  // De kendes på tagget eller på id'et (<slug>--fs, <slug>--fs_<bredde>_<codec>).
  const tags = Array.isArray(event.tags) ? event.tags : []
  if (tags.includes('flai-versions') || /--fs(_\d+_(vp9|hevc|h264))?$/.test(String(event.public_id))) {
    return res.status(200).json({ ok: true, ignored: 'video-set' })
  }

  const publicId = String(event.public_id)
  console.log(`[webhook] varmer op: ${publicId}${event.overwritten ? ' (erstattet)' : ' (ny)'}`)

  // Svar Cloudinary med det samme, og lad opvarmningen køre videre bagefter.
  const job = warmVideo(publicId).catch((err) => console.error('[webhook] fejl:', err))
  if (keepAlive(job)) return res.status(200).json({ ok: true, warming: publicId })

  // Fallback: ingen waitUntil → vent selv (kortere budget, så Cloudinary ikke time'er ud).
  await Promise.race([job, new Promise((r) => setTimeout(r, 20_000))])
  return res.status(200).json({ ok: true, warming: publicId })
}
