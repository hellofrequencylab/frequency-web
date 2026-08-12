import { describe, expect, it } from 'vitest'

import { safeHref } from './richtext'

// safeHref is the href allowlist every data-authored link sink shares (ADR-390 follow-up): the
// page-editor design/collection/kit blocks and the marketing CTA all pass operator-supplied strings
// through it. Its comment promised "internal paths or http/https" while the body accepted anything
// starting with a slash, so `//evil.com/x` was an internal path by its own reading. These cases pin
// the promise to the behaviour.
describe('safeHref', () => {
  it('keeps internal paths, fragments and http(s)', () => {
    expect(safeHref('/spaces/x')).toBe('/spaces/x')
    expect(safeHref('/spaces/x?tab=events#top')).toBe('/spaces/x?tab=events#top')
    expect(safeHref('#section')).toBe('#section')
    // An absolute URL is validated by parsing but handed back exactly as authored.
    expect(safeHref('https://frequencylocal.com')).toBe('https://frequencylocal.com')
    expect(safeHref('http://example.com/a?b=1#c')).toBe('http://example.com/a?b=1#c')
    expect(safeHref('  https://frequencylocal.com/join  ')).toBe('https://frequencylocal.com/join')
  })

  it('rejects off-origin targets that a leading slash hides', () => {
    expect(safeHref('//evil.com/x')).toBeNull()
    expect(safeHref('/\\evil.com')).toBeNull()
    expect(safeHref('/\\/evil.com/x')).toBeNull()
  })

  it('rejects script-bearing and unknown schemes, and empties', () => {
    expect(safeHref('javascript:alert(1)')).toBeNull()
    expect(safeHref('data:text/html,<script>x</script>')).toBeNull()
    expect(safeHref('vbscript:msgbox(1)')).toBeNull()
    // mailto:/tel: are safe elsewhere but were never in THIS allowlist; the blocks that use it
    // render <Link>, which is a router target. Widening it is a separate, sighted decision.
    expect(safeHref('mailto:a@b.com')).toBeNull()
    expect(safeHref('')).toBeNull()
    expect(safeHref('   ')).toBeNull()
    expect(safeHref(null)).toBeNull()
    expect(safeHref(undefined)).toBeNull()
  })
})
