import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { Wordmark } from './wordmark'
import { SITE_NAME, SITE_TAGLINE } from '@/lib/site'

// ADR-944 render gate for the logo lockup. Wordmark is a plain server component (no hooks), so it
// runs under renderToStaticMarkup.
//
// 🔴 THE BUG THESE GUARD. The first revision sized the lockup with the caller's `h-9` and set the
// tagline to `text-[0.19em]`, assuming `em` there meant "a fraction of the lockup's height". For
// `font-size`, `em` resolves against the PARENT's font-size — and nothing set one — so the tagline
// inherited the surrounding header (~17px), computed to ~3.2px, and rendered at 6px only because
// Blink floors font-size there. It also rendered at a DIFFERENT size on every surface, since each
// header inherits its own. The fix is that the lockup sets font-size ITSELF, to the mark height,
// which is what makes every `em` inside it a fraction of the mark.

describe('Wordmark — mark alone (the default)', () => {
  it('is a bare image the caller sizes with h-*, and names the BRAND not the picture', () => {
    const html = renderToStaticMarkup(<Wordmark className="h-7 w-auto dark:invert" />)
    expect(html).toContain(`alt="${SITE_NAME}"`)
    expect(html).toContain('h-7 w-auto dark:invert')
    // No lockup scaffolding, and above all no tagline text.
    expect(html).not.toContain('<span')
    expect(html).not.toContain(SITE_TAGLINE)
  })
})

describe('Wordmark — the lockup', () => {
  it('sets its OWN font-size to the mark height, so every em inside is a fraction of the mark', () => {
    const html = renderToStaticMarkup(<Wordmark tagline mark="2rem" />)
    // This assertion IS the fix. Without a font-size here, the tagline's em silently resolves
    // against whatever surface the lockup was dropped into.
    expect(html).toMatch(/font-size:\s*2rem/)
  })

  it('sizes the tagline in em (relative to the mark), never in absolute units', () => {
    const html = renderToStaticMarkup(<Wordmark tagline mark="2rem" />)
    const sizes = [...html.matchAll(/font-size:\s*([^;"]+)/g)].map((m) => m[1].trim())
    // Two font-sizes: the lockup's (the mark height, as passed) and the tagline's (an em of it).
    expect(sizes).toHaveLength(2)
    expect(sizes[0]).toBe('2rem')
    expect(sizes[1]).toMatch(/em$/)
  })

  it('scales end to end: doubling the mark doubles nothing but the one number', () => {
    // The proportions live in the markup as em, so the ONLY thing that differs between two sizes
    // is the lockup's own font-size. If a px value ever leaks in, these two diverge elsewhere.
    const small = renderToStaticMarkup(<Wordmark tagline mark="2rem" />)
    const large = renderToStaticMarkup(<Wordmark tagline mark="4rem" />)
    expect(small.replace(/font-size:\s*2rem/, 'FS')).toBe(large.replace(/font-size:\s*4rem/, 'FS'))
  })

  it('renders the tagline as TEXT so the canon gate can read it', () => {
    // The whole point of ADR-944 #1: baked into the PNG, a retired tagline is invisible to
    // scripts/check-canon.mjs and shipped for months. As text it is greppable.
    const html = renderToStaticMarkup(<Wordmark tagline mark="2rem" />)
    expect(html).toContain(SITE_TAGLINE)
  })

  it('exposes the lockup as ONE image to a screen reader, not a picture plus loose text', () => {
    const html = renderToStaticMarkup(<Wordmark tagline mark="2rem" />)
    expect(html).toContain('role="img"')
    expect(html).toContain(`aria-label="${SITE_NAME}. ${SITE_TAGLINE}."`)
    // The inner img and the tagline are both hidden, so the label is not read twice.
    expect(html).toContain('alt=""')
    expect(html).toContain('aria-hidden')
  })
})

describe('the lockup tagline owes full text contrast', () => {
  // 🔴 A REGRESSION THE AXE SUITE CAUGHT ON MAIN. The footer dimmed the whole lockup with
  // `opacity-50`. That was harmless while the lockup was a single image — but the tagline is TEXT,
  // and 50% took it to 2.67:1 (fg #999286 on the #f5eee2 footer band) against the 4.5:1 that
  // 9.5px bold owes. The fix is that the component NAMES its colour, so contrast is a property of
  // the component rather than of whatever opacity a call site happens to apply.
  it('names a colour token instead of inheriting whatever the surface hands it', () => {
    const html = renderToStaticMarkup(<Wordmark tagline mark="2rem" />)
    expect(html).toContain('text-muted')
  })

  it('a caller may dim the MARK without dimming the tagline with it', () => {
    // The footer's `[&>img]:opacity-50` targets the image alone. If someone reverts it to a bare
    // `opacity-50`, the tagline goes back under the floor — hence the arbitrary variant.
    const footer = readFileSync('components/layout/marketing-footer.tsx', 'utf8')
    // `[\s\S]*?` rather than `[^>]*`: the fix itself contains a `>` inside the `[&>img]:`
    // arbitrary variant, so a `[^>]` scan stops mid-attribute and captures nothing — which made
    // this guard silently pass on an empty string the first time I wrote it.
    const call = footer.match(/<Wordmark tagline[\s\S]*?\/>/)?.[0] ?? ''
    expect(call, 'footer should render the lockup').toContain('tagline')
    // A BARE `opacity-50` dims everything including the text; `[&>img]:opacity-50` dims only the
    // mark. The lookbehind is what separates them — without it this guard also rejects the fix.
    expect(call, 'a bare opacity-* on the lockup dims the tagline text too').not.toMatch(
      /className="[^"]*(?<!\]:)\bopacity-\d/,
    )
  })
})
