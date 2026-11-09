#!/usr/bin/env node
/**
 * warm-videos.mjs
 *
 * Varmer Cloudinary op, så ingen besøgende venter på en transkodning.
 *
 * Hvorfor: hver kombination af (video × størrelse) bliver først lavet hos
 * Cloudinary, når nogen beder om den første gang – og den første besøgende
 * får ventetiden. Dette script beder selv om dem og venter til Cloudinary er
 * færdig. Cloudinary gemmer resultatet på sit CDN, så rigtige besøgende får det
 * med det samme bagefter.
 *
 * Det er bevidst kun TRE varianter pr. video (720 / 1280 / 1920, H.264 MP4,
 * samme URL til hero og afspillere). Hver ekstra variant er en ekstra
 * transformation, du betaler for. Se api/_lib/cloudinaryWarm.js.
 *
 *   node scripts/warm-videos.mjs <public_id> [<public_id> ...]
 *   node scripts/warm-videos.mjs --all            (alle videoer i Cloudinary)
 *   npm run video:warm -- --all
 *
 * Flag:
 *   --all              find alle videoer via Cloudinary Admin API
 *                      (kræver CLOUDINARY_API_KEY og CLOUDINARY_API_SECRET som
 *                      miljøvariabler i terminalen)
 *   --tiers=small,medium,large   hvilke størrelser der varmes op (standard: alle tre)
 *   --concurrency=3    antal samtidige forespørgsler (standard 3)
 *   --dry              vis kun de URL'er der ville blive bedt om
 *
 * public_id er det samme som i admin (uden "cloudinary:" og uden filendelse).
 * Det kan også være et helt Cloudinary-link; så pakkes id'et ud.
 *
 * Scriptet henter aldrig hele videoer (kun 1 byte pr. forespørgsel).
 * Kræver Node 18+. Ingen pakker.
 *
 * Opskrifterne (tiers, URL'er) ligger i api/_lib/cloudinaryWarm.js og deles med
 * webhook'en api/cloudinary-webhook.js. De skal følge src/utils/cloudinaryUrls.ts
 * – ændrer du dem dér, så ret dem i lib'en også.
 */

import { CLOUD, TIERS, buildJobs, warmUrl, runPool } from '../api/_lib/cloudinaryWarm.js'

// ─── Hjælpere ───────────────────────────────────────────────────────────────
const c = (n, s) => (process.stdout.isTTY ? `\x1b[${n}m${s}\x1b[0m` : s)
const bold = (s) => c(1, s)
const dim = (s) => c(2, s)
const green = (s) => c(32, s)
const red = (s) => c(31, s)
const yellow = (s) => c(33, s)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const mb = (bytes) => (bytes / 1024 / 1024).toFixed(1) + ' MB'

function extractPublicId(input) {
  const m = input.match(/\/upload\/(.+)$/)
  if (!m) return input.replace(/^cloudinary:/, '')
  const segs = m[1].split(/[?#]/)[0].split('/')
  let i = 0
  const isTransform = (s) =>
    /^v\d+$/.test(s) || s.split(',').every((p) => /^[a-z]{1,4}_[\w:.+-]*$/i.test(p))
  while (i < segs.length - 1 && isTransform(segs[i])) i++
  const rest = segs.slice(i)
  const last = rest[rest.length - 1]
  const dot = last.lastIndexOf('.')
  rest[rest.length - 1] = dot > 0 ? last.slice(0, dot) : last
  return rest.join('/')
}

/** Henter alle video-public_ids fra Cloudinary Admin API. */
async function listAllVideoIds() {
  const key = process.env.CLOUDINARY_API_KEY
  const secret = process.env.CLOUDINARY_API_SECRET
  if (!key || !secret) {
    console.error(red('--all kræver CLOUDINARY_API_KEY og CLOUDINARY_API_SECRET som miljøvariabler.'))
    console.error(dim('Eksempel:  CLOUDINARY_API_KEY=123 CLOUDINARY_API_SECRET=abc npm run video:warm -- --all'))
    process.exit(1)
  }
  const auth = Buffer.from(`${key}:${secret}`).toString('base64')
  const ids = []
  let cursor = ''
  do {
    const url =
      `https://api.cloudinary.com/v1_1/${CLOUD}/resources/video/upload?max_results=500` +
      (cursor ? `&next_cursor=${encodeURIComponent(cursor)}` : '')
    const res = await fetch(url, { headers: { Authorization: `Basic ${auth}` } })
    if (!res.ok) {
      console.error(red(`Cloudinary Admin API svarede HTTP ${res.status}. Tjek nøgle og secret.`))
      process.exit(1)
    }
    const json = await res.json()
    for (const r of json.resources || []) ids.push(r.public_id)
    cursor = json.next_cursor || ''
  } while (cursor)
  return ids
}

// ─── Kør ────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3)

const tiers = (flag('tiers') || Object.keys(TIERS).join(',')).split(',').filter((t) => TIERS[t])
const concurrency = Math.max(1, Number(flag('concurrency')) || 3)
const dry = args.includes('--dry')
const deadline = () => Date.now() + 10 * 60 * 1000

let ids = args.filter((a) => !a.startsWith('--')).map(extractPublicId)
if (args.includes('--all')) ids = [...new Set([...ids, ...(await listAllVideoIds())])]

if (ids.length === 0 || tiers.length === 0) {
  console.log('Brug: node scripts/warm-videos.mjs <public_id> [<public_id> ...] | --all  [--tiers=small,medium,large] [--dry]')
  process.exit(1)
}

const jobs = buildJobs(ids, tiers)

console.log(bold(`Varmer op: ${ids.length} video(er) × ${tiers.length} størrelser = ${jobs.length} forespørgsler (= højst ${jobs.length} transformationer)`))
console.log(dim('Første gang kan hver ny variant tage lidt at lave. Cloudinary gemmer dem bagefter.\n'))

if (dry) {
  for (const j of jobs) console.log(`${j.tier.padEnd(7)} ${j.url}`)
  process.exit(0)
}

let done = 0
const stats = { ready: 0, built: 0, failed: 0 }
const failures = []
const typesSeen = new Map() // "video/tier" → Set(formater)

const tasks = jobs.map((j) => async () => {
  const r = await warmUrl(j.url, undefined, deadline())
  done++
  const tag = `[${String(done).padStart(String(jobs.length).length)}/${jobs.length}]`
  const where = `${j.id}  ${j.tier}`
  if (r.error) {
    stats.failed++
    failures.push(`${where}: ${r.error}`)
    console.log(`${tag} ${red('✗')} ${where} ${red(r.error)}`)
    return
  }
  if (r.waited) stats.built++
  else stats.ready++
  const key = `${j.id} ${j.tier}`
  if (!typesSeen.has(key)) typesSeen.set(key, new Set())
  typesSeen.get(key).add(r.type)
  console.log(
    `${tag} ${r.waited ? yellow('⚙ lavet') : green('✓ klar ')} ${where} ${dim(`${r.type} ${r.bytes ? mb(r.bytes) : ''}`)}`,
  )
})

await runPool(tasks, concurrency)

console.log('\n' + bold('Færdig.'))
console.log(`  ${green(String(stats.ready))} lå allerede klar, ${yellow(String(stats.built))} blev lavet nu, ${stats.failed ? red(String(stats.failed)) : '0'} fejlede.`)
const formats = new Set([...typesSeen.values()].flatMap((s) => [...s]))
if (formats.size) console.log(dim(`  Cloudinary valgte disse formater: ${[...formats].join(', ')}`))
if (failures.length) {
  console.log('\n' + red('Fejl:'))
  for (const f of failures) console.log('  ' + f)
  process.exit(2)
}
