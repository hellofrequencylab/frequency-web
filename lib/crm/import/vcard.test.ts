import { describe, it, expect } from 'vitest'
import { parseVcardText, VCARD_HEADERS } from './vcard'

describe('parseVcardText', () => {
  it('maps FN/EMAIL/TEL/BDAY/ADR and yields one row per card', () => {
    const vcf = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      'FN:Sarah Kim',
      'EMAIL;TYPE=WORK:Sarah@X.com',
      'TEL;TYPE=CELL:+1 (555) 123-4567',
      'BDAY:1990-04-20',
      'ADR;TYPE=HOME:;;123 Main St;Austin;TX;78701;USA',
      'END:VCARD',
      'BEGIN:VCARD',
      'FN:Grace Hopper',
      'EMAIL:grace@navy.mil',
      'END:VCARD',
    ].join('\r\n')
    const src = parseVcardText(vcf)
    expect(src.headers).toEqual([...VCARD_HEADERS])
    expect(src.rows).toHaveLength(2)
    expect(src.rows[0]).toMatchObject({
      Name: 'Sarah Kim',
      Email: 'sarah@x.com',
      Phone: '+1 (555) 123-4567',
      Birthday: '1990-04-20',
      Address: '123 Main St, Austin, TX, 78701, USA',
    })
    expect(src.rows[1]).toMatchObject({ Name: 'Grace Hopper', Email: 'grace@navy.mil' })
  })

  it('composes a name from N when FN is absent (Given Family order)', () => {
    const src = parseVcardText('BEGIN:VCARD\nN:Kim;Sarah;;;\nEMAIL:s@x.com\nEND:VCARD')
    expect(src.rows[0].Name).toBe('Sarah Kim')
  })

  it('unfolds a folded line and strips an item group prefix', () => {
    const vcf = 'BEGIN:VCARD\nFN:Long\n Name\nitem1.EMAIL:a@b.com\nEND:VCARD'
    const src = parseVcardText(vcf)
    expect(src.rows[0].Name).toBe('LongName')
    expect(src.rows[0].Email).toBe('a@b.com')
  })

  it('returns an empty source (no throw) for non-vCard text', () => {
    const src = parseVcardText('just a note, not a card')
    expect(src.rows).toHaveLength(0)
    expect(src.rowCount).toBe(0)
  })

  it('keeps a truncated final card (never-closed VCARD)', () => {
    const src = parseVcardText('BEGIN:VCARD\nFN:Half Card\nEMAIL:half@x.com')
    expect(src.rows).toHaveLength(1)
    expect(src.rows[0].Name).toBe('Half Card')
  })
})
