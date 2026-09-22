import { beforeEach, describe, expect, it, vi } from 'vitest'

// Vera at the calendar (PROG-CAL10), with the Anthropic client mocked at the SDK seam so completeRaw
// runs for real: the tool loop feeds a lunar_dates call back as a tool_result computed by
// lib/calendar/moon.ts, the propose_changes call is parsed strictly, the kill switch yields an honest
// sentence, and the ledger sees one row per ask with the Space attributed. No write path exists here.

const state = vi.hoisted(() => ({
  enabled: true,
  overBudget: false,
  limited: false,
  replies: [] as Array<{ content: unknown[]; input_tokens?: number; output_tokens?: number }>,
  calls: [] as Array<Record<string, unknown>>,
}))

vi.mock('./client', () => ({
  aiEnabled: () => state.enabled,
  getAnthropic: () => ({
    messages: {
      create: vi.fn(async (params: Record<string, unknown>) => {
        state.calls.push(params)
        const reply = state.replies.shift()
        if (!reply) throw new Error('no scripted reply left')
        return {
          id: 'msg',
          type: 'message',
          role: 'assistant',
          model: 'test',
          content: reply.content,
          stop_reason: 'tool_use',
          stop_sequence: null,
          usage: { input_tokens: reply.input_tokens ?? 100, output_tokens: reply.output_tokens ?? 20, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
        }
      }),
    },
  }),
}))

vi.mock('./usage', () => ({
  featureOverBudget: vi.fn(async () => state.overBudget),
  recordAiUsage: vi.fn(async () => {}),
}))

vi.mock('./rate-limit', () => ({
  aiRateLimited: vi.fn(async () => state.limited),
}))

import { recordAiUsage } from './usage'
import { LUNAR_TOOL_NAME, MAX_ROUNDS, PROPOSE_TOOL_NAME, proposeCalendarChanges, runLunarTool, VERA_CALENDAR_FEATURE, type VeraCalendarContext } from './vera-calendar'
import { FEATURE_DAILY_CAP_USD } from './budget'

const PLAN = '11111111-2222-4333-8444-555555555555'

const context: VeraCalendarContext = {
  spaceId: 'space-1',
  timeZone: 'America/Los_Angeles',
  today: '2026-09-22',
  entries: [{ id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', title: 'Sound bath', day: '2026-10-10', stage: 'pencil', planId: PLAN }],
  plans: [{ id: PLAN, title: 'Winter sits', stage: 'plan' }],
  profileId: 'profile-1',
}

const toolUse = (name: string, input: unknown, id = 't1') => ({ type: 'tool_use', id, name, input })

beforeEach(() => {
  state.enabled = true
  state.overBudget = false
  state.limited = false
  state.replies = []
  state.calls = []
  vi.mocked(recordAiUsage).mockClear()
})

describe('proposeCalendarChanges', () => {
  it('is a registered AI door: a budget key and no write of its own', () => {
    expect(FEATURE_DAILY_CAP_USD).toHaveProperty(VERA_CALENDAR_FEATURE)
  })

  it('returns an honest error when AI is switched off, without touching the model', async () => {
    state.enabled = false
    const r = await proposeCalendarChanges({ ask: 'pencil a sound bath on every new moon', mode: 'pencil', context })
    expect(r).toMatchObject({ error: expect.stringContaining('switched off') })
    expect(state.calls).toHaveLength(0)
    expect(recordAiUsage).not.toHaveBeenCalled()
  })

  it('refuses over budget and when throttled, without touching the model', async () => {
    state.overBudget = true
    expect(await proposeCalendarChanges({ ask: 'archive winter sits', mode: 'pencil', context })).toMatchObject({ error: expect.any(String) })
    state.overBudget = false
    state.limited = true
    expect(await proposeCalendarChanges({ ask: 'archive winter sits', mode: 'pencil', context })).toMatchObject({ error: expect.any(String) })
    expect(state.calls).toHaveLength(0)
  })

  it('executes a lunar_dates round on the server, feeds the computed days back, then parses the proposal', async () => {
    state.replies = [
      { content: [toolUse(LUNAR_TOOL_NAME, { phase: 'new', fromDay: '2026-12-01', toDay: '2027-02-28' })], input_tokens: 300, output_tokens: 40 },
      {
        content: [
          toolUse(
            PROPOSE_TOOL_NAME,
            {
              changes: [
                { kind: 'pencil', title: 'Sound bath', days: ['2026-12-08', '2027-01-07', '2027-02-06'], startTime: '19:00', endTime: '20:30', timeZone: 'America/Los_Angeles', stage: 'pencil' },
              ],
              note: 'Three new moons this winter \u2014 all penciled.',
            },
            't2',
          ),
        ],
        input_tokens: 500,
        output_tokens: 80,
      },
    ]
    const r = await proposeCalendarChanges({ ask: 'Pencil a sound bath on every new moon this winter', mode: 'pencil', context })
    expect(r).toMatchObject({
      proposal: {
        changes: [{ kind: 'pencil', title: 'Sound bath', days: ['2026-12-08', '2027-01-07', '2027-02-06'] }],
        note: 'Three new moons this winter , all penciled.',
      },
    })
    expect(state.calls).toHaveLength(2)

    // The first call carries both tools and forces a tool answer; the system prompt states the invariant.
    const first = state.calls[0]
    expect((first.tools as { name: string }[]).map((t) => t.name)).toEqual([LUNAR_TOOL_NAME, PROPOSE_TOOL_NAME])
    expect(first.tool_choice).toEqual({ type: 'any' })
    const system = JSON.stringify(first.system)
    expect(system).toContain('never publish')
    expect(system).toContain('Frequency voice')
    const firstUser = (first.messages as { content: string }[])[0].content
    expect(firstUser).toContain('America/Los_Angeles')
    expect(firstUser).toContain('2026-09-22')
    expect(firstUser).toContain(PLAN)
    expect(firstUser).toContain('Pencil')

    // The second call continues the loop with the assistant turn and the COMPUTED tool result.
    const second = state.calls[1]
    const msgs = second.messages as { role: string; content: unknown }[]
    expect(msgs).toHaveLength(3)
    expect(msgs[1].role).toBe('assistant')
    expect(msgs[2].role).toBe('user')
    const result = (msgs[2].content as { type: string; tool_use_id: string; content: string }[])[0]
    expect(result.type).toBe('tool_result')
    expect(result.tool_use_id).toBe('t1')
    const fed = JSON.parse(result.content) as { days: string[] }
    // The December 2026 new moon is 00:52 UTC on the 9th, which is the evening of the 8th in Los Angeles.
    expect(fed.days).toEqual(['2026-12-08', '2027-01-07', '2027-02-06'])

    // One ledger row for the whole ask, usage summed across both rounds, the Space attributed.
    expect(recordAiUsage).toHaveBeenCalledTimes(1)
    expect(vi.mocked(recordAiUsage).mock.calls[0][0]).toMatchObject({
      feature: VERA_CALENDAR_FEATURE,
      spaceId: 'space-1',
      profileId: 'profile-1',
      usage: { inputTokens: 800, outputTokens: 120 },
    })
  })

  it('answers a bad lunar range with an error tool_result rather than a guess', () => {
    expect(runLunarTool({ phase: 'blue', fromDay: '2026-01-01', toDay: '2026-02-01' }, 'UTC')).toMatchObject({ ok: false })
    expect(runLunarTool({ phase: 'new', fromDay: '2026-02-01', toDay: '2026-01-01' }, 'UTC')).toMatchObject({ ok: false })
    expect(runLunarTool({ phase: 'new', fromDay: '2026-01-01', toDay: '2028-01-01' }, 'UTC')).toMatchObject({ ok: false })
    expect(runLunarTool({ phase: 'new', fromDay: '2026-01-01', toDay: '2026-03-31' }, 'UTC')).toEqual({ ok: true, days: ['2026-01-18', '2026-02-17', '2026-03-19'] })
  })

  it('refuses a proposal that names an id that is not ours, as an error the box can show', async () => {
    state.replies = [{ content: [toolUse(PROPOSE_TOOL_NAME, { changes: [{ kind: 'archive', planId: 'plan-1' }], note: 'Done.' })] }]
    const r = await proposeCalendarChanges({ ask: 'archive winter sits', mode: 'pencil', context })
    expect(r).toMatchObject({ error: expect.stringContaining('not one of ours') })
    expect(recordAiUsage).toHaveBeenCalledTimes(1)
  })

  it('stops after MAX_ROUNDS when the model never proposes, and says so', async () => {
    const lookup = { content: [toolUse(LUNAR_TOOL_NAME, { phase: 'full', fromDay: '2026-01-01', toDay: '2026-03-31' })] }
    state.replies = [lookup, lookup, lookup, lookup]
    const r = await proposeCalendarChanges({ ask: 'full moons', mode: 'plan', context })
    expect(r).toMatchObject({ error: expect.stringContaining('could not turn that into a proposal') })
    expect(state.calls).toHaveLength(MAX_ROUNDS)
  })

  it('reports a model failure honestly rather than as an empty proposal', async () => {
    state.replies = []
    const r = await proposeCalendarChanges({ ask: 'anything', mode: 'plan', context })
    expect(r).toMatchObject({ error: expect.stringContaining('could not reach') })
  })
})
