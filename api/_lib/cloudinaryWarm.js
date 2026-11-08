/**
 * api/_lib/cloudinaryWarm.js
 *
 * Fælles opvarmnings-logik, brugt af BÅDE webhook'en (api/cloudinary-webhook.js)
 * og terminal-scriptet (scripts/warm-videos.mjs). Mappen starter med "_", så
 * Vercel gør den ikke til en funktion.
 *
 * Hvorfor: med f_auto vælger Cloudinary selv format ud fra browseren, og hver
 * kombination (video × størrelse × format) bliver først lavet, når nogen
 * beder om den første gang. Her beder vi selv om alle kombinationerne, ved at
 * spørge som flere forskellige browsere, så den første rigtige besøgende ikke
 * får ventetiden.
 *
 * NB: TIERS / KINDS / variantUrl skal følge src/utils/cloudinaryUrls.ts
 * (HERO_TIERS, optimizedVideoUrl, playerVideoTier). Ændrer du dem dér, så ret
 * dem her også – ellers varmes de forkerte URL'er op.
 */

export const CLOUD = 'dq6jxbyrg'

export const TIERS = {
  small:  { width: 720,  quality: 'eco'  },
  mobile: { width: 810,  quality: 'good' },
  medium: { width: 1280, quality: 'good' },
  large:  { width: 1920, quality: 'good' },
}

// Hero bruger alle fire tiers. Afspillerne bruger playerVideoTier(), som aldrig
// vælger 'mobile' (den bliver til 'small').
export const KINDS = {
  hero:   { label: 'Hero',      tiers: ['small', 'mobile', 'medium', 'large'], audio: false },
  player: { label: 'Afspiller', tiers: ['small', 'medium', 'large'],           audio: true  },
}

// f_auto vælger format ud fra browseren, så vi spørger som flere forskellige.
export const BROWSERS = {
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

/** Samme opskrift som optimizedVideoUrl i src/utils/cloudinaryUrls.ts. */
export function variantUrl(publicId, tier, audio) {
  const { width, quality } = TIERS[tier]
  return (
    `https://res.cloudinary.com/${CLOUD}/video/upload/` +
    `c_limit,w_${width}/` +
    (audio ? '' : 'ac_none/') +
    `f_auto/q_auto:${quality}/${publicId}.mp4`
  )
}

/** Alle (video × slags × størrelse × browser) som skal varmes op. */
export function buildJobs(ids, kinds = Object.keys(KINDS), browsers = Object.keys(BROWSERS)) {
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
  return jobs
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Beder om varianten (1 byte) og venter, til Cloudinary er færdig med at lave
 * den (423/202 = "ved at blive lavet"). Stopper senest ved `deadline` (ms-tid).
 * Returnerer { bytes, type, waited, ms } eller { error } – kaster aldrig.
 */
export async function warmUrl(url, ua, deadline = Date.now() + 10 * 60 * 1000) {
  const started = Date.now()
  let waited = false
  while (Date.now() < deadline) {
    const left = deadline - Date.now()
    let res
    try {
      res = await fetch(url, {
        headers: { 'User-Agent': ua, Range: 'bytes=0-0' },
        signal: AbortSignal.timeout(Math.max(1000, Math.min(120_000, left))),
      })
    } catch (err) {
      if (err.name === 'TimeoutError') { waited = true; continue } // Cloudinary arbejder stadig
      return { error: String(err.message || err) }
    }
    res.body?.cancel().catch(() => {})

    if (res.status === 423 || res.status === 202) {
      waited = true
      await sleep(Math.min(5000, Math.max(0, deadline - Date.now())))
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
  return { error: 'blev ikke færdig i tide' }
}

/** Kører opgaver med begrænset parallelitet. */
export async function runPool(tasks, concurrency) {
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
