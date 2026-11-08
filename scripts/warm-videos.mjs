#!/usr/bin/env node
/**
 * warm-videos.mjs
 *
 * Varmer Cloudinary op, så ingen besøgende venter på en transkodning.
 *
 * Hvorfor: med f_auto vælger Cloudinary selv format (WebM/VP9, HEVC, H.264 …)
 * ud fra browseren. Hver kombination af (video × størrelse × format) bliver
 * først lavet, når nogen beder om den første gang – og den første besøgende
 * får ventetiden. Dette script beder selv om alle kombinationerne, ved at
 * spørge som flere forskellige browsere, og venter til Cloudinary er færdig.
 * Cloudinary gemmer det, den har valgt, på sit CDN, så rigtige besøgende
 * får det med det samme bagefter.
 *
 *   node scripts/warm-videos.mjs <public_id> [<public_id> ...]
 *   node scripts/warm-videos.mjs --all            (alle videoer i Cloudinary)
 *   npm run video:warm -- --all
 *
 * Flag:
 *   --all              find alle videoer via Cloudinary Admin API
 *                      (kræver CLOUDINARY_API_KEY og CLOUDINARY_API_SECRET som
 *                      miljøvariabler i terminalen)
 *   --kinds=hero,player   hvilke afspillere der varmes op (standard: begge)
 *   --browsers=chrome,firefox,safari-ios,safari-mac,android   (standard: alle)
 *   --concurrency=3    antal samtidige forespørgsler (standard 3)
 *   --dry              vis kun de URL'er der ville blive bedt om
 *
 * public_id er det samme som i admin (uden "cloudinary:" og uden filendelse).
 * Det kan også være et helt Cloudinary-link; så pakkes id'et ud.
 *
 * Scriptet henter aldrig hele videoer (kun 1 byte pr. forespørgsel).
 * Kræver Node 18+. Ingen pakker.
 *
 * NB: tier-tabellen og URL-opskrifterne skal følge src/utils/cloudinaryUrls.ts
 * (HERO_TIERS, optimizedVideoUrl, playerVideoTier). Ændrer du dem dér, så ret
 * dem her også – ellers varmer scriptet de forkerte URL'er op.
 */

const CLOUD = 'dq6jxbyrg'

// Skal følge HERO_TIERS i src/utils/cloudinaryUrls.ts
const TIERS = {
  small:  { width: 720,  quality: 'eco'  },
  mobile: { width: 1080, quality: 'good' },
  medium: { width: 1280, quality: 'good' },
  large:  { width: 1920, quality: 'good' },
}

// Hero bruger alle fire tiers. Afspillerne bruger playerVideoTier(), som
// aldrig vælger 'mobile' (den bliver til 'small').
const KINDS = {
  hero:   { label: 'Hero',      tiers: ['small', 'mobile', 'medium', 'large'], audio: false },
  player: { label: 'Afspiller', tiers: ['small', 'medium', 'large'],           audio: true  },
}

// f_auto vælger format ud fra browseren, så vi spørger som flere forskellige.
const BROWSERS = {
  chrome: {
    label: 'Chrome',
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  },
  firefox: {
    label: 'Firefox',
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0',
  },
  'safari-ios': {
    label: 'Safari iPhone',
    ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  },
  'safari-mac': {
    label: 'Safari Mac',
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  },
  android: {
    label: 'Chrome Android',
    ua: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  },
}

// ─── URL'er (samme opskrift som optimizedVideoUrl i cloudinaryUrls.ts) ──────
function variantUrl(publicId, tier, audio) {
  const { width, quality } = TIERS[tier]
  return (
    `https://res.cloudinary.com/${CLOUD}/video/upload/` +
    `c_limit,w_${width}/` +
    (audio ? '' : 'ac_none/') +
    `f_auto/q_auto:${quality}/${publicId}.mp4`
  )
}

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

/**
 * Beder om varianten (1 byte) og venter til Cloudinary er færdig med at lave
 * den. 423/202 = "ved at blive lavet".
 */
async function warm(url, ua, maxWaitMs) {
  const started = Date.now()
  let waited = false
  while (Date.now() - started < maxWaitMs) {
    let res
    try {
      res = await fetch(url, {
        headers: { 'User-Agent': ua, Range: 'bytes=0-0' },
        signal: AbortSignal.timeout(120_000),
      })
    } catch (err) {
      if (err.name === 'TimeoutError') { waited = true; continue } // Cloudinary arbejder stadig
      return { error: String(err.message || err) }
    }
    res.body?.cancel().catch(() => {})

    if (res.status === 423 || res.status === 202) {
      waited = true
      await sleep(5000)
      continue
    }
    if (res.status !== 200 && res.status !== 206) {
      const why = res.headers.get('x-cld-error')
      return { error: `HTTP ${res.status}${why ? ' – ' + why : ''}` }
    }
    const range = res.headers.get('content-range')
    const total = range ? Number(range.split('/')[1]) : Number(res.headers.get('content-length'))
    const type = (res.headers.get('content-type') || '').split(';')[0].replace('video/', '')
    return { bytes: Number.isFinite(total) ? total : 0, type, waited, ms: Date.now() - started }
  }
  return { error: 'blev ikke færdig i tide – kør scriptet igen om lidt' }
}

/** Kører opgaver med begrænset parallelitet. */
async function runPool(tasks, concurrency) {
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(concurrency, tasks.length) }, async () => {
      while (next < tasks.length) {
        const i = next++
        await tasks[i]()
      }
    }),
  )
}

// ─── Kør ────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3)

const kinds = (flag('kinds') || 'hero,player').split(',').filter((k) => KINDS[k])
const browsers = (flag('browsers') || Object.keys(BROWSERS).join(',')).split(',').filter((b) => BROWSERS[b])
const concurrency = Math.max(1, Number(flag('concurrency')) || 3)
const dry = args.includes('--dry')
const maxWaitMs = 10 * 60 * 1000

let ids = args.filter((a) => !a.startsWith('--')).map(extractPublicId)
if (args.includes('--all')) ids = [...new Set([...ids, ...(await listAllVideoIds())])]

if (ids.length === 0 || kinds.length === 0 || browsers.length === 0) {
  console.log('Brug: node scripts/warm-videos.mjs <public_id> [<public_id> ...] | --all  [--kinds=hero,player] [--browsers=...] [--dry]')
  process.exit(1)
}

// Alle (video × slags × størrelse). Samme URL bliver kun lavet én gang pr. browser.
const jobs = []
for (const id of ids) {
  for (const k of kinds) {
    for (const t of KINDS[k].tiers) {
      for (const b of browsers) {
        jobs.push({ id, kind: k, tier: t, browser: b, url: variantUrl(id, t, KINDS[k].audio) })
      }
    }
  }
}

console.log(bold(`Varmer op: ${ids.length} video(er) × ${kinds.length} slags × størrelser × ${browsers.length} browsere = ${jobs.length} forespørgsler`))
console.log(dim('Første gang kan hver ny variant tage lidt at lave. Cloudinary gemmer dem bagefter.\n'))

if (dry) {
  for (const j of jobs) console.log(`${BROWSERS[j.browser].label.padEnd(15)} ${j.url}`)
  process.exit(0)
}

let done = 0
const stats = { ready: 0, built: 0, failed: 0 }
const failures = []
const typesSeen = new Map() // "video/slags/tier" → Set(formater)

const tasks = jobs.map((j) => async () => {
  const r = await warm(j.url, BROWSERS[j.browser].ua, maxWaitMs)
  done++
  const tag = `[${String(done).padStart(String(jobs.length).length)}/${jobs.length}]`
  const where = `${j.id}  ${KINDS[j.kind].label} ${j.tier}  ${BROWSERS[j.browser].label}`
  if (r.error) {
    stats.failed++
    failures.push(`${where}: ${r.error}`)
    console.log(`${tag} ${red('✗')} ${where} ${red(r.error)}`)
    return
  }
  if (r.waited) stats.built++
  else stats.ready++
  const key = `${j.id} ${KINDS[j.kind].label} ${j.tier}`
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
