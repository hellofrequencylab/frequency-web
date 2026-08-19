import { describe, it, expect } from 'vitest'
import { data } from '@/lib/page-editor/templates/the-lab'
import { isRenderable } from '@/lib/page-editor/templates'
import { config } from '@/lib/page-editor/config'

// /the-lab is TEMPLATE-ONLY (Lift 5c, ADR-1068): this document is the page. The route emitted no
// FAQPage from the day the template landed until LIVE-040, because the five-entry THE_LAB_FAQ and
// its faqSchema() call sat on the coded body's unreachable legacy branch. The fix was not a schema
// patch: the five Q&A were recovered verbatim from git history (the retirement commit c3228d76c)
// into an Accordion block, which emits the FAQPage node itself from the items it visibly renders
// (components/page-editor/blocks/collections.tsx). These assertions follow article.test.ts: they
// run the CURRENT block config over the live document, so a block rename or an emptied item list
// breaks here rather than as silently-vanished structured data.

const accordions = data.content.filter((b) => b.type === 'Accordion')

describe('the-lab template renders under the current config', () => {
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

  it('every pair survives the block filter, so the node carries all five questions', () => {
    // AccordionBlock emits only pairs where BOTH q and a are non-empty (Google requires both) and
    // omits the FAQPage entirely when none qualify. An Accordion with hollow items satisfies a
    // word-search probe while the page still emits nothing; this is the assertion that closes that
    // gap (LIVE-040: "THE OLD PROBE WAS A WORD SEARCH").
    const items = accordions[0].props.items as { q?: string; a?: string }[]
    const wellFormed = items.filter((i) => (i.q ?? '').trim() && (i.a ?? '').trim())
    expect(wellFormed).toHaveLength(items.length)
    expect(items).toHaveLength(5)
  })

  it('asks the five recovered questions, verbatim', () => {
    const items = accordions[0].props.items as { q: string }[]
    expect(items.map((i) => i.q)).toEqual([
      'What is The Lab?',
      'Can I visit The Lab yet?',
      'What will be inside The Lab?',
      'When will The Lab open?',
      'Where will the first Lab be?',
    ])
  })
})
