import { describe, it, expect } from 'vitest'
import { sanitizeSvg, extractSvg } from './svg-sanitize'

const GOOD =
  '<svg viewBox="0 0 240 150" fill="none" role="img" aria-label="A circle">' +
  '<circle cx="120" cy="75" r="40" class="fill-primary"/>' +
  '<path d="M100 75l15 15 25-30" class="stroke-on-signal" stroke-width="4" stroke-linecap="round"/>' +
  '</svg>'

describe('sanitizeSvg', () => {
  it('accepts a clean house-style SVG', () => {
    const r = sanitizeSvg(GOOD)
    expect(r.ok).toBe(true)
  })

  it('pulls the SVG out of fenced/prose output', () => {
    expect(extractSvg('here you go:\n```svg\n' + GOOD + '\n```')).toBe(GOOD)
  })

  it.each([
    ['<svg><script>alert(1)</script></svg>', 'script'],
    ['<svg onload="x()"><circle/></svg>', 'event handler'],
    ['<svg><image href="http://evil/x.png"/></svg>', 'image/href'],
    ['<svg><use href="#x"/></svg>', 'use'],
    ['<svg><foreignObject><div/></foreignObject></svg>', 'foreignObject'],
    ['<svg><a href="javascript:alert(1)"><circle/></a></svg>', 'anchor/js'],
    ['<svg><rect style="fill:url(#x)"/></svg>', 'inline style'],
    ['<svg><text>hi</text></svg>', 'disallowed tag text'],
    ['<div>not an svg</div>', 'not an svg'],
  ])('rejects %s (%s)', (bad) => {
    const r = sanitizeSvg(bad)
    expect(r.ok).toBe(false)
  })
})
