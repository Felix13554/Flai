/**
 * api/cloudinary-eager.js — Vercel Serverless Function
 *
 * Tells Cloudinary to create (in the background) every video variant the site
 * can request, so the first visitor never waits for a transcode.
 *
 *   POST /api/cloudinary-eager
 *   Authorization: Bearer <Supabase access token of an admin user>
 *   Body: { publicId: string, width?: number, height?: number }
 *   → 200 { ok: true, publicId, landscape, requested: N, batches: B }
 *
 * The list of variants comes from src/utils/cloudinaryVariantSpec.js — the SAME
 * module the browser uses to build delivery URLs — so the URL the site asks for
 * and the variant created here are guaranteed to be the same string.
 *
 * ─── ENV VARS (Vercel → Project → Settings → Environment Variables) ──────────
 *   CLOUDINARY_API_KEY      — Cloudinary Console → Settings → API Keys
 *   CLOUDINARY_API_SECRET   — same page. Server-side only; never prefix with VITE_.
 *   VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — already set for the site; used
 *     to check the caller is a logged-in admin (profiles.is_admin), because
 *     every variant is a billed transcode.
 *
 * Calls Cloudinary's signed `explicit` endpoint with eager_async=true, so the
 * request returns immediately and Cloudinary transcodes in the background.
 */

import { createHash } from 'node:crypto'
import { CLOUD, listEagerTransformations } from '../src/utils/cloudinaryVariantSpec.js'

const API_KEY    = process.env.CLOUDINARY_API_KEY    || ''
const API_SECRET = process.env.CLOUDINARY_API_SECRET || ''

const SUPABASE_URL = process.env.SUPABASE_URL      || process.env.VITE_SUPABASE_URL      || ''
const SUPABASE_ANON = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''

// Cloudinary public_ids: letters, digits, _ - . and / for folders.
const PUBLIC_ID_RE = /^[A-Za-z0-9_\-./]+$/

// Keep each explicit call comfortably small.
const BATCH_SIZE = 20

export const config = { maxDuration: 30 }

function sign(params) {
  const toSign = Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== '')
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&')
  return createHash('sha1').update(toSign + API_SECRET).digest('hex')
}

/** Verifies the bearer token belongs to a Supabase user with profiles.is_admin. */
async function assertAdmin(req) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!token) return { ok: false, status: 401, error: 'Missing auth token' }
  if (!SUPABASE_URL || !SUPABASE_ANON) return { ok: false, status: 500, error: 'Supabase env vars missing on server' }

  const headers = { apikey: SUPABASE_ANON, Authorization: `Bearer ${token}` }

  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers })
  if (!userRes.ok) return { ok: false, status: 401, error: 'Invalid session' }
  const user = await userRes.json().catch(() => null)
  if (!user?.id) return { ok: false, status: 401, error: 'Invalid session' }

  const profRes = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?select=is_admin&id=eq.${encodeURIComponent(user.id)}`,
    { headers }
  )
  const rows = profRes.ok ? await profRes.json().catch(() => []) : []
  if (!Array.isArray(rows) || rows[0]?.is_admin !== true) {
    return { ok: false, status: 403, error: 'Admin only' }
  }
  return { ok: true }
}

/** true = landscape/square, false = portrait, null = unknown. */
async function detectLandscape(publicId, width, height) {
  if (Number(width) > 0 && Number(height) > 0) return Number(width) >= Number(height)
  try {
    const auth = Buffer.from(`${API_KEY}:${API_SECRET}`).toString('base64')
    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUD}/resources/video/upload/${publicId.split('/').map(encodeURIComponent).join('/')}`,
      { headers: { Authorization: `Basic ${auth}` } }
    )
    if (!res.ok) return null
    const info = await res.json()
    if (info?.width > 0 && info?.height > 0) return info.width >= info.height
  } catch {
    /* fall through */
  }
  return null
}

async function explicitBatch(publicId, transformations) {
  const params = {
    eager:       transformations.join('|'),
    eager_async: 'true',
    public_id:   publicId,
    timestamp:   Math.floor(Date.now() / 1000),
    type:        'upload',
  }
  const body = new URLSearchParams({
    ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
    api_key:   API_KEY,
    signature: sign(params),
  })
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD}/video/upload/explicit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json?.error?.message || `Cloudinary ${res.status}`)
  return json
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  if (!API_KEY || !API_SECRET) {
    return res.status(500).json({
      error: 'CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET are not set in Vercel environment variables',
    })
  }

  try {
    const auth = await assertAdmin(req)
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error })

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
    const publicId = String(body.publicId || '').trim()
    if (!publicId || !PUBLIC_ID_RE.test(publicId) || publicId.startsWith('/') || publicId.split('/').includes('..')) {
      return res.status(400).json({ error: 'Invalid publicId' })
    }

    const landscape = await detectLandscape(publicId, body.width, body.height)
    // Unknown orientation → treat as landscape (a few extra crop variants beat a slow first visit).
    const list = listEagerTransformations({ landscape: landscape !== false })

    let batches = 0
    for (let i = 0; i < list.length; i += BATCH_SIZE) {
      await explicitBatch(publicId, list.slice(i, i + BATCH_SIZE))
      batches += 1
    }

    return res.status(200).json({
      ok: true,
      publicId,
      landscape: landscape !== false,
      requested: list.length,
      batches,
    })
  } catch (err) {
    console.error('[cloudinary-eager]', err)
    return res.status(502).json({ error: err?.message || 'Cloudinary request failed' })
  }
}
