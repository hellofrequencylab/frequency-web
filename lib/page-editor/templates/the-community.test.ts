import { describe, it, expect } from 'vitest'
import { data } from '@/lib/page-editor/templates/the-community'
import { isRenderable } from '@/lib/page-editor/templates'
import { config } from '@/lib/page-editor/config'

// /the-community renders this template (the coded body is the unreachable legacy rung), and until
// LIVE-040 it emitted no FAQPage: COMMUNITY_FAQ and its faqSchema() call sat on the branch of
// `data ? … : …` that can never be taken. The fix was not a schema patch: the Q&A were recovered
// verbatim from the route into an Accordion block, which emits the FAQPage node itself from the
// items it visibly renders (components/page-editor/blocks/collections.tsx). Four of the five: the
// cost answer quoted the pay-what-you-want floor as a fixed Crew price, which the CREW_NOTE
// contract forbids (lib/pricing/pricing-page.ts), so it was flagged rather than carried forward.
// These assertions follow article.test.ts: they run the CURRENT block config over the live
// document, so a block rename or an emptied item list breaks here rather than as
// silently-vanished structured data.

const accordions = data.content.filter((b) => b.type === 'Accordion')

describe('the-community template renders under the current config', () => {
  it('is renderable, and composes only registered block types', () => {
    expect(isRenderable(data)).toBe(true)
    const unregistered = data.content.map((b) => b.type).filter((t) => !(t in config.components))
    expect(unregistered).toEqual([])
  })
})

describe('FAQPage — the Accordion carries every question, and it is never optional', () => {
  it('has exactly ONE Accordion, so the page emits exactly one FAQPage node', () => {
    expect(accordions).toHaveLength(1)
  })

  it('every pair survives the block filter, so the node carries all four questions', () => {
    // AccordionBlock emits only pairs where BOTH q and a are non-empty (Google requires both) and
    // omits the FAQPage entirely when none qualify. An Accordion with hollow items satisfies a
    // word-search probe while the page still emits nothing; this is the assertion that closes that
    // gap (LIVE-040: "THE OLD PROBE WAS A WORD SEARCH").
    const items = accordions[0].props.items as { q?: string; a?: string }[]
    const wellFormed = items.filter((i) => (i.q ?? '').trim() && (i.a ?? '').trim())
    expect(wellFormed).toHaveLength(items.length)
    expect(items).toHaveLength(4)
  })

  it('asks the four recovered questions, verbatim', () => {
    const items = accordions[0].props.items as { q: string }[]
    expect(items.map((i) => i.q)).toEqual([
      'What is a Circle?',
      'What is a Channel?',
      'What are the four Pillars?',
      'How does a Circle grow?',
    ])
  })
})
