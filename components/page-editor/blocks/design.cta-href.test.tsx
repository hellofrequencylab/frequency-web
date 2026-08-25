import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { PhotoHeroBlock, CardGridBlock, ZigzagBlock, AccentBeatBlock } from './design'

// ─────────────────────────────────────────────────────────────────────────────
// A BUTTON MAY NOT RENDER WITHOUT A DESTINATION — the design blocks (LIVE-115, ADR-1147).
//
// The twin of profile.cta-href.test.tsx. ADR-1125 fixed SpaceCallout and SpaceCTA; the SAME shape
// survived in six more renderers here, four of which said so in their own comments ("a missing link
// falls back to '#' until the operator sets one"). Each gated its button on the LABEL alone and then
// rendered `href={... || '#'}`, so an operator who typed a label and left the link box empty shipped
// a button that left the visitor exactly where they stood.
//
// ⚠️ THE THREE BEHIND `safeHref()` ARE NOT A SEPARATE CASE, which is what made this a triage row
// rather than a sweep. '#' is ALSO what an unsafe url degrades to there — a deliberate stored-XSS
// fallback. Withholding the link is the correct answer to BOTH: a blocked destination and a missing
// one are equally not somewhere to send someone. These tests pin both halves.
// ─────────────────────────────────────────────────────────────────────────────

const anchors = (markup: string) => [...markup.matchAll(/<a\b[^>]*href="([^"]*)"/g)].map((m) => m[1])
const noHashAnchor = (markup: string) => expect(markup).not.toContain('href="#"')

describe('PhotoHeroBlock actions — label AND destination', () => {
  it('draws NO button when the label is set and the href is empty', () => {
    const html = renderToStaticMarkup(
      <PhotoHeroBlock title="A real title" actionPrimaryLabel="Join the beta" actionPrimaryHref="" />,
    )
    expect(anchors(html)).toEqual([])
    noHashAnchor(html)
    expect(html).toContain('A real title')
  })

  it('withholds only the unwired one when the other is complete', () => {
    const html = renderToStaticMarkup(
      <PhotoHeroBlock
        title="A real title"
        actionPrimaryLabel="Join the beta"
        actionPrimaryHref="/join"
        actionSecondaryLabel="Learn more"
        actionSecondaryHref=""
      />,
    )
    expect(anchors(html)).toEqual(['/join'])
  })

  // The wrapper counted LABELS, so withholding every button still drew the empty `mt-8` action row
  // and left a gap under the copy. It now counts buttons that will actually render.
  it('draws no empty action row when every button is withheld', () => {
    const html = renderToStaticMarkup(
      <PhotoHeroBlock title="A real title" actionPrimaryLabel="Join" actionPrimaryHref="" actionSecondaryLabel="More" actionSecondaryHref="" />,
    )
    expect(html).not.toContain('mt-8 flex flex-wrap')
  })
})

describe('CardGridBlock — card links, card buttons, and the browse link', () => {
  it('renders the card title as plain text when its href is missing', () => {
    const html = renderToStaticMarkup(<CardGridBlock cards={[{ title: 'A card', href: '' }]} />)
    expect(anchors(html)).toEqual([])
    expect(html).toContain('A card')
  })

  it('draws NO card button when its label is set and its href is empty', () => {
    const html = renderToStaticMarkup(
      <CardGridBlock cards={[{ title: 'A card', button: { label: 'Open', href: '' } }]} />,
    )
    expect(anchors(html)).toEqual([])
    noHashAnchor(html)
  })

  // safeHref's job: a javascript: url is not a destination, so the button is withheld exactly as a
  // missing one is. This is the arm that proves the two cases converge.
  it('draws NO card button for an UNSAFE href, rather than degrading it to #', () => {
    const html = renderToStaticMarkup(
      // eslint-disable-next-line no-script-url
      <CardGridBlock cards={[{ title: 'A card', button: { label: 'Open', href: 'javascript:alert(1)' } }]} />,
    )
    expect(anchors(html)).toEqual([])
    noHashAnchor(html)
  })

  it('draws NO browse link when labelled with no destination', () => {
    const html = renderToStaticMarkup(<CardGridBlock cards={[{ title: 'A card' }]} browseLabel="See all" browseHref="" />)
    expect(anchors(html)).toEqual([])
    noHashAnchor(html)
  })

  it('draws the browse link once both are set', () => {
    const html = renderToStaticMarkup(
      <CardGridBlock cards={[{ title: 'A card' }]} browseLabel="See all" browseHref="/events" />,
    )
    expect(anchors(html)).toContain('/events')
  })
})

describe('ZigzagBlock inline link', () => {
  it('draws NO link when labelled with no destination', () => {
    const html = renderToStaticMarkup(<ZigzagBlock title="A row" lead="Some copy." ctaLabel="Read on" ctaHref="" />)
    expect(anchors(html)).toEqual([])
    noHashAnchor(html)
    expect(html).toContain('Some copy.')
  })
})

describe('AccentBeatBlock CTA band', () => {
  it('draws NO button when labelled with no destination', () => {
    const html = renderToStaticMarkup(
      <AccentBeatBlock mode="cta" title="Ready?" body="Come along." ctaLabel="Join" ctaHref="" />,
    )
    expect(anchors(html)).toEqual([])
    noHashAnchor(html)
    expect(html).toContain('Come along.')
  })

  it('draws the button at its real destination once both are set', () => {
    const html = renderToStaticMarkup(
      <AccentBeatBlock mode="cta" title="Ready?" body="Come along." ctaLabel="Join" ctaHref="/join" />,
    )
    expect(anchors(html)).toContain('/join')
  })
})
