import { describe, expect, it, vi } from 'vitest'
import { handleModelToolCalls } from './model-tools'
import type { ProposedToolCall } from './concierge'

describe('model authority is coaching, never outbound authorship', () => {
  it.each(['create_entity', 'send_playbook_email', 'send_intro_email'])('redirects %s without executing or proposing it', async (name) => {
    const read = vi.fn()
    const proposals: ProposedToolCall[] = []
    const results = await handleModelToolCalls([{ id: 't', name, input: { draft: '{"about":"Model copy"}', subject: 'Model subject', body: 'Model body' } }], proposals, read)
    expect(proposals).toEqual([])
    expect(read).not.toHaveBeenCalled()
    expect(results?.[0].content).toContain('Nothing was')
    expect(results?.[0].content).not.toContain('Model body')
  })

  it('rejects stale model-written intro alongside a valid read, without dispatching invalid args', async () => {
    const read = vi.fn().mockResolvedValue('A real circle')
    const proposals: ProposedToolCall[] = []
    const results = await handleModelToolCalls([
      { id: 'bad', name: 'draft_intro', input: { toHandle: 'maya', message: 'Publish me' } },
      { id: 'good', name: 'suggest_circle', input: {} },
    ], proposals, read)
    expect(read).toHaveBeenCalledExactlyOnceWith('suggest_circle', {})
    expect(proposals).toEqual([])
    expect(results?.[0].content).toContain('Nothing was changed')
  })

  it('keeps human confirmation for supported actions and never dispatches their writes', async () => {
    const read = vi.fn()
    const proposals: ProposedToolCall[] = []
    const result = await handleModelToolCalls([{ id: 'join', name: 'join_circle', input: { circle: 'runners' } }], proposals, read)
    expect(result).toBeNull()
    expect(proposals).toEqual([{ tool: 'join_circle', args: { circle: 'runners' } }])
    expect(read).not.toHaveBeenCalled()
  })
})

it('never proposes a model-authored bio update even with a supported profile tool', async () => {
  const proposals: ProposedToolCall[] = []
  const read = vi.fn()
  const result = await handleModelToolCalls([{ id: 'bio', name: 'set_profile_field', input: { field: 'bio', value: 'Generated member story' } }], proposals, read)
  expect(proposals).toEqual([])
  expect(read).not.toHaveBeenCalled()
  expect(result?.[0].content).toContain('/settings/profile')
})


it.each([null, [], 'model text'])('refuses non-object tool arguments without throwing: %s', async (input) => {
  const proposals: ProposedToolCall[] = []
  const read = vi.fn()
  const result = await handleModelToolCalls([{ id: 'bad', name: 'set_profile_field', input: input as unknown as Record<string, unknown> }], proposals, read)
  expect(result?.[0].content).toContain('Nothing was changed')
  expect(proposals).toEqual([])
  expect(read).not.toHaveBeenCalled()
})

describe('a Space switch (LIVE-2157)', () => {
  const space = { switchable: (fn: string) => fn === 'reviews', card: (fn: string, on: boolean) => `Turn ${fn} ${on ? 'on' : 'off'}?` }

  it('becomes a card with the catalog words when the turn carries the Space switches', async () => {
    const proposals: ProposedToolCall[] = []
    const results = await handleModelToolCalls([{ id: 's', name: 'set_space_feature', input: { space: 'sunrise', feature: 'reviews', on: false } }], proposals, vi.fn(), space)
    expect(proposals).toEqual([{ tool: 'set_space_feature', args: { space: 'sunrise', feature: 'reviews', on: false }, label: 'Turn reviews off?' }])
    expect(results).toBeNull()
  })

  it('is refused for a money or unknown switch, and on a turn without the Space switches', async () => {
    for (const [input, sw] of [[{ space: 'sunrise', feature: 'memberships', on: true }, space], [{ space: 'sunrise', feature: 'reviews', on: true }, undefined]] as const) {
      const proposals: ProposedToolCall[] = []
      const results = await handleModelToolCalls([{ id: 's', name: 'set_space_feature', input: { ...input } }], proposals, vi.fn(), sw)
      expect(proposals).toEqual([])
      expect(results?.[0].content).toContain('Nothing was changed')
    }
  })
})

describe('a Space role change (LIVE-2185)', () => {
  const space = {
    switchable: (fn: string) => fn === 'crm',
    card: (fn: string, on: boolean) => `Turn ${fn} ${on ? 'on' : 'off'}?`,
    roleCard: (fn: string, role: string) => (role === 'moderator' ? `Let moderators and up use ${fn}?` : null),
  }

  it('becomes a card with the role words when the turn carries the Space switches', async () => {
    const proposals: ProposedToolCall[] = []
    const results = await handleModelToolCalls([{ id: 'r', name: 'set_space_role', input: { space: 'sunrise', feature: 'crm', role: 'moderator' } }], proposals, vi.fn(), space)
    expect(proposals).toEqual([{ tool: 'set_space_role', args: { space: 'sunrise', feature: 'crm', role: 'moderator' }, label: 'Let moderators and up use crm?' }])
    expect(results).toBeNull()
  })

  it('is refused for a money switch, a role off the ladder, and on a turn without the Space switches', async () => {
    for (const [input, sw] of [
      [{ space: 'sunrise', feature: 'memberships', role: 'moderator' }, space],
      [{ space: 'sunrise', feature: 'crm', role: 'owner' }, space],
      [{ space: 'sunrise', feature: 'crm', role: 'moderator' }, undefined],
    ] as const) {
      const proposals: ProposedToolCall[] = []
      const results = await handleModelToolCalls([{ id: 'r', name: 'set_space_role', input: { ...input } }], proposals, vi.fn(), sw)
      expect(proposals).toEqual([])
      expect(results?.[0].content).toContain('Nothing was changed')
    }
  })
})

describe('a Space setting (LIVE-2186)', () => {
  const space = {
    switchable: () => false,
    card: () => '',
    settingCard: (id: string, value: unknown) => (id === 'calendar.sky_markers' && value === 'on' ? 'Turn sky markers on?' : null),
  }

  it('becomes a card with the setting words when the turn carries the Space settings', async () => {
    const proposals: ProposedToolCall[] = []
    const results = await handleModelToolCalls([{ id: 's', name: 'set_space_setting', input: { space: 'sunrise', setting: 'calendar.sky_markers', value: 'on' } }], proposals, vi.fn(), space)
    expect(proposals).toEqual([{ tool: 'set_space_setting', args: { space: 'sunrise', setting: 'calendar.sky_markers', value: 'on' }, label: 'Turn sky markers on?' }])
    expect(results).toBeNull()
  })

  it('is refused for a setting or value off the list, and on a turn without the Space settings', async () => {
    for (const [input, sw] of [
      [{ space: 'sunrise', setting: 'payments.payouts', value: 'on' }, space],
      [{ space: 'sunrise', setting: 'calendar.sky_markers', value: 'maybe' }, space],
      [{ space: 'sunrise', setting: 'calendar.sky_markers', value: 'on' }, undefined],
    ] as const) {
      const proposals: ProposedToolCall[] = []
      const results = await handleModelToolCalls([{ id: 's', name: 'set_space_setting', input: { ...input } }], proposals, vi.fn(), sw)
      expect(proposals).toEqual([])
      expect(results?.[0].content).toContain('Nothing was changed')
    }
  })
})

describe('an operator lookup (LIVE-2190)', () => {
  it('runs the handed-in lookup and feeds the answer back, proposing nothing', async () => {
    const lookup = vi.fn().mockResolvedValue('3 reports are waiting for review at /admin/moderation.')
    const read = vi.fn()
    const proposals: ProposedToolCall[] = []
    const results = await handleModelToolCalls([{ id: 'a', name: 'admin_lookup', input: { question: 'open_reports' } }], proposals, read, { switchable: () => false, card: () => '', lookup })
    expect(lookup).toHaveBeenCalledWith('open_reports')
    expect(read).not.toHaveBeenCalled()
    expect(proposals).toEqual([])
    expect(results?.[0].content).toBe('3 reports are waiting for review at /admin/moderation.')
  })

  it('reads nothing on a turn without the lookup (a member, or an invented call)', async () => {
    for (const sw of [undefined, { switchable: () => true, card: () => 'x' }]) {
      const read = vi.fn()
      const results = await handleModelToolCalls([{ id: 'a', name: 'admin_lookup', input: { question: 'open_reports' } }], [], read, sw)
      expect(read).not.toHaveBeenCalled()
      expect(results?.[0].content).toContain('Nothing was read')
    }
  })

  it('refuses arguments off the tool shape before any lookup', async () => {
    const lookup = vi.fn()
    const results = await handleModelToolCalls([{ id: 'a', name: 'admin_lookup', input: { question: 'open_reports', sql: 'select 1' } }], [], vi.fn(), { switchable: () => false, card: () => '', lookup })
    expect(lookup).not.toHaveBeenCalled()
    expect(results?.[0].content).toContain('Nothing was changed')
  })
})

describe('an operator ticket change (LIVE-2191)', () => {
  const ops = {
    switchable: () => false,
    card: () => '',
    lookup: async () => '',
    ticketCard: (t: unknown, f: unknown, v: unknown) => (t === '1001' && f === 'status' && v === 'resolved' ? 'Mark support ticket #1001 resolved?' : null),
  }

  it('becomes a card with the ticket words on a staff turn', async () => {
    const proposals: ProposedToolCall[] = []
    const results = await handleModelToolCalls([{ id: 't', name: 'set_ticket', input: { ticket: '1001', field: 'status', value: 'resolved' } }], proposals, vi.fn(), ops)
    expect(proposals).toEqual([{ tool: 'set_ticket', args: { ticket: '1001', field: 'status', value: 'resolved' }, label: 'Mark support ticket #1001 resolved?' }])
    expect(results).toBeNull()
  })

  it('is refused off the list and on any turn without the operator checks', async () => {
    for (const [input, sw] of [
      [{ ticket: '1001', field: 'status', value: 'deleted' }, ops],
      [{ ticket: '1001', field: 'status', value: 'resolved' }, undefined],
      [{ ticket: '1001', field: 'status', value: 'resolved' }, { switchable: () => true, card: () => 'x' }],
    ] as const) {
      const proposals: ProposedToolCall[] = []
      const results = await handleModelToolCalls([{ id: 't', name: 'set_ticket', input: { ...input } }], proposals, vi.fn(), sw)
      expect(proposals).toEqual([])
      expect(results?.[0].content).toContain('Nothing was changed')
    }
  })
})
