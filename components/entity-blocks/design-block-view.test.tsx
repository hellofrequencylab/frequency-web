import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { DesignBlockView, withDesignDemo, isDesignBlock } from './design-block-view'

// Fix 6/7/8 render gate for the shared design blocks as rendered in the RAIL arranger + the live space page
// (through DesignBlockView). Proves: an empty bag shows the explanatory DEMO prompt (Fix 7); a button shows
// once labelled even without a link and can be toggled off (Fix 8). The blocks are server-safe, so they run
// under renderToStaticMarkup in the node test env.

describe('withDesignDemo (Fix 7)', () => {
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

describe('DesignBlockView demo content (Fix 7)', () => {
  it('an EMPTY photoHero bag renders the explanatory prompt, not a blank block', () => {
    const html = renderToStaticMarkup(<DesignBlockView id="photoHero" props={{}} />)
    expect(html).toContain('Your headline goes here')
    expect(html).toContain('Section label')
  })

  it('an EMPTY editorial bag renders its writing prompt', () => {
    const html = renderToStaticMarkup(<DesignBlockView id="editorial" props={{}} />)
    expect(html).toContain('Your heading goes here')
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
  it('an empty displayHeading renders its demo prompt', () => {
    const html = renderToStaticMarkup(<DesignBlockView id="displayHeading" props={{}} />)
    expect(html).toContain('Your big heading')
  })

  it('an empty prose renders its demo prompt', () => {
    const html = renderToStaticMarkup(<DesignBlockView id="prose" props={{}} />)
    expect(html).toContain('Write a paragraph of body text here.')
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
