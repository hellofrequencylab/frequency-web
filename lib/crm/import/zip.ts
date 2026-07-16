// ─────────────────────────────────────────────────────────────────────────────
// ZIP READER (CRM contact import) — a small, dependency-free extractor for the CSV
// entries inside an uploaded archive (e.g. a Notion / CRM export). SERVER-ONLY: it
// uses Node's built-in `zlib` (raw inflate) and never ships to the browser, so we add
// NO archive dependency to the client bundle.
//
// Scope on purpose: we only need the *.csv entries out of a ZIP, so this parses the
// central directory, then inflates each CSV entry (STORED or DEFLATE). It is bounded
// against zip-bombs and path-traversal (caps on entry count + uncompressed size; skips
// absolute / `..` / __MACOSX paths). Anything it cannot safely read is skipped, never
// fatal — the same row-level-partial spirit as the rest of the importer.
// ─────────────────────────────────────────────────────────────────────────────

import { inflateRawSync } from 'node:zlib'

/** Guards. A contact export is small; these are generous ceilings, not targets. */
const MAX_ENTRIES = 100 // CSV entries we will extract before we stop
const MAX_ENTRY_BYTES = 25 * 1024 * 1024 // 25 MB uncompressed per CSV
const MAX_TOTAL_BYTES = 60 * 1024 * 1024 // 60 MB uncompressed across the archive

const SIG_EOCD = 0x06054b50 // End Of Central Directory
const SIG_CDH = 0x02014b50 // Central Directory Header
const SIG_LFH = 0x04034b50 // Local File Header

export interface ZipCsvEntry {
  /** The entry's path inside the archive, verbatim (e.g. "Contacts abc123.csv"). */
  name: string
  /** The decoded UTF-8 text of the CSV. */
  text: string
}

/** A CSV entry we chose to skip, with a short reason (surfaced so nothing is silently dropped). */
export interface ZipSkip {
  name: string
  reason: string
}

export interface ZipReadResult {
  entries: ZipCsvEntry[]
  skipped: ZipSkip[]
}

/** A raw (undecoded) entry pulled from a ZIP: its path + its inflated bytes. */
export interface ZipRawEntry {
  name: string
  bytes: Buffer
}

export interface ZipRawReadResult {
  entries: ZipRawEntry[]
  skipped: ZipSkip[]
}

/** Is this central-directory entry a CSV we should try to read? */
function isCsvName(name: string): boolean {
  return /\.csv$/i.test(name)
}

/** Reject directory traversal, absolute paths, and macOS resource-fork noise. */
function isUnsafeName(name: string): boolean {
  if (name.startsWith('/') || /^[a-zA-Z]:/.test(name)) return true
  if (name.split(/[\\/]/).some((seg) => seg === '..')) return true
  if (name.startsWith('__MACOSX/') || name.split(/[\\/]/).some((seg) => seg.startsWith('._'))) return true
  return false
}

/** Find the End Of Central Directory record by scanning back from the tail. */
function findEocd(buf: Buffer): number {
  // The EOCD is at least 22 bytes and can carry a comment up to 65535 bytes.
  const min = 22
  const start = Math.max(0, buf.length - (min + 0xffff))
  for (let i = buf.length - min; i >= start; i--) {
    if (buf.readUInt32LE(i) === SIG_EOCD) return i
  }
  return -1
}

/**
 * Extract the entries whose name matches `predicate` from a ZIP archive buffer, returning their
 * raw inflated bytes. Never throws on a malformed or partially-unreadable archive: it returns
 * whatever entries it could safely inflate plus a list of what it skipped and why. An empty
 * `entries` with a single skip of reason 'not-a-zip' means the buffer was not a recognizable ZIP.
 *
 * This is the shared engine behind both the CSV reader (readZipCsvEntries) and the XLSX adapter
 * (which pulls the workbook XML parts out of the .xlsx container, itself a ZIP).
 */
export function readZipEntries(buf: Buffer, predicate: (name: string) => boolean): ZipRawReadResult {
  const entries: ZipRawEntry[] = []
  const skipped: ZipSkip[] = []

  const eocd = findEocd(buf)
  if (eocd < 0) return { entries, skipped: [{ name: '', reason: 'not-a-zip' }] }

  const entryCount = buf.readUInt16LE(eocd + 10)
  let cdOffset = buf.readUInt32LE(eocd + 16)
  let totalBytes = 0

  for (let i = 0; i < entryCount; i++) {
    if (cdOffset + 46 > buf.length) break
    if (buf.readUInt32LE(cdOffset) !== SIG_CDH) break

    const method = buf.readUInt16LE(cdOffset + 10)
    const compSize = buf.readUInt32LE(cdOffset + 20)
    const uncompSize = buf.readUInt32LE(cdOffset + 24)
    const nameLen = buf.readUInt16LE(cdOffset + 28)
    const extraLen = buf.readUInt16LE(cdOffset + 30)
    const commentLen = buf.readUInt16LE(cdOffset + 32)
    const localOffset = buf.readUInt32LE(cdOffset + 42)
    const name = buf.toString('utf8', cdOffset + 46, cdOffset + 46 + nameLen)

    // Advance to the next central-directory header before any `continue`.
    cdOffset = cdOffset + 46 + nameLen + extraLen + commentLen

    if (name.endsWith('/')) continue // a directory entry
    if (!predicate(name)) continue // not an entry this caller wants
    if (isUnsafeName(name)) {
      skipped.push({ name, reason: 'unsafe-path' })
      continue
    }
    if (entries.length >= MAX_ENTRIES) {
      skipped.push({ name, reason: 'too-many-entries' })
      continue
    }
    if (uncompSize > MAX_ENTRY_BYTES) {
      skipped.push({ name, reason: 'entry-too-large' })
      continue
    }
    if (totalBytes + uncompSize > MAX_TOTAL_BYTES) {
      skipped.push({ name, reason: 'archive-too-large' })
      continue
    }

    // Resolve the local file header to find where the entry's bytes actually start
    // (the central-directory sizes are authoritative, but the data offset lives here).
    if (localOffset + 30 > buf.length || buf.readUInt32LE(localOffset) !== SIG_LFH) {
      skipped.push({ name, reason: 'bad-local-header' })
      continue
    }
    const lfhNameLen = buf.readUInt16LE(localOffset + 26)
    const lfhExtraLen = buf.readUInt16LE(localOffset + 28)
    const dataStart = localOffset + 30 + lfhNameLen + lfhExtraLen
    const dataEnd = dataStart + compSize
    if (dataEnd > buf.length) {
      skipped.push({ name, reason: 'truncated-entry' })
      continue
    }

    const raw = buf.subarray(dataStart, dataEnd)
    try {
      let out: Buffer
      if (method === 0) {
        out = Buffer.from(raw) // STORED — no compression
      } else if (method === 8) {
        out = inflateRawSync(raw) // DEFLATE
      } else {
        skipped.push({ name, reason: `unsupported-method-${method}` })
        continue
      }
      if (out.length > MAX_ENTRY_BYTES) {
        skipped.push({ name, reason: 'entry-too-large' })
        continue
      }
      totalBytes += out.length
      entries.push({ name, bytes: out })
    } catch {
      skipped.push({ name, reason: 'inflate-failed' })
    }
  }

  return { entries, skipped }
}

/**
 * Extract the CSV entries from a ZIP archive buffer as decoded UTF-8 text. A thin wrapper over
 * readZipEntries with the CSV-name predicate; behavior + skip reasons are unchanged.
 */
export function readZipCsvEntries(buf: Buffer): ZipReadResult {
  const { entries, skipped } = readZipEntries(buf, isCsvName)
  return { entries: entries.map((e) => ({ name: e.name, text: e.bytes.toString('utf8') })), skipped }
}
