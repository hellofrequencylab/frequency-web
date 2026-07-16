import { describe, it, expect } from 'vitest'
import { parseXlsxBuffer } from './xlsx'

// Build a minimal .xlsx (a ZIP of STORED XML parts) by hand so we exercise the reader without a
// binary fixture. Mirrors the hand-built ZIP in zip.test.ts (STORED entries only).
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

function buildZip(entries: { name: string; content: string }[]): Buffer {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0
  for (const e of entries) {
    const nameBuf = Buffer.from(e.name, 'utf8')
    const raw = Buffer.from(e.content, 'utf8')
    const local = Buffer.concat([
      u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(0), u32(raw.length), u32(raw.length), u16(nameBuf.length), u16(0), nameBuf, raw,
    ])
    const localOffset = offset
    offset += local.length
    locals.push(local)
    centrals.push(
      Buffer.concat([
        u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
        u32(0), u32(raw.length), u32(raw.length), u16(nameBuf.length), u16(0), u16(0),
        u16(0), u16(0), u32(0), u32(localOffset), nameBuf,
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

const SHARED =
  '<?xml version="1.0"?><sst><si><t>Name</t></si><si><t>Email</t></si><si><t>Sarah Kim</t></si><si><t>sarah@x.com</t></si></sst>'

describe('parseXlsxBuffer', () => {
  it('reads the first sheet: header row + data rows, resolving shared strings', () => {
    const sheet =
      '<worksheet><sheetData>' +
      '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>' +
      '<row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2" t="s"><v>3</v></c></row>' +
      '</sheetData></worksheet>'
    const buf = buildZip([
      { name: 'xl/sharedStrings.xml', content: SHARED },
      { name: 'xl/worksheets/sheet1.xml', content: sheet },
    ])
    const { source, error } = parseXlsxBuffer(buf)
    expect(error).toBeNull()
    expect(source?.headers).toEqual(['Name', 'Email'])
    expect(source?.rows).toEqual([{ Name: 'Sarah Kim', Email: 'sarah@x.com' }])
  })

  it('places cells by column letter so a gap lines up, and reads inline numbers', () => {
    const shared = '<sst><si><t>Name</t></si><si><t>Age</t></si><si><t>Ada</t></si></sst>'
    // Row 2 skips column A (no name) but has the number in C; header has Name(A) and Age(C).
    const sheet =
      '<worksheet><sheetData>' +
      '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row>' +
      '<row r="2"><c r="A2" t="s"><v>2</v></c><c r="C2"><v>42</v></c></row>' +
      '</sheetData></worksheet>'
    const buf = buildZip([
      { name: 'xl/sharedStrings.xml', content: shared },
      { name: 'xl/worksheets/sheet1.xml', content: sheet },
    ])
    const { source } = parseXlsxBuffer(buf)
    expect(source?.headers).toEqual(['Name', 'Column 2', 'Age'])
    expect(source?.rows[0]).toEqual({ Name: 'Ada', 'Column 2': '', Age: '42' })
  })

  it('returns a calm error (no throw) for a non-workbook buffer', () => {
    const { source, error } = parseXlsxBuffer(Buffer.from('not a workbook', 'utf8'))
    expect(source).toBeNull()
    expect(error).toBeTruthy()
  })
})
