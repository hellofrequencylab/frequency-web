import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

// THE STRIP IS ENFORCED BY A TEST, NOT A SENTENCE (ADR-1562 §3, LIVE-579).
//
// ADR-1121 made `ingestImageBytes` (lib/library/ingest.ts) the one function every Loom upload calls
// with the bytes it is about to store: strip EXIF/XMP/IPTC (orientation kept), checksum the result,
// read the dimensions. For a year that was held by convention and a line in docs/LIBRARY.md, and three
// writers skipped it anyway: the listing seeder, the business seeder and the Studio's replace-file
// action each stored a phone photo exactly as it arrived, GPS block and all, in a PUBLIC bucket.
//
// THE CENSUS. Every source file under lib/, app/ and components/ that calls `.upload(` AND reaches the
// Loom image bucket, by any of the three ways a writer names it today:
//   - the `LIBRARY_MEDIA_BUCKET` constant,
//   - the literal 'library-media' (directly or through a local const),
//   - `classifyLoomUpload(...)`, which routes every image/* to library-media.
// Comments are stripped first, so a file that only MENTIONS the bucket in prose is not a writer and a
// commented-out call cannot satisfy the check. A path that files an object ALREADY in storage (the
// importer's lib/importer/materialize.ts, the event-photo copies) never calls `.upload(` and is not in
// the census: it never holds the bytes (docs/LIBRARY.md → "Not everything can ingest").
//
// THE RULE. A writer in the census imports `ingestImageBytes` from '@/lib/library/ingest', calls it,
// and passes its result (not the raw bytes) to `.upload(`.
//
// THE EXCEPTIONS. Empty on the day this landed. A writer that genuinely cannot ingest goes here with
// the reason, in the same PR that adds it, where review can see it.
const EXEMPT: ReadonlyArray<{ file: string; reason: string }> = []

const ROOTS = ['lib', 'app', 'components']
const SOURCE = /\.(ts|tsx)$/
const TEST = /\.test\.(ts|tsx)$/

/** Block comments and whole-line comments out, string contents kept (a URL is not a comment). */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ')
}

/** True when this (comment-stripped) source writes into the Loom image bucket. */
function isLoomImageWriter(code: string): boolean {
  if (!/\.upload\(/.test(code)) return false
  return (
    /\bLIBRARY_MEDIA_BUCKET\b/.test(code) ||
    /(['"`])library-media\1/.test(code) ||
    /\bclassifyLoomUpload\(/.test(code)
  )
}

/** Why this (comment-stripped) writer does not go through ingest, or null when it does. */
function ingestViolation(code: string): string | null {
  if (!/import\s*\{[^}]*\bingestImageBytes\b[^}]*\}\s*from\s*['"]@\/lib\/library\/ingest['"]/.test(code)) {
    return "does not import ingestImageBytes from '@/lib/library/ingest'"
  }
  if (!/\bingestImageBytes\(/.test(code)) return 'imports ingestImageBytes but never calls it'
  // The bytes handed to storage must be what ingest returned. A raw `arrayBuffer()` straight into
  // `.upload(` is the exact shape the seeders had.
  if (/\.upload\(\s*[^,]+,\s*new Uint8Array\(\s*await\s+\w+\.arrayBuffer\(\)\s*\)/.test(code)) {
    return 'uploads the file bytes as they arrived, not the ingested bytes'
  }
  return null
}

function walk(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (SOURCE.test(entry.name) && !TEST.test(entry.name)) out.push(full)
  }
}

const cwd = process.cwd()
const rel = (f: string) => path.relative(cwd, f).split(path.sep).join('/')

function census(): Map<string, string> {
  const files: string[] = []
  for (const r of ROOTS) walk(path.join(cwd, r), files)
  const writers = new Map<string, string>()
  for (const f of files) {
    const code = stripComments(readFileSync(f, 'utf8'))
    if (isLoomImageWriter(code)) writers.set(rel(f), code)
  }
  return writers
}

const WRITERS = census()

describe('every Loom writer goes through ingest (ADR-1562 §3, LIVE-579)', () => {
  it('the census finds the writers we know about (a broken walker cannot pass by finding nothing)', () => {
    const known = [
      'lib/loom/authorized-image-upload.ts',
      'lib/loom/cover-actions.ts',
      'lib/page-editor/loom-field-actions.ts',
      'lib/email-studio/loom-actions.ts',
      'app/(main)/admin/library/actions.ts',
      'app/(main)/admin/library/replace-actions.ts',
      'app/(main)/admin/library/recraft-actions.ts',
      'app/(main)/admin/listing-seeder/actions.ts',
      'app/(main)/admin/business-seeder/actions.ts',
    ]
    for (const f of known) expect([...WRITERS.keys()], `${f} dropped out of the census`).toContain(f)
  })

  it('the picker delegates to the canonical checked writer', () => {
    const picker = stripComments(readFileSync('lib/loom/picker-actions.ts', 'utf8'))
    expect(picker).toMatch(/return uploadAuthorizedLoomImage\(spaceId, caller\.id, formData\)/)
    expect(picker).not.toMatch(/\.upload\(/)
  })

  it('no writer stores a photo as it arrived', () => {
    const exempt = new Set(EXEMPT.map((e) => e.file))
    const bad: string[] = []
    for (const [file, code] of WRITERS) {
      if (exempt.has(file)) continue
      const why = ingestViolation(code)
      if (why) bad.push(`${file}: ${why}`)
    }
    expect(bad, 'these Loom writers skip the EXIF strip (call ingestImageBytes and upload its .bytes)').toEqual([])
  })

  it('the exception list is empty, and any entry names a real writer and a reason', () => {
    expect(EXEMPT).toEqual([])
    for (const e of EXEMPT) {
      expect(WRITERS.has(e.file), `${e.file} is exempt but is not a writer`).toBe(true)
      expect(e.reason.trim().length).toBeGreaterThan(0)
    }
  })

  // MUTATION CASES: the guard fails when the strip is removed from one seeder.
  describe('mutation: the guard goes red when a seeder drops the strip', () => {
    const seeder = 'app/(main)/admin/listing-seeder/actions.ts'
    const original = () => {
      const code = WRITERS.get(seeder)
      expect(code, `${seeder} is not in the census`).toBeDefined()
      return code as string
    }

    it('the seeder passes as shipped', () => {
      expect(ingestViolation(original())).toBeNull()
    })

    it('removing the import and the call is caught', () => {
      const mutated = original()
        .replace(/import\s*\{\s*ingestImageBytes\s*\}\s*from\s*'@\/lib\/library\/ingest'\n?/, '')
        .replace(
          /const ingested = ingestImageBytes\(([^)]*\)\)), [^)]*\)/,
          'const ingested = { bytes: $1 }',
        )
      expect(mutated).not.toMatch(/ingestImageBytes/)
      expect(isLoomImageWriter(mutated)).toBe(true)
      expect(ingestViolation(mutated)).toMatch(/does not import ingestImageBytes/)
    })

    it('uploading the raw bytes beside a still-present ingest call is caught', () => {
      const mutated = original().replace(
        /\.upload\(path, ingested\.bytes,/,
        '.upload(path, new Uint8Array(await file.arrayBuffer()),',
      )
      expect(mutated).not.toBe(original())
      expect(ingestViolation(mutated)).toMatch(/as they arrived/)
    })

    it('a mention in a comment is not a call', () => {
      const mutated = stripComments(
        original()
          .replace(/const ingested = ingestImageBytes\(([^)]*\)\)), [^)]*\)/, '// ingestImageBytes(x)\n const ingested = { bytes: $1 }'),
      )
      expect(ingestViolation(mutated)).toMatch(/never calls it/)
    })
  })

  it('a new writer that names the bucket through a local const is in the census', () => {
    const code = stripComments(
      "const BUCKET = 'library-media'\nawait admin.storage.from(BUCKET).upload(p, bytes)\n",
    )
    expect(isLoomImageWriter(code)).toBe(true)
    expect(ingestViolation(code)).not.toBeNull()
  })

  it('a file that only mentions the bucket in a comment is not a writer', () => {
    const code = stripComments("// lands in 'library-media'\nawait admin.storage.from('avatars').upload(p, b)\n")
    expect(isLoomImageWriter(code)).toBe(false)
  })
})
