/**
 * videoSetUpload.ts
 *
 * Admin side of the "Flai Videoversioner" system. The Finder Quick Action
 * (tools/video-versions) makes a zip with 11 files per video:
 *
 *   <slug>/video_<720|1280|1920>_<vp9|hevc|h264>.<webm|mp4>   (9 videos)
 *   <slug>/poster_<960|1920>.jpg                              (2 posters)
 *   <slug>/manifest.json
 *
 * This module reads that zip in the browser (zipReader.ts, nothing is loaded
 * into memory at once), checks that ALL 11 files are there, and uploads every
 * one as a plain Cloudinary asset under the ids defined in cloudinaryUrls.ts
 * (`<slug>--fs`, `<slug>--fs_<w>_<codec>`, `<slug>--fs_poster_<w>`). Plain
 * assets served in their own format are not transformations, so the whole set
 * costs storage + bandwidth only, and every device/browser then plays the
 * smallest file it can decode (see pickVideoCodec / heroVideoTier).
 */

import { readZipEntries, readZipEntryBlob, type ZipEntry } from './zipReader'
import {
  VIDEO_SET_CODECS,
  VIDEO_SET_POSTER_WIDTHS,
  VIDEO_SET_WIDTHS,
  videoSetAllIds,
  videoSetFileId,
  videoSetPosterId,
  type VideoSetCodec,
} from './cloudinaryUrls'

/** Tag put on every asset of a set (the upload webhook ignores these). */
export const VIDEO_SET_TAG = 'flai-versions'

const VIDEO_RE = /^video_(720|1280|1920)_(vp9|hevc|h264)\.(mp4|webm)$/i
const POSTER_RE = /^poster_(960|1920)\.jpe?g$/i

export interface PlannedFile {
  kind: 'video' | 'poster'
  width: number
  codec?: VideoSetCodec
  entry: ZipEntry
  mime: string
  bytes: number
  /** Human label, e.g. "1280 · hevc" */
  label: string
}

export interface VideoSetPlan {
  files: PlannedFile[]
  /** Expected files that are not in the zip, e.g. "video_1280_vp9" */
  missing: string[]
  totalBytes: number
  /** Name from manifest.json (or the zip's folder) to prefill the title with. */
  suggestedSlug: string
  manifest: Record<string, any> | null
  zipBlob: Blob
}

export const isZipFile = (f: { name: string; type?: string }) =>
  /\.zip$/i.test(f.name) || f.type === 'application/zip' || f.type === 'application/x-zip-compressed'

/** Reads the zip's table of contents and checks it against the full 11-file set. */
export async function planVideoSet(zip: Blob): Promise<VideoSetPlan> {
  const entries = await readZipEntries(zip)
  const found = new Map<string, PlannedFile>()

  for (const entry of entries) {
    const v = entry.base.match(VIDEO_RE)
    if (v) {
      const width = Number(v[1])
      const codec = v[2].toLowerCase() as VideoSetCodec
      const ext = v[3].toLowerCase()
      // vp9 must be webm, the others mp4 — anything else would not play.
      if ((codec === 'vp9') !== (ext === 'webm')) continue
      found.set(`${width}_${codec}`, {
        kind: 'video', width, codec, entry,
        mime: ext === 'webm' ? 'video/webm' : 'video/mp4',
        bytes: entry.size,
        label: `${width} · ${codec}`,
      })
      continue
    }
    const p = entry.base.match(POSTER_RE)
    if (p) {
      const width = Number(p[1])
      found.set(`poster_${width}`, {
        kind: 'poster', width, entry, mime: 'image/jpeg', bytes: entry.size, label: `poster ${width}`,
      })
    }
  }

  const missing: string[] = []
  for (const w of VIDEO_SET_WIDTHS) for (const c of VIDEO_SET_CODECS) {
    if (!found.has(`${w}_${c}`)) missing.push(`video_${w}_${c}`)
  }
  for (const w of VIDEO_SET_POSTER_WIDTHS) if (!found.has(`poster_${w}`)) missing.push(`poster_${w}`)

  let manifest: Record<string, any> | null = null
  const manifestEntry = entries.find((e) => e.base.toLowerCase() === 'manifest.json')
  if (manifestEntry) {
    try { manifest = JSON.parse(await (await readZipEntryBlob(zip, manifestEntry)).text()) } catch { /* optional */ }
  }
  const folder = entries[0]?.name.includes('/') ? entries[0].name.split('/')[0] : ''
  const suggestedSlug = String(manifest?.publicId || folder || '').trim()

  const files = [...found.values()]
  return {
    files, missing, manifest, zipBlob: zip, suggestedSlug,
    totalBytes: files.reduce((s, f) => s + f.bytes, 0),
  }
}

export interface UploadOneOpts {
  publicId: string
  resourceType: 'video' | 'image'
  tags: string[]
  caption?: string
  alt?: string
  onProgress: (pct: number) => void
  signal?: AbortSignal
}
export type UploadOne = (blob: Blob, opts: UploadOneOpts) => Promise<unknown>

/**
 * Uploads all files of a planned set. Helpers (posters, the 8 non-root videos)
 * go first and the root (the 1920 H.264, the entry the library shows) goes
 * last, so a set that appears in the library is always complete.
 * Rejects on the first failed file; uploading the same zip again overwrites.
 */
export async function uploadVideoSet(
  plan: VideoSetPlan,
  root: string,
  opts: {
    upload: UploadOne
    caption?: string
    alt?: string
    onProgress: (pct: number, label: string) => void
    signal?: AbortSignal
    concurrency?: number
  },
): Promise<void> {
  if (plan.missing.length) throw new Error(`Zip'en mangler: ${plan.missing.join(', ')}`)

  const jobs = plan.files.map((f) => ({
    file: f,
    id: f.kind === 'poster' ? videoSetPosterId(root, f.width) : videoSetFileId(root, f.width, f.codec!),
  }))
  const isRoot = (j: { id: string }) => j.id === root
  const helpers = jobs.filter((j) => !isRoot(j))
  const rootJob = jobs.find(isRoot)
  if (!rootJob) throw new Error('Zip\'en mangler video_1920_h264, som er sættets hovedfil')

  const total = plan.totalBytes || 1
  const loaded = new Map<string, number>()
  let done = 0
  const report = (label: string) => {
    let sum = 0
    loaded.forEach((v) => { sum += v })
    opts.onProgress(Math.min(99, Math.round((sum / total) * 100)), `${label} (${done}/${jobs.length} filer)`)
  }

  const run = async (j: (typeof jobs)[number]) => {
    if (opts.signal?.aborted) throw new Error('cancelled')
    const blob = await readZipEntryBlob(plan.zipBlob, j.file.entry, j.file.mime)
    const isPoster = j.file.kind === 'poster'
    await opts.upload(blob, {
      publicId: j.id,
      resourceType: isPoster ? 'image' : 'video',
      tags: [VIDEO_SET_TAG],
      // Caption/alt live on the root only (that is what the library shows).
      caption: isRoot(j) ? opts.caption : undefined,
      alt: isRoot(j) ? opts.alt : undefined,
      signal: opts.signal,
      onProgress: (pct) => {
        loaded.set(j.id, Math.round((pct / 100) * j.file.bytes))
        report(`Uploader ${j.file.label}`)
      },
    })
    loaded.set(j.id, j.file.bytes)
    done += 1
    report(`Uploadet ${j.file.label}`)
  }

  // Small worker pool for the helpers (3 at a time keeps a home connection busy
  // without starving any single file), then the root.
  const queue = [...helpers]
  const workers = Array.from({ length: Math.max(1, opts.concurrency ?? 3) }, async () => {
    for (let j = queue.shift(); j; j = queue.shift()) await run(j)
  })
  await Promise.all(workers)
  await run(rootJob)
  opts.onProgress(100, `Alle ${jobs.length} versioner uploadet`)
}

/**
 * Deletes every asset of a set. `del` is called for each id; the root goes last
 * so a half-deleted set never shows up as a working video in the library.
 * Individual failures (e.g. a file that never existed) are collected, not thrown.
 */
export async function deleteVideoSet(
  root: string,
  del: (id: string, resourceType: 'video' | 'image') => Promise<unknown>,
): Promise<{ failed: string[] }> {
  const { videos, posters } = videoSetAllIds(root)
  const failed: string[] = []
  const attempt = async (id: string, rt: 'video' | 'image') => {
    try { await del(id, rt) } catch { failed.push(id) }
  }
  for (const id of posters) await attempt(id, 'image')
  for (const id of videos.filter((v) => v !== root)) await attempt(id, 'video')
  await attempt(root, 'video')
  return { failed }
}
