import { describe, expect, it } from 'vitest'
import { appendUtm } from './utm'

const opts = { siteUrl: 'https://frequencylocal.com', campaign: 'email-ab12cd34' }

describe('appendUtm', () => {
  it('tags a link back to this site', () => {
    const out = appendUtm('<a href="https://frequencylocal.com/events/sound-bath">Go</a>', opts)
    expect(out).toContain('utm_source=frequency&amp;utm_medium=email&amp;utm_campaign=email-ab12cd34')
    expect(out).toContain('href="https://frequencylocal.com/events/sound-bath?')
  })
  it('keeps an existing query and never overwrites a hand-typed utm', () => {
    const out = appendUtm('<a href="https://frequencylocal.com/x?a=1&amp;utm_source=partner">Go</a>', opts)
    expect(out).toContain('a=1')
    expect(out).toContain('utm_source=partner')
    expect(out).not.toContain('utm_source=frequency')
    expect(out).toContain('utm_medium=email')
  })
  it('leaves other sites, mailto and the unsubscribe and manage links alone', () => {
    const html =
      '<a href="https://example.org/a">A</a><a href="mailto:hi@x.co">M</a>' +
      '<a href="https://frequencylocal.com/unsubscribe?t=abc">U</a><a href="https://frequencylocal.com/manage-emails?t=abc">M</a>'
    expect(appendUtm(html, opts)).toBe(html)
  })
  it('returns the html unchanged when the site url is unusable', () => {
    expect(appendUtm('<a href="https://x.co/a">A</a>', { ...opts, siteUrl: 'not a url' })).toBe('<a href="https://x.co/a">A</a>')
  })
})
