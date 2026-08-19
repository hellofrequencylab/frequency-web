import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { config } from '@/lib/page-editor/config'
import { BlockRender } from '@/lib/page-editor/block-render'
import { getTemplate } from '@/lib/page-editor/templates'
import { FOUNDING_PLACE } from '@/lib/site'

// ─────────────────────────────────────────────────────────────────────────────
// /the-lab must EMIT a FAQPage, and it must emit it as a CONSEQUENCE of rendering
// the questions (LIVE-040).
//
// The failure this closes was invisible for the whole life of the template. The
// coded body carried a five-entry `THE_LAB_FAQ` whose `faqSchema()` call sat on
// the LEGACY branch of `data ? <BlockRender/> : <Legacy/>` — a branch that could
// never be taken, because `getTemplate('the-lab')` returns a static literal and
// `data` is never null. So the page emitted no FAQPage from the day the template
// landed, and retiring the coded body changed nothing about what Google saw.
// Confirmed against production HTML on 2026-08-19: six ld+json blocks, none of
// them a FAQPage.
//
// SO THIS TEST RENDERS, IT DOES NOT GREP. A test that asserts "the template
// contains an Accordion" passes by shape; the thing that matters is the script
// tag in the markup. `AccordionBlock` builds its FAQPage from the very items it
// draws (components/page-editor/blocks/collections.tsx), which is why the honest
// fix was a block carrying the questions rather than a hand-written schema node:
// a schema built from the rendered copy cannot drift from it. The last assertion
// holds that seam shut by checking every schema answer is also VISIBLE text.
//
// The same shape guards /the-quest through `article.test.ts`; this file is the
// /the-lab half.
// ─────────────────────────────────────────────────────────────────────────────

type Question = { '@type': string; name: string; acceptedAnswer: { text: string } }

/** Every `<script type="application/ld+json">` payload in a rendered tree, parsed.
 *  `JsonLd` escapes `<` as `<` before it reaches the DOM, so unescape first. */
function jsonLdNodes(html: string): Record<string, unknown>[] {
  const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g
  return [...html.matchAll(re)].map((m) => JSON.parse(m[1].replace(/\\u003c/g, '<')))
}

/** Text a visitor can actually read: tags stripped, entities decoded, whitespace collapsed. */
function visibleText(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
}

// Verbatim from the retired `THE_LAB_FAQ` (git show c3228d76c^ on
// app/(marketing)/the-lab/page.tsx). Typed out here rather than imported from the
// template so the test states the expected copy independently: importing the
// template's own array would make this assertion true by construction.
const EXPECTED = [
  {
    q: 'What is The Lab?',
    a: `The Lab is a third space the Frequency community is building: not home, not work, a real room to move, warm up in the sauna, cool down in the plunge, and switch off in person. The first one is planned for 2028 in ${FOUNDING_PLACE}. It is not open yet.`,
  },
  {
    q: 'Can I visit The Lab yet?',
    a: 'Not yet, and nothing at The Lab is bookable. The first Lab is planned to open in 2028. Until then the community meets in rooms we borrow: parks, living rooms, and rented studios. You can join a Circle near you today.',
  },
  {
    q: 'What will be inside The Lab?',
    a: 'Movement studios, a cedar thermal circuit, a cold plunge pool, a no-alcohol connection bar, and a flexible events floor. One building, tuned room by room.',
  },
  {
    q: 'When will The Lab open?',
    a: 'The plan on the page is dated: Circles meeting in borrowed rooms now, a site and permits through 2027, and the first Lab opening in 2028. There are no membership rates published because there is nothing to sell yet.',
  },
  {
    q: 'Where will the first Lab be?',
    a: `The first Lab is planned for ${FOUNDING_PLACE}, where the founding community is already meeting, and it is built to repeat in other cities once the community is there.`,
  },
]

const html = renderToStaticMarkup(
  <BlockRender config={config} data={getTemplate('the-lab')!} metadata={{}} />,
)

describe('/the-lab emits a FAQPage, built from the questions it renders (LIVE-040)', () => {
  it('rendered a real page, so a missing node means something (the non-triviality floor)', () => {
    // Without this, a template that stopped resolving would fail the assertions below for
    // the wrong reason and read as the same bug. Same floor, same reason, as templates.test.ts.
    expect(html.length).toBeGreaterThan(5_000)
    expect(visibleText(html)).toContain('Heat then cold')
  })

  it('emits exactly one FAQPage node', () => {
    const faq = jsonLdNodes(html).filter((n) => n['@type'] === 'FAQPage')
    expect(
      faq,
      'the rendered /the-lab document carries no FAQPage. The template needs an Accordion ' +
        'block holding the questions: AccordionBlock builds the schema from its own items, ' +
        'so the node follows the copy instead of being asserted next to it.',
    ).toHaveLength(1)
  })

  it('carries the five recovered questions, in order, with their answers', () => {
    const faq = jsonLdNodes(html).find((n) => n['@type'] === 'FAQPage') as
      | { mainEntity: Question[] }
      | undefined
    expect(faq).toBeDefined()
    expect(faq!.mainEntity.map((q) => q.name)).toEqual(EXPECTED.map((e) => e.q))
    expect(faq!.mainEntity.map((q) => q.acceptedAnswer.text)).toEqual(EXPECTED.map((e) => e.a))
  })

  it('claims nothing a visitor cannot read (CONTENT-VOICE §8b)', () => {
    // The whole reason this was fixed with a block rather than a schema emitter. If a future
    // edit reinstates a hand-written FAQPage, or edits the visible copy without the schema,
    // this is the assertion that goes red.
    const text = visibleText(html)
    const faq = jsonLdNodes(html).find((n) => n['@type'] === 'FAQPage') as { mainEntity: Question[] }
    for (const q of faq.mainEntity) {
      expect(text, `question not on the page: ${q.name}`).toContain(q.name)
      expect(text, `answer not on the page: ${q.name}`).toContain(q.acceptedAnswer.text)
    }
  })

  it('carries no em dash in any answer (CONTENT-VOICE hard rule)', () => {
    const faq = jsonLdNodes(html).find((n) => n['@type'] === 'FAQPage') as { mainEntity: Question[] }
    const offenders = faq.mainEntity
      .flatMap((q) => [q.name, q.acceptedAnswer.text])
      .filter((s) => s.includes('—'))
    expect(offenders).toEqual([])
  })
})
