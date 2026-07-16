import { describe, it, expect } from 'vitest'
import { deflateRawSync } from 'node:zlib'
import { readZipCsvEntries } from './zip'

// A deflate-bomb: a stream that INFLATES to far more than the per-entry cap, while the central
// directory UNDER-reports the uncompressed size so it slips past the pre-inflation size check.
// The `inflateRawSync(raw, { maxOutputLength })` guard must abort mid-inflation (RangeError →
// skipped 'inflate-failed') instead of allocating the whole payload first.
function buildBombZip(name: string, uncompressedBytes: number, declaredUncompSize: number): Buffer {
  const nameBuf = Buffer.from(name, 'utf8')
  const raw = Buffer.alloc(uncompressedBytes) // zeros compress to almost nothing
  const stored = deflateRawSync(raw)
  const local = Buffer.concat([
    u32(0x04034b50), u16(20), u16(0), u16(8), u16(0), u16(0),
    u32(0), u32(stored.length), u32(declaredUncompSize), u16(nameBuf.length), u16(0), nameBuf, stored,
  ])
  const central = Buffer.concat([
    u32(0x02014b50), u16(20), u16(20), u16(0), u16(8), u16(0), u16(0),
    u32(0), u32(stored.length), u32(declaredUncompSize), u16(nameBuf.length), u16(0), u16(0),
    u16(0), u16(0), u32(0), u32(0), nameBuf,
  ])
  const eocd = Buffer.concat([
    u32(0x06054b50), u16(0), u16(0), u16(1), u16(1),
    u32(central.length), u32(local.length), u16(0),
  ])
  return Buffer.concat([local, central, eocd])
}

// Build a minimal ZIP by hand so we can exercise the reader without a fixture file. Supports STORED
// (method 0) and DEFLATE (method 8) entries, which is exactly what the reader handles.
const u16 = (n: number) => {
  const b = Buffer.alloc(2)
  b.writeUInt16LE(n)
  return b
}
const u32 = (n: number) => {
  const b = Buffer.alloc(4)
  b.writeUInt32LE(n)
  return b
}

function buildZip(entries: { name: string; content: string; method: 0 | 8 }[]): Buffer {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  const offsets: number[] = []
  let offset = 0
  for (const e of entries) {
    const nameBuf = Buffer.from(e.name, 'utf8')
    const raw = Buffer.from(e.content, 'utf8')
    const stored = e.method === 8 ? deflateRawSync(raw) : raw
    const local = Buffer.concat([
      u32(0x04034b50), u16(20), u16(0), u16(e.method), u16(0), u16(0),
      u32(0), u32(stored.length), u32(raw.length), u16(nameBuf.length), u16(0), nameBuf, stored,
    ])
    offsets.push(offset)
    offset += local.length
    locals.push(local)
    centrals.push(
      Buffer.concat([
        u32(0x02014b50), u16(20), u16(20), u16(0), u16(e.method), u16(0), u16(0),
        u32(0), u32(stored.length), u32(raw.length), u16(nameBuf.length), u16(0), u16(0),
        u16(0), u16(0), u32(0), u32(offsets[offsets.length - 1]), nameBuf,
      ]),
    )
  }
  const localBlock = Buffer.concat(locals)
  const cd = Buffer.concat(centrals)
  const eocd = Buffer.concat([
    u32(0x06054b50), u16(0), u16(0), u16(entries.length), u16(entries.length),
    u32(cd.length), u32(localBlock.length), u16(0),
  ])
  return Buffer.concat([localBlock, cd, eocd])
}

describe('readZipCsvEntries', () => {
  it('extracts stored and deflated CSV entries and ignores non-CSV files', () => {
    const zip = buildZip([
      { name: 'Contacts abc123.csv', content: 'name,email\nAda,ada@x.com\n', method: 0 },
      { name: 'nested/More.csv', content: 'name,email\nGrace,grace@y.com\n', method: 8 },
      { name: 'readme.txt', content: 'ignore me', method: 0 },
    ])
    const { entries } = readZipCsvEntries(zip)
    expect(entries.map((e) => e.name).sort()).toEqual(['Contacts abc123.csv', 'nested/More.csv'])
    const byName = Object.fromEntries(entries.map((e) => [e.name, e.text]))
    expect(byName['Contacts abc123.csv']).toContain('ada@x.com')
    expect(byName['nested/More.csv']).toContain('grace@y.com')
  })

  it('skips path-traversal and macOS resource-fork entries with a reason', () => {
    const zip = buildZip([
      { name: '../evil.csv', content: 'a,b\n1,2\n', method: 0 },
      { name: '__MACOSX/._Contacts.csv', content: 'junk', method: 0 },
      { name: 'ok.csv', content: 'a,b\n1,2\n', method: 0 },
    ])
    const { entries, skipped } = readZipCsvEntries(zip)
    expect(entries.map((e) => e.name)).toEqual(['ok.csv'])
    expect(skipped.some((s) => s.name === '../evil.csv' && s.reason === 'unsafe-path')).toBe(true)
  })

  it('aborts a deflate-bomb mid-inflation instead of allocating the whole payload', () => {
    // 26 MB of zeros inflates past the 25 MB per-entry cap, but the CD claims only 100 bytes so it
    // clears the pre-inflation size check. The maxOutputLength guard must stop it → skipped, no entry.
    const zip = buildBombZip('bomb.csv', 26 * 1024 * 1024, 100)
    const { entries, skipped } = readZipCsvEntries(zip)
    expect(entries).toHaveLength(0)
    expect(skipped.some((s) => s.name === 'bomb.csv' && s.reason === 'inflate-failed')).toBe(true)
  })

  it('reports a non-zip buffer instead of throwing', () => {
    const { entries, skipped } = readZipCsvEntries(Buffer.from('not a zip at all', 'utf8'))
    expect(entries).toHaveLength(0)
    expect(skipped[0]?.reason).toBe('not-a-zip')
  })
})
