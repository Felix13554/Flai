/**
 * zipReader.ts
 *
 * Minimal ZIP reader for the browser (no dependencies). It reads the central
 * directory from the END of the file and hands out each entry as a Blob that is
 * only a *slice* of the zip, so a 300 MB zip is never loaded into memory.
 *
 * Supports "stored" (method 0, what Flai Videoversioner writes) and "deflate"
 * (method 8, via the browser's DecompressionStream). ZIP64 is not supported
 * (entries and archive must be < 4 GB), which is plenty for web video versions.
 */

export interface ZipEntry {
  /** Full path inside the zip, e.g. "mitvideo/video_1280_vp9.webm" */
  name: string
  /** Last path segment, e.g. "video_1280_vp9.webm" */
  base: string
  method: number
  compressedSize: number
  size: number
  localOffset: number
}

const SIG_EOCD = 0x06054b50
const SIG_CEN = 0x02014b50
const SIG_LOC = 0x04034b50

export async function readZipEntries(zip: Blob): Promise<ZipEntry[]> {
  const tailLen = Math.min(zip.size, 22 + 0xffff)
  const tail = new DataView(await zip.slice(zip.size - tailLen).arrayBuffer())

  let eocd = -1
  for (let i = tail.byteLength - 22; i >= 0; i--) {
    if (tail.getUint32(i, true) === SIG_EOCD) { eocd = i; break }
  }
  if (eocd < 0) throw new Error('Filen er ikke en gyldig zip')

  const total = tail.getUint16(eocd + 10, true)
  const cdSize = tail.getUint32(eocd + 12, true)
  const cdOffset = tail.getUint32(eocd + 16, true)
  if (total === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
    throw new Error('Zip64 understøttes ikke')
  }

  const cd = new DataView(await zip.slice(cdOffset, cdOffset + cdSize).arrayBuffer())
  const dec = new TextDecoder('utf-8')
  const out: ZipEntry[] = []
  let p = 0
  while (p + 46 <= cd.byteLength && cd.getUint32(p, true) === SIG_CEN) {
    const method = cd.getUint16(p + 10, true)
    const compressedSize = cd.getUint32(p + 20, true)
    const size = cd.getUint32(p + 24, true)
    const nameLen = cd.getUint16(p + 28, true)
    const extraLen = cd.getUint16(p + 30, true)
    const commentLen = cd.getUint16(p + 32, true)
    const localOffset = cd.getUint32(p + 42, true)
    const name = dec.decode(new Uint8Array(cd.buffer, cd.byteOffset + p + 46, nameLen))
    p += 46 + nameLen + extraLen + commentLen

    // Skip folders and the junk macOS adds.
    if (name.endsWith('/') || name.startsWith('__MACOSX/') || name.endsWith('.DS_Store')) continue
    out.push({ name, base: name.slice(name.lastIndexOf('/') + 1), method, compressedSize, size, localOffset })
  }
  return out
}

/** Returns one entry's bytes as a Blob (a cheap slice for stored entries). */
export async function readZipEntryBlob(zip: Blob, entry: ZipEntry, type = ''): Promise<Blob> {
  const head = new DataView(await zip.slice(entry.localOffset, entry.localOffset + 30).arrayBuffer())
  if (head.byteLength < 30 || head.getUint32(0, true) !== SIG_LOC) throw new Error(`Ødelagt zip-post: ${entry.name}`)
  const start = entry.localOffset + 30 + head.getUint16(26, true) + head.getUint16(28, true)
  const raw = zip.slice(start, start + entry.compressedSize, type)

  if (entry.method === 0) return raw
  if (entry.method === 8) {
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('Din browser kan ikke pakke komprimeret zip ud. Brug en nyere browser.')
    }
    const stream = raw.stream().pipeThrough(new DecompressionStream('deflate-raw'))
    const blob = await new Response(stream).blob()
    return type ? blob.slice(0, blob.size, type) : blob
  }
  throw new Error(`Ukendt zip-komprimering (${entry.method}) i ${entry.name}`)
}
