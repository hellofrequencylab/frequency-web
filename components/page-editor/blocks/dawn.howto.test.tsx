import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { dawnComponents, howToStepsSchema, DawnHowToStepsBlock } from './dawn'
import { config } from '@/lib/page-editor/config'

// ─────────────────────────────────────────────────────────────────────────────
// DawnHowToSteps owns its structured data (the Accordion/FAQPage precedent).
//
// The gating dependency for converting the seeker articles (UX-MATURITY-PLAN Lift
// 5d): a how-to rendered from a block document must carry the SAME HowTo JSON-LD a
// hand-coded page would emit, or the conversion is a net SEO loss on the
// highest-intent pages. These tests lock two halves of that contract:
//   1. a well-formed config emits a VALID HowTo (name + ordered, positioned steps),
//   2. an empty or partial config emits NOTHING rather than a malformed node — an
//      answer engine silently discards a broken node, so half-schema is worse than
//      no schema.
// Pure: the schema builder is exported, so the shape is asserted without a render;
// the render assertions only check the <script> tag's presence/absence + escaping.
// ─────────────────────────────────────────────────────────────────────────────

const GUIDE = {
  name: 'How to start a Circle',
  intro: 'Four steps, a standing time, and a few people. That is the whole thing.',
  totalTime: 'PT30M',
  steps: [
    {
      name: 'Pick what you gather around',
      text: 'A class, a walk, a supper table, a sit. One thing, named **plainly**.',
      image: '/images/site/breathwork-circle.jpg',
      alt: 'A Circle sitting together outdoors',
    },
    { name: 'Pick a standing time', text: 'Same day, same hour, every week.' },
  ],
}

describe('howToStepsSchema emits a valid schema.org HowTo', () => {
  it('matches the documented HowTo shape', () => {
    expect(howToStepsSchema(GUIDE)).toEqual({
      '@context': 'https://schema.org',
      '@type': 'HowTo',
      name: 'How to start a Circle',
      description: 'Four steps, a standing time, and a few people. That is the whole thing.',
      // Root-relative step imagery is absolutized by the shared jsonld helper.
      image: [expect.stringContaining('/images/site/breathwork-circle.jpg')],
      totalTime: 'PT30M',
      step: [
        {
          '@type': 'HowToStep',
          position: 1,
          name: 'Pick what you gather around',
          // Markdown is stripped so the schema mirrors the visible sentence.
          text: 'A class, a walk, a supper table, a sit. One thing, named plainly.',
        },
        {
          '@type': 'HowToStep',
          position: 2,
          name: 'Pick a standing time',
          text: 'Same day, same hour, every week.',
        },
      ],
    })
  })

  it('numbers the steps in document order', () => {
    const schema = howToStepsSchema(GUIDE) as { step: { position: number; name: string }[] }
    expect(schema.step.map((s) => s.position)).toEqual([1, 2])
    expect(schema.step[0].name).toBe('Pick what you gather around')
  })

  it('drops a totalTime that is not an ISO 8601 duration', () => {
    const loose = howToStepsSchema({ ...GUIDE, totalTime: 'about 30 minutes' })
    expect(loose).not.toHaveProperty('totalTime')
    expect(howToStepsSchema({ ...GUIDE, totalTime: 'PT1H30M' })).toHaveProperty('totalTime', 'PT1H30M')
  })

  it('skips steps missing a name or text rather than emitting a half node', () => {
    const schema = howToStepsSchema({
      name: 'How to start a Circle',
      steps: [
        { name: 'Real step', text: 'Do the thing.' },
        { name: 'No text here' },
        { text: 'No name here' },
        { name: '   ', text: '   ' },
      ],
    }) as { step: unknown[] }
    expect(schema.step).toHaveLength(1)
  })
})

describe('an empty or partial config emits nothing (never broken schema)', () => {
  it.each([
    ['no props at all', {}],
    ['a name but no steps', { name: 'How to start a Circle', steps: [] }],
    ['steps but no name', { steps: [{ name: 'Step one', text: 'Do the thing.' }] }],
    ['a blank name', { name: '   ', steps: [{ name: 'Step one', text: 'Do the thing.' }] }],
    ['steps that are all incomplete', { name: 'A guide', steps: [{ name: 'Step one' }, { text: 'Orphan' }] }],
  ])('%s → null', (_label, props) => {
    expect(howToStepsSchema(props)).toBeNull()
  })

  it('renders no ld+json script when the schema cannot be built', () => {
    const html = renderToStaticMarkup(
      <DawnHowToStepsBlock name="" steps={[{ name: 'Step one' }]} />,
    )
    expect(html).not.toContain('application/ld+json')
  })

  it('renders exactly one ld+json script when it can, with `<` escaped', () => {
    const html = renderToStaticMarkup(
      <DawnHowToStepsBlock
        name="How to start a Circle"
        steps={[{ name: 'Step one', text: 'Mind the </script> case.' }]}
      />,
    )
    expect(html.match(/application\/ld\+json/g)).toHaveLength(1)
    expect(html).toContain('"@type":"HowTo"')
    // The shared <JsonLd> escaping guard: no raw `</script>` can close the tag early.
    expect(html).not.toContain('</script>Mind')
    expect(html).toContain('\\u003c/script>')
  })
})

describe('DawnHowToSteps is a well-formed, registered block', () => {
  it('carries fields, defaultProps, and a render', () => {
    const block = dawnComponents.DawnHowToSteps
    expect(typeof block.render).toBe('function')
    expect(Object.keys(block.fields ?? {})).toEqual(
      expect.arrayContaining(['name', 'intro', 'totalTime', 'steps']),
    )
    const stepFields = (block.fields as Record<string, { arrayFields?: Record<string, unknown> }>).steps
      .arrayFields
    expect(Object.keys(stepFields ?? {})).toEqual(
      expect.arrayContaining(['name', 'text', 'image']),
    )
  })

  it('declares a field for every default prop (no orphan defaults)', () => {
    const block = dawnComponents.DawnHowToSteps
    const fieldKeys = new Set(Object.keys(block.fields ?? {}))
    for (const key of Object.keys(block.defaultProps ?? {})) {
      if (key === 'id') continue
      expect(fieldKeys.has(key), key).toBe(true)
    }
  })

  it('its own defaults produce a valid HowTo (the seed is never broken schema)', () => {
    const defaults = dawnComponents.DawnHowToSteps.defaultProps as Parameters<
      typeof howToStepsSchema
    >[0]
    const schema = howToStepsSchema(defaults) as { '@type': string; step: unknown[] }
    expect(schema['@type']).toBe('HowTo')
    expect(schema.step).toHaveLength(4)
  })

  it('is registered + categorised in the shared config', () => {
    expect(config.components.DawnHowToSteps).toBeTruthy()
    expect(config.categories?.sections?.components ?? []).toContain('DawnHowToSteps')
  })
})
