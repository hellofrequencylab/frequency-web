import { describe, expect, it } from 'vitest'
import { nfcTagMessage, readTagUrl, tagMatches } from './nfc-tag'

const enc = (s: string) => new DataView(new TextEncoder().encode(s).buffer as ArrayBuffer)
const LINK = 'https://frequencylocal.com/n/abc?s=v1.x.y'

describe('nfc-tag', () => {
  it('builds a single url record with the link unchanged', () => {
    expect(nfcTagMessage(LINK)).toEqual({ records: [{ recordType: 'url', data: LINK }] })
  })
  it('reads the url back from a tag', () => {
    expect(readTagUrl([{ recordType: 'url', data: enc(LINK) }])).toBe(LINK)
  })
  it('matches only when the link is the single record', () => {
    expect(tagMatches([{ recordType: 'url', data: enc(LINK) }], LINK)).toBe(true)
    expect(tagMatches([{ recordType: 'url', data: enc(LINK + '&m=nfc') }], LINK)).toBe(false)
    expect(tagMatches([{ recordType: 'url', data: enc(LINK) }, { recordType: 'text' }], LINK)).toBe(false)
    expect(tagMatches([], LINK)).toBe(false)
  })
})
