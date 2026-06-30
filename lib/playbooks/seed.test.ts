import { describe, it, expect } from 'vitest'
import { buildSeedRows, triggerSignal, rowDrifted, type PlaybookSeedRow } from './seed'
import { PLAYBOOK_REGISTRY } from './registry'

// The seed projection MUST mirror the code registry one-to-one + carry a well-formed trigger signal,
// so the durable `playbooks` table is an honest copy of the source of truth. These lock the projection
// shape + the drift check (a re-seed only rewrites what changed).

describe('playbook seed projection', () => {
  it('projects exactly one platform row per registry entry', () => {
    const rows = buildSeedRows()
    expect(rows.length).toBe(PLAYBOOK_REGISTRY.length)
    for (const r of rows) expect(r.space_id).toBeNull()
  })

  it('slugs match the registry ids and are unique', () => {
    const rows = buildSeedRows()
    const slugs = rows.map((r) => r.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    expect(new Set(slugs)).toEqual(new Set(PLAYBOOK_REGISTRY.map((p) => p.id)))
  })

  it('encodes the trigger signal (next_best_action value, churn_<tier>, or failed_payment)', () => {
    expect(triggerSignal(PLAYBOOK_REGISTRY.find((p) => p.id === 'reengage_winback')!)).toBe('reengage')
    expect(triggerSignal(PLAYBOOK_REGISTRY.find((p) => p.id === 'churn_high_streak_save')!)).toBe('churn_high')
    expect(triggerSignal(PLAYBOOK_REGISTRY.find((p) => p.id === 'failed_payment_dunning')!)).toBe('failed_payment')
  })

  it('carries the autonomy tier + the action sequence (tool + surface + label) verbatim', () => {
    const rows = buildSeedRows()
    const winback = rows.find((r) => r.slug === 'reengage_winback')!
    expect(winback.autonomy_tier).toBe('suggest')
    expect(winback.action_sequence.some((a) => a.tool === 'send_playbook_email' && a.surface === 'outbound')).toBe(true)
  })

  it('rowDrifted: same shape is no drift; a changed tier / trigger / sequence is drift', () => {
    const next: PlaybookSeedRow = buildSeedRows().find((r) => r.slug === 'reengage_winback')!
    const same = {
      id: 'x',
      slug: next.slug,
      trigger_signal: next.trigger_signal,
      action_sequence: next.action_sequence,
      autonomy_tier: next.autonomy_tier,
    }
    expect(rowDrifted(same, next)).toBe(false)
    expect(rowDrifted({ ...same, autonomy_tier: 'auto' }, next)).toBe(true)
    expect(rowDrifted({ ...same, trigger_signal: 'other' }, next)).toBe(true)
    expect(rowDrifted({ ...same, action_sequence: [] }, next)).toBe(true)
  })
})
