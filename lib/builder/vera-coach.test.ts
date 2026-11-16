import { describe, expect, it } from 'vitest'
import { COACHING_QUESTION_CATALOG } from '@/lib/ai/coaching-question-catalog'
import { photoHeroBlock } from '@/lib/entity-blocks/contract/photoHero'
import { inspectorFields } from './inspector-model'
import { isClientEvent } from '@/lib/analytics/events'
import { pixelAllowsEvent } from '@/lib/analytics/sanitize'
import { VERA_QUESTION_EVENT, coachTool, coachableFields, fallbackBlockCoaching, parseBlockCoaching, veraMayCoachBlock, veraQuestionProps, type BlockCoachTrigger } from './vera-coach'

const fields = inspectorFields(photoHeroBlock, 'space-site')
const wordKeys = coachableFields(fields).map((f) => f.key)

/** Every leaf of a JSON schema, so a test can say "no free string anywhere". */
function leaves(schema: unknown, out: Record<string, unknown>[] = []): Record<string, unknown>[] {
  const node = schema as Record<string, unknown>
  if (node.type === 'object') for (const child of Object.values((node.properties ?? {}) as Record<string, unknown>)) leaves(child, out)
  else if (node.type === 'array') leaves(node.items, out)
  else out.push(node)
  return out
}

describe('the per-block tool is minted from the block contract', () => {
  it('asks only about the fields the owner fills with words', () => {
    expect(wordKeys).toEqual(['eyebrow', 'title', 'subtitle', 'alt', 'buttonLabel'])
    expect(wordKeys).not.toContain('image')
    expect(wordKeys).not.toContain('buttonOn')
  })

  it('has no free text channel: every leaf is a closed enum of real field keys or reviewed question ids', () => {
    const tool = coachTool('Banner', fields)!
    const all = leaves(tool.input_schema)
    expect(all).toHaveLength(2)
    for (const leaf of all) expect(Array.isArray(leaf.enum)).toBe(true)
    expect(all[0]!.enum).toEqual(wordKeys)
    expect(all[1]!.enum).toEqual(Object.keys(COACHING_QUESTION_CATALOG))
    expect(JSON.stringify(tool.input_schema)).toContain('"additionalProperties":false')
  })

  it('mints nothing for a block with no word fields', () => {
    expect(coachTool('Divider', [{ key: 'style', label: 'Style', type: 'segmented' }])).toBeNull()
  })
})

describe('creation-time only', () => {
  const empty = {}
  const written = { title: 'Saturday run club' }
  it.each<[BlockCoachTrigger, Record<string, unknown>, boolean]>([
    ['block-created', empty, true],
    ['block-created', written, false],
    ['asked', written, true],
    ['edit', empty, false],
    ['idle', empty, false],
    ['save', empty, false],
  ])('%s with %o may speak: %s', (trigger, values, may) => {
    expect(veraMayCoachBlock(trigger, fields, values)).toBe(may)
  })

  it('whitespace is still an empty field', () => {
    expect(veraMayCoachBlock('block-created', fields, { title: '   ' })).toBe(true)
  })
})

describe('the reply is read against this block', () => {
  it('turns ids into the catalog wording, labelled by the field', () => {
    const out = parseBlockCoaching({ questions: [{ field: 'title', questionId: 'audience' }, { field: 'subtitle', questionId: 'newcomer' }] }, fields)
    expect(out).toEqual([
      { field: 'title', label: 'Headline', questionId: 'audience', question: COACHING_QUESTION_CATALOG.audience },
      { field: 'subtitle', label: 'Subtitle', questionId: 'newcomer', question: COACHING_QUESTION_CATALOG.newcomer },
    ])
  })

  it('collapses a repeated question', () => {
    expect(parseBlockCoaching({ questions: [{ field: 'title', questionId: 'audience' }, { field: 'title', questionId: 'audience' }] }, fields)).toHaveLength(1)
  })

  it.each([
    ['a field that is not a word field', { questions: [{ field: 'image', questionId: 'audience' }] }],
    ['a field the block does not have', { questions: [{ field: 'body', questionId: 'audience' }] }],
    ['an unreviewed question', { questions: [{ field: 'title', questionId: 'write_it' }] }],
    ['a drafted headline riding along', { questions: [{ field: 'title', questionId: 'audience', text: 'Run with us' }] }],
    ['an extra top-level key', { questions: [{ field: 'title', questionId: 'audience' }], draft: 'Run with us' }],
    ['too many questions', { questions: Array.from({ length: 4 }, () => ({ field: 'title', questionId: 'audience' })) }],
    ['no questions', { questions: [] }],
    ['prose', 'Here is a better headline'],
    ['nothing', null],
    ['a list', [{ field: 'title', questionId: 'audience' }]],
    ['questions that is not a list', { questions: { field: 'title', questionId: 'audience' } }],
    ['a question that is not an object', { questions: ['audience'] }],
    ['a field that is a number', { questions: [{ field: 1, questionId: 'audience' }] }],
    ['an inherited id', { questions: [{ field: 'title', questionId: 'constructor' }] }],
    ['a question with no id', { questions: [{ field: 'title' }] }],
  ])('rejects %s whole', (_name, raw) => {
    expect(parseBlockCoaching(raw, fields)).toBeNull()
  })
})

describe('the fallback needs no model', () => {
  it('asks reviewed questions about the first word fields', () => {
    const out = fallbackBlockCoaching(fields)
    expect(out.map((q) => q.field)).toEqual(['eyebrow', 'title', 'subtitle'])
    const reviewed: string[] = Object.values(COACHING_QUESTION_CATALOG)
    for (const q of out) expect(reviewed).toContain(q.question)
    for (const q of out) expect(COACHING_QUESTION_CATALOG[q.questionId as keyof typeof COACHING_QUESTION_CATALOG]).toBe(q.question)
  })

  it('a block with no word fields has no reply to read', () => {
    expect(parseBlockCoaching({ questions: [{ field: 'title', questionId: 'audience' }] }, [])).toBeNull()
  })
})

describe('telemetry for one question carries ids and counts only', () => {
  const question = { field: 'title', label: 'Headline', questionId: 'audience', question: COACHING_QUESTION_CATALOG.audience }

  it('names two registered, client-emittable events that no pixel may receive', () => {
    expect(Object.keys(VERA_QUESTION_EVENT)).toEqual(['accepted', 'dismissed'])
    for (const name of Object.values(VERA_QUESTION_EVENT)) {
      expect(isClientEvent(name)).toBe(true)
      expect(pixelAllowsEvent(name)).toBe(false)
    }
  })

  it('has a closed payload with no wording, no label and no field content', () => {
    const props = veraQuestionProps(question, { blockType: 'Banner', source: 'vera', position: 1, count: 3 })
    expect(props).toEqual({ blockType: 'Banner', field: 'title', questionId: 'audience', source: 'vera', position: 1, shown: 3 })
    const sent = Object.values(props).map(String)
    expect(sent).not.toContain(question.question)
    expect(sent).not.toContain(question.label)
  })
})
