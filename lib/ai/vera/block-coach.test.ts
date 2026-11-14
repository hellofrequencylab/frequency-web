import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ flag: vi.fn(), enabled: vi.fn(), budget: vi.fn(), limited: vi.fn(), complete: vi.fn() }))
vi.mock('@/lib/env/string', async (orig) => ({ ...(await orig<typeof import('@/lib/env/string')>()), envFlag: mocks.flag }))
vi.mock('@/lib/ai/client', () => ({ aiEnabled: mocks.enabled }))
vi.mock('@/lib/ai/usage', () => ({ featureOverBudget: mocks.budget }))
vi.mock('@/lib/ai/rate-limit', () => ({ aiRateLimited: mocks.limited }))
vi.mock('@/lib/ai/complete', () => ({ completeRaw: mocks.complete }))

import { COACHING_QUESTION_CATALOG } from '@/lib/ai/coaching-question-catalog'
import { VOICE_PRIMER } from '@/lib/ai/voice'
import { photoHeroBlock } from '@/lib/entity-blocks/contract/photoHero'
import { inspectorFields } from '@/lib/builder/inspector-model'
import { blockCoachContext, coachNewBlock } from './block-coach'

const fields = inspectorFields(photoHeroBlock, 'space-site')
const input = { blockType: 'Banner', fields, values: {}, profileId: 'p1', spaceId: 's1' }
const toolUse = (body: unknown) => ({ content: [{ type: 'tool_use', id: 't', name: 'coach_block', input: body }] })

beforeEach(() => {
  vi.resetAllMocks()
  mocks.flag.mockImplementation((name: string) => name === 'EDITOR_CANVAS')
  mocks.enabled.mockReturnValue(true)
  mocks.budget.mockResolvedValue(false)
  mocks.limited.mockResolvedValue(false)
  mocks.complete.mockResolvedValue(toolUse({ questions: [{ field: 'title', questionId: 'welcome' }] }))
})

describe('coachNewBlock', () => {
  it('is silent and spends nothing while EDITOR_CANVAS is off', async () => {
    mocks.flag.mockReturnValue(false)
    expect(await coachNewBlock(input)).toBeNull()
    expect(mocks.complete).not.toHaveBeenCalled()
  })

  it('forces the minted tool, through the voice primer, and shows catalog wording', async () => {
    const out = await coachNewBlock(input)
    expect(out).toEqual({ source: 'vera', questions: [{ field: 'title', label: 'Headline', question: COACHING_QUESTION_CATALOG.welcome }] })
    const req = mocks.complete.mock.calls[0]![0]
    expect(req.toolChoice).toEqual({ type: 'tool', name: 'coach_block' })
    expect(req.tools[0].name).toBe('coach_block')
    expect(req.system.startsWith(VOICE_PRIMER)).toBe(true)
    expect(req.system).toContain('never write, suggest or rewrite')
    expect(req.accounting).toEqual({ feature: 'seed-compose', profileId: 'p1', spaceId: 's1' })
  })

  it.each([
    ['AI is off', () => mocks.enabled.mockReturnValue(false)],
    ['the cap is spent', () => mocks.budget.mockResolvedValue(true)],
    ['the owner is rate limited', () => mocks.limited.mockResolvedValue(true)],
    ['the call throws', () => mocks.complete.mockRejectedValue(new Error('boom'))],
    ['the reply drafts copy', () => mocks.complete.mockResolvedValue(toolUse({ questions: [{ field: 'title', questionId: 'welcome', text: 'Run with us' }] }))],
    ['the reply is text, not the tool', () => mocks.complete.mockResolvedValue({ content: [{ type: 'text', text: 'Try "Run with us"' }] })],
  ])('falls back to fixed questions when %s', async (_name, arrange) => {
    arrange()
    const out = await coachNewBlock(input)
    expect(out?.source).toBe('fallback')
    expect(out?.questions.map((q) => q.field)).toEqual(['eyebrow', 'title', 'subtitle'])
  })
})

describe('blockCoachContext', () => {
  it('carries which fields are empty, a capped excerpt, and the Space material as data', () => {
    const ctx = JSON.parse(blockCoachContext({ ...input, values: { title: 'x'.repeat(500) }, grounding: { about: 'A run club', offerings: ['Event: Saturday 5k'] } }))
    expect(ctx.block).toBe('Banner')
    expect(ctx.fields.find((f: { key: string }) => f.key === 'title')).toMatchObject({ empty: false, current: 'x'.repeat(160) })
    expect(ctx.fields.find((f: { key: string }) => f.key === 'eyebrow')).toMatchObject({ empty: true })
    expect(ctx.space).toEqual({ about: 'A run club', offerings: ['Event: Saturday 5k'] })
  })
})
