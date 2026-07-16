import { describe, it, expect } from 'vitest'
import { parseNotesText, NOTES_HEADERS } from './notes'

describe('parseNotesText', () => {
  it('reads one email per line', () => {
    const { source, skipped } = parseNotesText('a@x.com\nb@y.com')
    expect(source.headers).toEqual([...NOTES_HEADERS])
    expect(source.rows.map((r) => r.Email)).toEqual(['a@x.com', 'b@y.com'])
    expect(skipped).toBe(0)
  })

  it('reads "Name <email>"', () => {
    const { source } = parseNotesText('Sarah Kim <Sarah@X.com>')
    expect(source.rows[0]).toMatchObject({ Name: 'Sarah Kim', Email: 'sarah@x.com', Phone: '' })
  })

  it('reads "name, email, phone" in any order', () => {
    const { source } = parseNotesText('Grace Hopper, grace@x.com, (555) 123-4567')
    expect(source.rows[0]).toMatchObject({ Name: 'Grace Hopper', Email: 'grace@x.com', Phone: '(555) 123-4567' })
    const { source: reordered } = parseNotesText('555-000-1111; jo@x.com; Jo Lee')
    expect(reordered.rows[0]).toMatchObject({ Name: 'Jo Lee', Email: 'jo@x.com', Phone: '555-000-1111' })
  })

  it('reads a leading name before an inline email', () => {
    const { source } = parseNotesText('Call Dana dana@x.com about the deck')
    expect(source.rows[0].Email).toBe('dana@x.com')
    expect(source.rows[0].Name).toContain('Dana')
  })

  it('drops unparseable lines to a skipped count, never throwing', () => {
    const { source, skipped } = parseNotesText('a@x.com\njust a random thought\n   \nmilk and eggs')
    expect(source.rows).toHaveLength(1)
    expect(skipped).toBe(2) // the two non-empty lines with no email/phone
  })
})
