/**
 * api/_lib/cloudinaryWarm.js
 *
 * Fælles opvarmnings-logik, brugt af BÅDE webhook'en (api/cloudinary-webhook.js)
 * og terminal-scriptet (scripts/warm-videos.mjs). Mappen starter med "_", så
 * Vercel gør den ikke til en funktion.
 *
 * Hvorfor: hver kombination (video × størrelse) bliver først lavet hos
 * Cloudinary, når nogen beder om den første gang. Her beder vi selv om dem, så
 * den første rigtige besøgende ikke får ventetiden.
 *
 * ─── Kun så få transformationer som muligt ──────────────────────────────────
 * Hver forskellig URL er et selvstændigt afledt asset, der transkodes (og
 * tæller som transformations-credits) én gang. Derfor:
 *   • ÉT format (H.264 MP4). Før brugte vi f_auto, og så lavede Cloudinary et
 *     asset pr. browser-familie (WebM, HEVC, AV1 …) – og vi spurgte som fem
 *     forskellige browsere for at få dem alle lavet.
 *   • ÉN URL pr. størrelse, delt mellem hero og afspillere (før var hero uden
 *     lyd og afspillere med lyd = to assets pr. størrelse).
 *   • TRE størrelser (720 / 1280 / 1920).
 * Resultat: 3 transformationer pr. video i alt (før op til ca. 20-35).
 *
 * NB: TIERS / variantUrl skal følge src/utils/cloudinaryUrls.ts (HERO_TIERS,
 * optimizedVideoUrl). Ændrer du dem dér, så ret dem her også – ellers varmes de
 * forkerte URL'er op (og så betaler du for assets, ingen bruger).
 */

export const CLOUD = 'dq6jxbyrg'

// De tre størrelser siderne faktisk bruger. 'mobile' i cloudinaryUrls.ts har
// samme tal som 'small' og er derfor samme URL – den skal ikke varmes op for sig.
export const TIERS = {
  small:  { width: 720,  quality: 'good' },
  medium: { width: 1280, quality: 'good' },
  large:  { width: 1920, quality: 'good' },
}

// Det format er fast, så browseren bestemmer ikke længere, hvad Cloudinary
// laver. Én forespørgsel pr. størrelse er nok; user-agenten er ligegyldig.
export const WARM_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'

/** Samme opskrift som optimizedVideoUrl i src/utils/cloudinaryUrls.ts. */
export function variantUrl(publicId, tier) {
  const { width, quality } = TIERS[tier]
  return (
    `https://res.cloudinary.com/${CLOUD}/video/upload/` +
    `vc_h264/c_limit,w_${width}/f_mp4/q_auto:${quality}/${publicId}.mp4`
  )
}

/** Alle (video × størrelse) som skal varmes op. Aldrig dubletter. */
export function buildJobs(ids, tiers = Object.keys(TIERS)) {
  const jobs = []
  const seen = new Set()
  for (const id of ids) {
    for (const t of tiers) {
      const url = variantUrl(id, t)
      if (seen.has(url)) continue
      seen.add(url)
      jobs.push({ id, tier: t, url })
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
export async function warmUrl(url, ua = WARM_UA, deadline = Date.now() + 10 * 60 * 1000) {
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
