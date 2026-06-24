import { describe, it, expect } from 'vitest'
import { buildPlaybookRunInsert } from './runs'

const ok = {
  playbookId: 'reengage_winback',
  subjectKind: 'contact' as const,
  subjectId: '11111111-1111-1111-1111-111111111111',
  actorProfileId: '22222222-2222-2222-2222-222222222222',
  status: 'done' as const,
}

describe('buildPlaybookRunInsert', () => {
  it('builds a well-formed row', () => {
    const row = buildPlaybookRunInsert(ok)
    expect(row).not.toBeNull()
    expect(row?.playbook_id).toBe('reengage_winback')
    expect(row?.subject_kind).toBe('contact')
    expect(row?.status).toBe('done')
  })

  it('stamps ended_at on a terminal status, leaves it null for proposed', () => {
    expect(buildPlaybookRunInsert({ ...ok, status: 'done' })?.ended_at).toBeTruthy()
    expect(buildPlaybookRunInsert({ ...ok, status: 'dismissed' })?.ended_at).toBeTruthy()
    expect(buildPlaybookRunInsert({ ...ok, status: 'proposed' })?.ended_at).toBeNull()
  })

  it('returns null on a missing id / actor / subject', () => {
    expect(buildPlaybookRunInsert({ ...ok, playbookId: '' })).toBeNull()
    expect(buildPlaybookRunInsert({ ...ok, subjectId: '  ' })).toBeNull()
    expect(buildPlaybookRunInsert({ ...ok, actorProfileId: '' })).toBeNull()
  })

  it('returns null on an unknown status / subject kind', () => {
    // @ts-expect-error testing a bad status
    expect(buildPlaybookRunInsert({ ...ok, status: 'exploded' })).toBeNull()
    // @ts-expect-error testing a bad subject kind
    expect(buildPlaybookRunInsert({ ...ok, subjectKind: 'alien' })).toBeNull()
  })

  it('caps the outcome and trims whitespace', () => {
    const row = buildPlaybookRunInsert({ ...ok, outcome: '  ran the streak save  ' })
    expect(row?.outcome).toBe('ran the streak save')
    const long = buildPlaybookRunInsert({ ...ok, outcome: 'x'.repeat(800) })
    expect(long?.outcome?.length).toBe(500)
  })
})
