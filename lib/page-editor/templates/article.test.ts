import { describe, it, expect } from 'vitest'
import { articleTemplate, type ArticleSpec } from '@/lib/page-editor/templates/article'
import { isRenderable } from '@/lib/page-editor/templates'
import { howToStepsSchema } from '@/components/page-editor/blocks/dawn'
import { config } from '@/lib/page-editor/config'

// The seeker-article seed (Lift 5d, ADR-1068). This generator has no live consumer until the
// first article is enrolled in EDITABLE_PAGES, so these assertions are what keep it from rotting:
// they run it through the CURRENT block config and the CURRENT schema builders, so a block rename
// or a schema tightening breaks here rather than on enrollment day.
//
// The thing being protected is not "a document comes out". It is that converting an article from
// coded JSX to blocks does not silently DROP the structured data those pages exist for. Each
// schema node has its own assertion below, and each names the block that owns it.

const SPEC: ArticleSpec = {
  slug: 'how-to-start-a-circle',
  eyebrow: 'For the natural connector',
  title: 'How to start a Circle',
  subtitle: 'Starting a Circle is smaller than it sounds: one thing, a standing time, a few people.',
  image: '/images/site/community-1.jpg',
  alt: 'A small group of friends gathered closely together, talking and laughing',
  heroCtaLabel: 'See how Circles work',
  heroCtaHref: '/the-community',
  answer:
    'To start a Circle, pick one simple thing to do together, set a standing time, and invite a few people to the first one.',
  intro: 'You are not building a community. You are starting one small room that meets again.',
  sections: [
    {
      question: 'How many people do I need to start a group?',
      answer: 'Three or four who actually show up beats a list of twenty who might.',
      body: 'A small room that fills feels warm. A big one that half-empties feels like a flop even when six good people came.',
    },
    {
      question: 'Why do most community groups fizzle out?',
      answer: 'Because they lean on one person’s energy instead of a structure anyone can keep.',
    },
  ],
  howTo: {
    name: 'How to start a Circle',
    intro: 'Five plain steps, and none of them need you to be an extrovert.',
    totalTime: 'PT30M',
    totalTimeLabel: 'About 30 minutes to set up',
    steps: [
      { name: 'Pick one thing, not a community', text: 'Choose a single simple thing the group does together.' },
      { name: 'Set a standing time and keep it', text: 'Pick a day and time and repeat it without asking.' },
      { name: 'Invite a few people, not everyone', text: 'Personally ask five or six people you would like to see again.' },
    ],
  },
  faq: [
    {
      q: 'How do I start a Circle?',
      a: 'Pick one simple thing to do together, set a standing time, and personally invite five or six people to the first one.',
    },
    {
      q: 'What does it cost to start a Circle?',
      a: 'Nothing. Starting a Circle and gathering a few people is free, and it stays free.',
    },
  ],
  close: {
    heading: 'The town you wish you lived in starts with one room you hold.',
    body: 'Frequency hands you the format, the rhythm, and a place to gather a few people on repeat.',
  },
}

const doc = articleTemplate(SPEC)
const block = (type: string) => doc.content.find((b) => b.type === type)

describe('articleTemplate composes only blocks the current config can render', () => {
  it('produces a renderable document', () => {
    // `isRenderable` = well-formed AND every type still resolves. A block renamed out from under
    // this generator would otherwise surface as a missing section on a live article.
    expect(isRenderable(doc)).toBe(true)
  })

  it('names only registered block types', () => {
    const unregistered = doc.content.map((b) => b.type).filter((t) => !(t in config.components))
    expect(unregistered).toEqual([])
  })

  it('gives every block a unique id, so the editor can key and reorder them', () => {
    const ids = doc.content.map((b) => b.props.id)
    expect(ids.every(Boolean)).toBe(true)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('the four schema nodes a coded article emits survive the conversion', () => {
  it('HowTo — DawnHowToSteps builds a VALID node from the props, not just a present one', () => {
    // The block is fail-closed: it emits nothing rather than an invalid node, so "the block is
    // there" is not evidence. Run the real builder over the real props.
    const props = block('DawnHowToSteps')!.props as Parameters<typeof howToStepsSchema>[0]
    expect(howToStepsSchema(props)).not.toBeNull()
    const schema = howToStepsSchema(props) as { step: unknown[]; totalTime?: string }
    expect(schema.step).toHaveLength(SPEC.howTo!.steps.length)
    // `totalTime` is emitted ONLY when it parses as ISO 8601, so this proves the spec's field
    // reaches the schema in the form the block accepts.
    expect(schema.totalTime).toBe('PT30M')
  })

  it('FAQPage — the Accordion carries every question, and it is never optional', () => {
    expect(block('Accordion')!.props.items).toEqual(SPEC.faq)
  })

  it('Article — the doc opens with the title and subtitle BlockDocJsonLd derives from', () => {
    // BlockDocJsonLd emits nothing unless BOTH a headline and a description resolve, scanning
    // top-level blocks for `title` then `subtitle`/`body`. The Hero has to be first and has to
    // carry both, or the converted article ships no Article node at all.
    expect(doc.content[0].type).toBe('Hero')
    expect(doc.content[0].props.title).toBe(SPEC.title)
    expect(doc.content[0].props.subtitle).toBe(SPEC.subtitle)
    expect(doc.content[0].props.image).toBe(SPEC.image)
  })
})

describe('the CONTENT-VOICE article grammar is the SHAPE, not a convention', () => {
  it('puts the direct answer above every question section', () => {
    const answerAt = doc.content.findIndex((b) => b.props.id === 'how-to-start-a-circle-answer')
    const firstQuestionAt = doc.content.findIndex((b) => b.type === 'Heading')
    expect(answerAt).toBeGreaterThan(-1)
    expect(answerAt).toBeLessThan(firstQuestionAt)
  })

  it('renders each section as a question H2 followed by its answer', () => {
    const headings = doc.content.filter((b) => b.type === 'Heading').map((b) => b.props.title)
    expect(headings).toEqual(SPEC.sections.map((s) => s.question))
  })

  it('carries no em dash in any generated string (CONTENT-VOICE hard rule)', () => {
    // check:canon reads copy positions in app/, lib/ and components/, but a document ASSEMBLED at
    // runtime has no such position, so the generator's own literals need this assertion instead.
    const strings = JSON.stringify(doc)
    expect(strings).not.toMatch(/—/)
  })
})
