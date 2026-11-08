#!/usr/bin/env node
/**
 * video-savings.mjs
 *
 * Viser i terminalen hvor meget mindre dine Cloudinary-videoer fylder med den
 * nye levering (c_limit + f_auto + q_auto) sammenlignet med den gamle.
 *
 *   node scripts/video-savings.mjs <public_id> [<public_id> ...] [--tiers=small,medium,large]
 *   npm run video:savings -- mappe/min_video
 *
 * public_id er det samme som i admin (uden "cloudinary:" foran og uden filendelse).
 * Det kan også være et helt Cloudinary-link, så pakkes id'et ud.
 *
 * Scriptet henter KUN størrelsen (en forespørgsel på 1 byte), aldrig hele
 * videoen, så det koster næsten ingen bandwidth. MEN: hvis en variant ikke er
 * lavet endnu, starter forespørgslen selve transkodningen hos Cloudinary
 * (koster transformations-credits én gang, og kan tage lidt tid). Derfor er
 * standard kun small + medium; tilføj large med --tiers=small,medium,large.
 *
 * Kræver Node 18+. Ingen pakker.
 *
 * NB: tier-tabellen og URL-opskrifterne nedenfor skal følge
 * src/utils/cloudinaryUrls.ts. Ændrer du dem dér, så ret dem her også.
 */

const CLOUD = 'dq6jxbyrg'

const TIERS = {
  small:  { width: 720,  quality: 'eco',  label: 'Telefon (lodret)' },
  medium: { width: 1280, quality: 'good', label: 'Laptop / tablet' },
  large:  { width: 1920, quality: 'good', label: 'Bred skærm' },
}

// f_auto vælger format ud fra browseren, så vi spørger som to forskellige.
const BROWSERS = {
  chrome: {
    label: 'Chrome',
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  },
  safari: {
    label: 'Safari',
    ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  },
}

// ─── URL'er ────────────────────────────────────────────────────────────────
const base = `https://res.cloudinary.com/${CLOUD}/video/upload/`

// GAMMELT (før ændringen)
const oldHero   = (id, t) => `${base}vc_h264,ac_none/c_limit,w_${TIERS[t].width}/f_mp4/q_auto:${TIERS[t].quality}/${id}.mp4`
const oldPlayer = (id)    => `${base}vc_h264/f_mp4/q_auto:good/${id}.mp4`
// NYT
const newHero   = (id, t) => `${base}c_limit,w_${TIERS[t].width}/ac_none/f_auto/q_auto:${TIERS[t].quality}/${id}.mp4`
const newPlayer = (id, t) => `${base}c_limit,w_${TIERS[t].width}/f_auto/q_auto:${TIERS[t].quality}/${id}.mp4`

// ─── Hjælpere ──────────────────────────────────────────────────────────────
const c = (n, s) => (process.stdout.isTTY ? `\x1b[${n}m${s}\x1b[0m` : s)
const bold = (s) => c(1, s)
const dim = (s) => c(2, s)
const green = (s) => c(32, s)
const red = (s) => c(31, s)

const mb = (bytes) => (bytes / 1024 / 1024).toFixed(1).padStart(6) + ' MB'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function extractPublicId(input) {
  const m = input.match(/\/upload\/(.+)$/)
  if (!m) return input.replace(/^cloudinary:/, '')
  const segs = m[1].split(/[?#]/)[0].split('/')
  let i = 0
  const isTransform = (s) => /^v\d+$/.test(s) || s.split(',').every((p) => /^[a-z]{1,4}_[\w:.+-]*$/i.test(p))
  while (i < segs.length - 1 && isTransform(segs[i])) i++
  const rest = segs.slice(i)
  const last = rest[rest.length - 1]
  const dot = last.lastIndexOf('.')
  rest[rest.length - 1] = dot > 0 ? last.slice(0, dot) : last
  return rest.join('/')
}

/** Henter filstørrelsen med en 1-byte Range-forespørgsel. */
async function fileSize(url, ua) {
  // 423/202 = Cloudinary er ved at lave varianten; vent og prøv igen.
  for (let attempt = 0; attempt < 12; attempt++) {
    let res
    try {
      res = await fetch(url, {
        headers: { 'User-Agent': ua, Range: 'bytes=0-0' },
        signal: AbortSignal.timeout(180_000),
      })
    } catch (err) {
      return { error: err.name === 'TimeoutError' ? 'timeout' : String(err.message || err) }
    }
    // Vi vil kun have headerne, aldrig selve videoen.
    res.body?.cancel().catch(() => {})

    if (res.status === 423 || res.status === 202) {
      await sleep(5000)
      continue
    }
    if (res.status !== 200 && res.status !== 206) {
      return { error: `HTTP ${res.status}${res.headers.get('x-cld-error') ? ' – ' + res.headers.get('x-cld-error') : ''}` }
    }
    const range = res.headers.get('content-range') // "bytes 0-0/12345"
    const total = range ? Number(range.split('/')[1]) : Number(res.headers.get('content-length'))
    if (!Number.isFinite(total) || total <= 1) return { error: 'ingen størrelse i svaret' }
    const type = (res.headers.get('content-type') || '').split(';')[0].replace('video/', '')
    return { bytes: total, type }
  }
  return { error: 'varianten blev ikke færdig i tide – prøv igen om lidt' }
}

// ─── Kør ───────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const tierArg = args.find((a) => a.startsWith('--tiers='))
const tiers = (tierArg ? tierArg.slice(8) : 'small,medium').split(',').filter((t) => TIERS[t])
const ids = args.filter((a) => !a.startsWith('--')).map(extractPublicId)

if (ids.length === 0 || tiers.length === 0) {
  console.log('Brug: node scripts/video-savings.mjs <public_id> [<public_id> ...] [--tiers=small,medium,large]')
  process.exit(1)
}

let grandOld = 0
let grandNew = 0
const grandCounted = { rows: 0 }

for (const id of ids) {
  console.log('\n' + bold(`▶ ${id}`))
  console.log(dim('  Henter størrelser (nye varianter kan tage lidt at lave første gang) …'))

  for (const kind of ['Hero', 'Afspiller']) {
    console.log('\n  ' + bold(kind === 'Hero' ? 'Hero (uden lyd, auto-loop)' : 'Produkt / portfolio / preview (med lyd)'))
    console.log(dim('  ' + 'Enhed'.padEnd(18) + 'Før'.padStart(10) + '   ' + 'Nu i Chrome'.padEnd(28) + 'Nu i Safari'))

    for (const t of tiers) {
      const oldUrl = kind === 'Hero' ? oldHero(id, t) : oldPlayer(id)
      const newUrl = kind === 'Hero' ? newHero(id, t) : newPlayer(id, t)

      const old = await fileSize(oldUrl, BROWSERS.chrome.ua)
      const nowChrome = await fileSize(newUrl, BROWSERS.chrome.ua)
      const nowSafari = await fileSize(newUrl, BROWSERS.safari.ua)

      const cell = (r) => {
        if (r.error) return red(('fejl: ' + r.error).slice(0, 27).padEnd(27))
        if (old.error) return `${mb(r.bytes)} ${dim(r.type.padEnd(5))}`.padEnd(28)
        const saved = Math.round((1 - r.bytes / old.bytes) * 100)
        const pct = (saved >= 0 ? green(`−${saved}%`) : red(`+${-saved}%`)).padEnd(saved >= 0 ? 15 : 15)
        return `${mb(r.bytes)} ${dim(r.type.padEnd(5))} ${pct}`
      }

      console.log(
        '  ' + TIERS[t].label.padEnd(18) +
        (old.error ? red('fejl'.padStart(10)) : mb(old.bytes).padStart(10)) + '   ' +
        cell(nowChrome) + ' ' + cell(nowSafari),
      )
      if (old.error) console.log(dim(`  (gammel version: ${old.error})`))

      if (!old.error && !nowChrome.error) {
        grandOld += old.bytes
        grandNew += nowChrome.bytes
        grandCounted.rows++
      }
    }
  }
}

if (grandCounted.rows > 0) {
  const saved = Math.round((1 - grandNew / grandOld) * 100)
  console.log('\n' + bold('Samlet (Chrome, alle rækker ovenfor lagt sammen, én visning af hver):'))
  console.log(`  Før: ${mb(grandOld).trim()}   Nu: ${mb(grandNew).trim()}   ` + (saved >= 0 ? green(`Besparelse: ${saved}%`) : red(`Øgning: ${-saved}%`)))
  console.log(dim('  Tallene er hele filens størrelse. Faktisk forbrug pr. visning kan være lavere, hvis besøgende ikke ser hele videoen.'))
}
