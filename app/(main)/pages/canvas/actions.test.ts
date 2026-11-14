import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ flag: vi.fn(), janitor: vi.fn(), coach: vi.fn(), grounding: vi.fn() }))
vi.mock('@/lib/env/string', async (orig) => ({ ...(await orig<typeof import('@/lib/env/string')>()), envFlag: mocks.flag }))
vi.mock('@/lib/page-editor/guard', () => ({ getJanitor: mocks.janitor }))
vi.mock('@/lib/ai/vera/block-coach', () => ({ coachNewBlock: mocks.coach }))
vi.mock('@/lib/ai/space-grounding', () => ({ loadSpaceGrounding: mocks.grounding }))

import { askVeraAboutCanvasBlock } from './actions'

const SPACE = '0f0e0d0c-0b0a-4908-8706-050403020100'

beforeEach(() => {
  vi.resetAllMocks()
  mocks.flag.mockImplementation((name: string) => name === 'EDITOR_CANVAS')
  mocks.janitor.mockResolvedValue({ profileId: 'staff' })
  mocks.coach.mockResolvedValue({ source: 'fallback', questions: [] })
  mocks.grounding.mockResolvedValue({ about: 'A run club', offerings: [] })
})

describe('askVeraAboutCanvasBlock', () => {
  it('is off without the switch, and for anyone but staff', async () => {
    mocks.flag.mockReturnValue(false)
    expect(await askVeraAboutCanvasBlock({ trigger: 'asked', values: {} })).toBeNull()
    mocks.flag.mockImplementation((name: string) => name === 'EDITOR_CANVAS')
    mocks.janitor.mockResolvedValue(null)
    expect(await askVeraAboutCanvasBlock({ trigger: 'asked', values: {} })).toBeNull()
    expect(mocks.coach).not.toHaveBeenCalled()
  })

  it('never speaks on an edit, an idle canvas or a save, nor at creation once words are in', async () => {
    for (const trigger of ['edit', 'idle', 'save', 'anything']) expect(await askVeraAboutCanvasBlock({ trigger, values: {} })).toBeNull()
    expect(await askVeraAboutCanvasBlock({ trigger: 'block-created', values: { title: 'Saturday run club' } })).toBeNull()
    expect(mocks.coach).not.toHaveBeenCalled()
  })

  it('coaches the server-fixed Banner, with the Space material when a Space is named', async () => {
    await askVeraAboutCanvasBlock({ trigger: 'block-created', values: { title: '', stray: 42 }, spaceId: SPACE })
    const arg = mocks.coach.mock.calls[0]![0]
    expect(arg.blockType).toBe('Banner')
    expect(arg.values).toEqual({ title: '' })
    expect(arg.fields.map((f: { key: string }) => f.key)).toContain('title')
    expect(arg).toMatchObject({ profileId: 'staff', spaceId: SPACE, grounding: { about: 'A run club', offerings: [] } })
  })
})
