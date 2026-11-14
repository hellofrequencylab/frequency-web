import { describe, expect, it } from 'vitest'
import { buildFirstTouch, decodeFirstTouch, encodeFirstTouch } from './first-touch'

describe('first-touch cookie trust boundary', () => {
  it('round-trips the actual bounded capture shape', () => {
    const touch = buildFirstTouch(new URLSearchParams('utm_source=email&utm_medium=newsletter&utm_campaign=launch&gclid=click-1'), '/join', 'https://example.com/post')
    expect(decodeFirstTouch(encodeFirstTouch(touch))).toEqual(touch)
  })
  it('does not let malformed JSON shapes break acquisition and lead capture', () => {
    const encoded = (v: unknown) => encodeURIComponent(JSON.stringify(v))
    for (const raw of [null, [], 'value', {}, { ts: '2026-11-12T12:00:00Z', landing: 5 }, { ts: '2026-11-12T12:00:00Z', landing: '/join', utm: [] }, { ts: '2026-11-12T12:00:00Z', landing: '/join', utm: { source: 123 } }]) {
      expect(decodeFirstTouch(encoded(raw))).toBeNull()
    }
    expect(decodeFirstTouch('%not-json')).toBeNull()
    expect(decodeFirstTouch('x'.repeat(9000))).toBeNull()
  })
  it('bounds field sizes and rejects invalid timestamps or external landing URLs', () => {
    for (const patch of [{ ts: 'not-a-date' }, { landing: '//external.test' }, { landing: 'https://external.test/' }, { ref: 'x'.repeat(301) }, { utm: { campaign: 'x'.repeat(201) } }]) {
      expect(decodeFirstTouch(encodeURIComponent(JSON.stringify({ ts: '2026-11-12T12:00:00Z', landing: '/join', ...patch })))).toBeNull()
    }
  })
  it('drops unknown fields and removes private query text from a forged landing path', () => {
    const data = { ts: '2026-11-12T12:00:00Z', landing: '/join?email=private@example.com#token', email: 'private@example.com', utm: { source: 'email', private: 'secret' } }
    expect(decodeFirstTouch(encodeURIComponent(JSON.stringify(data)))).toEqual({ ts: data.ts, landing: '/join', utm: { source: 'email' } })
  })
})
