import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { DesignBlockView, withDesignDemo, isDesignBlock } from './design-block-view'

// Render gate for the shared design blocks as rendered in the RAIL arranger + the live space page (through
// DesignBlockView). Proves: an EMPTY slot renders NOTHING on the live page (owner directive — no placeholder
// leaks like "SECTION LABEL"); an escaped-entity title decodes to real characters (no `&#39;`); a button shows
// once labelled even without a link and can be toggled off (Fix 8). Server-safe, so they run under
// renderToStaticMarkup in the node test env.

describe('withDesignDemo (the pure prompt helper — no longer wired into the live render)', () => {
  it('fills empty slots with the block prompt and keeps authored values', () => {
    const merged = withDesignDemo('photoHero', { title: 'My real headline' })
    expect(merged.title).toBe('My real headline') // authored wins
    expect(merged.eyebrow).toBe('Section label') // demo fills the empty slot
    expect(merged.subtitle).toBe('Add a line that says what this page is about.')
  })

  it('is a no-op for a non-design id', () => {
    expect(withDesignDemo('about', { x: 1 })).toEqual({ x: 1 })
  })
})

describe('isDesignBlock', () => {
  it('recognises the five design ids', () => {
    for (const id of ['photoHero', 'editorial', 'cardGrid', 'zigzag', 'accentBeat']) {
      expect(isDesignBlock(id)).toBe(true)
    }
    expect(isDesignBlock('about')).toBe(false)
  })
})

describe('DesignBlockView — an empty slot renders nothing on the live page (no placeholder leak)', () => {
  it('an EMPTY photoHero bag does NOT leak the demo prompt onto the page', () => {
    const html = renderToStaticMarkup(<DesignBlockView id="photoHero" props={{}} />)
    expect(html).not.toContain('Your headline goes here')
    expect(html).not.toContain('Section label')
  })

  it('an EMPTY editorial bag does NOT leak its writing prompt', () => {
    const html = renderToStaticMarkup(<DesignBlockView id="editorial" props={{}} />)
    expect(html).not.toContain('Your heading goes here')
    expect(html).not.toContain('Section label')
  })

  it('an authored eyebrow renders, an empty one does not', () => {
    const withEyebrow = renderToStaticMarkup(
      <DesignBlockView id="accentBeat" props={{ eyebrow: 'Reserve', title: 'Book now' }} />,
    )
    expect(withEyebrow).toContain('Reserve')
    const noEyebrow = renderToStaticMarkup(<DesignBlockView id="accentBeat" props={{ title: 'Book now' }} />)
    expect(noEyebrow).toContain('Book now')
    expect(noEyebrow).not.toContain('Section label')
  })

  it('decodes an escaped-entity title to real characters (no literal &#39;)', () => {
    const html = renderToStaticMarkup(<DesignBlockView id="cardGrid" props={{ title: 'What&#39;s here' }} />)
    // Decoded to a real apostrophe, which React re-escapes to `&#x27;` (a browser renders that AS `'`). The bug
    // shape was the LITERAL entity surviving to the page: raw `&#39;`, i.e. `&amp;#39;` in the served HTML.
    expect(html).toContain('What&#x27;s here')
    expect(html).not.toContain('&amp;#39;')
  })
})

describe('DesignBlockView button always shows once labelled (Fix 8)', () => {
  it('photoHero renders the button with NO link set (falls back to #)', () => {
    const html = renderToStaticMarkup(
      <DesignBlockView id="photoHero" props={{ title: 'Hi', buttonLabel: 'Get started' }} />,
    )
    expect(html).toContain('Get started')
    expect(html).toContain('href="#"')
  })

  it('accentBeat renders the CTA with no link (falls back to #)', () => {
    const html = renderToStaticMarkup(
      <DesignBlockView id="accentBeat" props={{ title: 'Hi', buttonLabel: 'Join now' }} />,
    )
    expect(html).toContain('Join now')
  })

  it('the button toggle OFF (buttonOn:false) hides the button entirely', () => {
    const html = renderToStaticMarkup(
      <DesignBlockView id="photoHero" props={{ title: 'Hi', buttonLabel: 'Get started', buttonOn: false }} />,
    )
    expect(html).not.toContain('Get started')
  })
})

describe('Banner height + content layout (ADR-571 tasks 2 + 3)', () => {
  it('the "beside" display renders a two-column grid (photo beside the copy), not an overlay scrim', () => {
    const html = renderToStaticMarkup(
      <DesignBlockView
        id="photoHero"
        props={{ title: 'Beside', image: 'https://example.com/a.jpg', alt: 'A', display: 'beside' }}
      />,
    )
    expect(html).toContain('md:grid-cols-2')
    // beside reads in theme tokens, so no on-ink overlay text-shadow treatment
    expect(html).not.toContain('text-on-ink')
  })

  it('the "tall" overlay height applies the tall min-height', () => {
    const html = renderToStaticMarkup(
      <DesignBlockView
        id="photoHero"
        props={{ title: 'Tall', image: 'https://example.com/a.jpg', alt: 'A', display: 'overlay', height: 'tall' }}
      />,
    )
    expect(html).toContain('min-h-[70vh]')
  })

  it('a bad height / display value falls back to the block defaults (no crash)', () => {
    const html = renderToStaticMarkup(
      <DesignBlockView id="photoHero" props={{ title: 'Safe', height: 'huge', display: 'sideways' }} />,
    )
    expect(html).toContain('Safe')
    // default display is overlay → default height medium
    expect(html).toContain('min-h-[55vh]')
  })
})

describe('the two text design blocks (ADR-571 task 7)', () => {
  it('an empty displayHeading renders nothing (no demo prompt leaks to the page)', () => {
    const html = renderToStaticMarkup(<DesignBlockView id="displayHeading" props={{}} />)
    expect(html).toBe('')
  })

  it('an empty prose renders nothing (no demo prompt leaks to the page)', () => {
    const html = renderToStaticMarkup(<DesignBlockView id="prose" props={{}} />)
    expect(html).toBe('')
  })

  it('an authored displayHeading renders the operator title, not the prompt', () => {
    const html = renderToStaticMarkup(<DesignBlockView id="displayHeading" props={{ text: 'Real title' }} />)
    expect(html).toContain('Real title')
    expect(html).not.toContain('Your big heading')
  })

  it('recognises both new ids as design blocks', () => {
    expect(isDesignBlock('displayHeading')).toBe(true)
    expect(isDesignBlock('prose')).toBe(true)
  })
})
