import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { PageHero } from './page-hero'
import { HEADER_MIN_H } from '@/lib/layout/header-sizes'

// THE TWO SLOTS THAT CLOSED THE COVER GRAMMAR (ADR-1579, owner ruling 2026-09-29: "both onto
// PageHero"). PROG-P5 left two compositions off the grammar by ruling (ADR-1498): the Space profile
// hero, whose name rides the cover in the page theme heading face on the FIXED cover-height ladder,
// and the event poster band, which takes the artwork's own aspect with the tier as a ceiling. Neither
// could be spelled with `variant` + `size`. `frame` and `lockup` are what let both fold without a
// redesign, and this file pins the three things that make that true:
//
//   1. a `frame` puts the fixed size on the SECTION and replaces the min-height ladder (so an
//      aspect-shaped band is the band, not a box clipped inside a taller one);
//   2. a `lockup` renders the caller's node at the identity inset, bottom-anchored, and renders NO
//      h1 of its own (the caller's node owns it, in whatever face the page theme sets);
//   3. a hero that passes neither is byte-identical to before the slots existed.

/** The root element's class list. */
function rootClass(markup: string): string {
  return markup.match(/class="([^"]*)"/)?.[1] ?? ''
}

describe('frame — a fixed frame from the cover ladder', () => {
  it('puts the frame classes and the aspect ratio on the section, in place of rounded-3xl', () => {
    const markup = renderToStaticMarkup(
      <PageHero
        variant="minimal"
        heading={false}
        title="Poster"
        coverImage={null}
        frame={{ className: 'max-h-52 sm:max-h-[22rem] w-full rounded-none sm:rounded-2xl', style: { aspectRatio: '1.5' } }}
      />,
    )
    const root = markup.slice(0, markup.indexOf('>') + 1)
    expect(root.startsWith('<section')).toBe(true)
    expect(root).toContain('max-h-52 sm:max-h-[22rem] w-full rounded-none sm:rounded-2xl')
    expect(root).toContain('aspect-ratio:1.5')
    // ONE radius on the element. This repo's `cn` has no tailwind-merge, so a second `rounded-*`
    // beside the frame's would be settled by emission order rather than by the caller.
    expect(rootClass(markup)).not.toContain('rounded-3xl')
    // The grammar chrome the fold accepted stays: the border and the light strip.
    expect(rootClass(markup)).toContain('border border-border')
    expect(markup).toContain('light-strip')
  })

  it('fills the frame instead of reading the min-height ladder', () => {
    const markup = renderToStaticMarkup(
      <PageHero variant="minimal" heading={false} title="Cover" coverImage={null} size="tall" frame={{ className: 'h-72 sm:h-[22rem] rounded-2xl' }} />,
    )
    expect(markup).not.toContain('min-h-')
    expect(markup).toContain('relative z-10 h-full')
  })
})

describe('lockup — a caller-owned lockup at the identity inset', () => {
  const markup = renderToStaticMarkup(
    <PageHero
      title="Seed Studio"
      coverImage={null}
      overlayStyle="none"
      frame={{ className: 'h-72 sm:h-[22rem] rounded-2xl' }}
      lockup={
        <h1 data-testid="own-h1" className="font-section">
          Seed Studio
        </h1>
      }
    />,
  )

  it('renders the node bottom-anchored at the identity padding, wrapped in the overlay legibility class', () => {
    expect(markup).toContain('relative z-10 flex h-full flex-col justify-end px-5 py-5 sm:px-8 sm:py-8 on-image-text')
    expect(markup).toContain('data-testid="own-h1"')
  })

  it('renders no h1 of its own — the caller keeps the page theme heading face', () => {
    expect(markup.match(/<h1/g) ?? []).toHaveLength(1)
    expect(markup).not.toContain('font-display uppercase')
    expect(markup).not.toContain('sr-only')
  })

  it('takes the identity scrim under shade, lighter at the top than the centered hero', () => {
    const shaded = renderToStaticMarkup(
      <PageHero title="Seed Studio" coverImage={null} overlayStyle="shadow" lockup={<h1>Seed Studio</h1>} />,
    )
    // The identity scrim opens at 45% ink; the centered overlay hero opens at 80%.
    expect(shaded).toContain('var(--color-ink) 45%, transparent) 0%')
    expect(shaded).not.toContain('var(--color-ink) 80%, transparent) 0%')
  })
})

describe('a hero that passes neither slot is unchanged', () => {
  it('keeps rounded-3xl and the min-height ladder on every variant', () => {
    for (const variant of ['overlay', 'identity', 'minimal'] as const) {
      const markup = renderToStaticMarkup(<PageHero variant={variant} title="Friends" coverImage={null} size="standard" />)
      expect(rootClass(markup)).toBe('relative overflow-hidden rounded-3xl border border-border')
      expect(markup).toContain(HEADER_MIN_H.standard)
      expect(markup).not.toContain('h-full')
      // No style attribute on the section: `frame?.style` must render nothing when absent.
      expect(markup.slice(0, markup.indexOf('>') + 1)).not.toContain('style=')
    }
  })
})
