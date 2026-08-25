import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { SpaceCalloutBlock, SpaceCTABlock } from './profile'
import { generateDefaultSpacePage } from '@/lib/page-editor/templates/space-default'

// ─────────────────────────────────────────────────────────────────────────────
// A BUTTON MAY NOT RENDER WITHOUT A DESTINATION (ADR-1125, backlog LIVE-109).
//
// Both of these blocks used to gate their button on `ctaLabel` alone and then fall back to
// `href={ctaHref || '#'}`. That fallback is the root cause of the 18 dead "Get in touch" buttons in
// production: the seed shipped '#', and — the part that matters for the fix — blanking the seed would
// NOT have removed the button, because an empty href fell back to '#' too. LIVE-109 asserted the
// opposite ("SpaceCallout, like MediaText, renders its CTA only when label and href are both set");
// it was true of MediaText and false of these two. These tests pin the corrected rule.
// ─────────────────────────────────────────────────────────────────────────────

const anchors = (markup: string) => [...markup.matchAll(/<a\b[^>]*href="([^"]*)"/g)].map((m) => m[1])

describe('SpaceCalloutBlock — a button needs a label AND a destination', () => {
  it('draws NO anchor when ctaHref is empty, even though ctaLabel is set', () => {
    const html = renderToStaticMarkup(
      <SpaceCalloutBlock heading="Come say hello" body="Say hi." ctaLabel="Get in touch" ctaHref="" />,
    )
    expect(anchors(html)).toEqual([])
    // The band itself still renders — the heading and body are real content.
    expect(html).toContain('Come say hello')
  })

  it("draws NO anchor when ctaHref is missing entirely (the '#' fallback is gone)", () => {
    const html = renderToStaticMarkup(<SpaceCalloutBlock heading="Come say hello" ctaLabel="Get in touch" />)
    expect(anchors(html)).toEqual([])
    expect(html).not.toContain('href="#"')
  })

  it('draws the anchor at its real destination once both are set', () => {
    const html = renderToStaticMarkup(
      <SpaceCalloutBlock heading="Come say hello" ctaLabel="Get in touch" ctaHref="#contact" />,
    )
    expect(anchors(html)).toEqual(['#contact'])
  })

  it('renders nothing at all on the live page with no heading and no usable button', () => {
    expect(renderToStaticMarkup(<SpaceCalloutBlock ctaLabel="Get in touch" ctaHref="" />)).toBe('')
  })
})

describe('SpaceCTABlock — the same rule, same file, same defect', () => {
  it('draws NO anchor when ctaHref is empty', () => {
    const html = renderToStaticMarkup(<SpaceCTABlock heading="Ready when you are" ctaLabel="Get started" ctaHref="" />)
    expect(anchors(html)).toEqual([])
    expect(html).not.toContain('href="#"')
  })

  it('draws the anchor once both are set', () => {
    const html = renderToStaticMarkup(
      <SpaceCTABlock heading="Ready when you are" ctaLabel="Get started" ctaHref="/join" />,
    )
    expect(anchors(html)).toEqual(['/join'])
  })
})

describe("the seeded default Space page ships no '#' link", () => {
  it("seeds an EMPTY ctaHref on the closing callout, never '#'", () => {
    const doc = generateDefaultSpacePage('Willow Studio')
    const callout = doc.content.find((b) => b.type === 'SpaceCallout')!.props as Record<string, unknown>
    expect(callout.ctaHref).toBe('')
    expect(callout.ctaLabel).toBe('Get in touch')
  })

  it("carries no '#' href in ANY block of the seeded document", () => {
    const doc = generateDefaultSpacePage('Willow Studio')
    const dead: string[] = []
    for (const block of doc.content) {
      for (const [key, value] of Object.entries(block.props as Record<string, unknown>)) {
        if (typeof value !== 'string') continue
        if (!/href|url|link/i.test(key)) continue
        if (value === '#') dead.push(`${block.type}.${key}`)
      }
    }
    expect(dead).toEqual([])
  })

  it('renders the seeded callout with no anchor at day zero (a new Space has nowhere to send anyone yet)', () => {
    const doc = generateDefaultSpacePage('Willow Studio')
    const props = doc.content.find((b) => b.type === 'SpaceCallout')!.props as Record<string, string>
    const html = renderToStaticMarkup(
      <SpaceCalloutBlock
        heading={props.heading}
        body={props.body}
        ctaLabel={props.ctaLabel}
        ctaHref={props.ctaHref || undefined}
      />,
    )
    expect(anchors(html)).toEqual([])
    expect(html).toContain('Come say hello')
  })
})
