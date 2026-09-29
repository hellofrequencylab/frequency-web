import { describe, expect, it } from 'vitest'
import {
  PLAN_ACTIVITY_KINDS,
  PLAN_ACTIVITY_SHOWN,
  PLAN_ACTIVITY_SUMMARY_MAX,
  actorWords,
  boundSummary,
  latestActivity,
  mapPlanActivityRow,
  planActivityKind,
  type PlanActivityRow,
} from './plan-activity'

// THE RECORD'S VOCABULARY (PROG-CAL7, LIVE-543). The kinds are a closed set; a summary is cut,
// never dropped; the drawer reads the latest twenty newest first; who did it falls back to the
// Space when the profile cannot be read across the wall.

const row = (over: Partial<PlanActivityRow> = {}): PlanActivityRow => ({
  id: 'a-1',
  plan_id: 'plan-1',
  actor_profile_id: 'profile-1',
  actor_space_id: 'space-a',
  kind: 'stage',
  summary: 'Moved the Plan to Production.',
  created_at: '2026-09-28T10:00:00Z',
  ...over,
})

describe('the kinds', () => {
  it('are the closed set the migration checks, and nothing else reads as one', () => {
    expect(PLAN_ACTIVITY_KINDS).toContain('todo_assigned')
    expect(planActivityKind('date_moved')).toBe('date_moved')
    expect(planActivityKind('rewrote_history')).toBeNull()
    expect(mapPlanActivityRow(row({ kind: 'lost' }), { actorName: null, spaceName: null }, null).kind).toBe('field')
  })
})

describe('boundSummary', () => {
  it('collapses whitespace and cuts a sentence to the column, never dropping it', () => {
    expect(boundSummary('  Moved   the Plan.\n')).toBe('Moved the Plan.')
    const long = boundSummary('x'.repeat(PLAN_ACTIVITY_SUMMARY_MAX + 40))
    expect(long.length).toBe(PLAN_ACTIVITY_SUMMARY_MAX)
    expect(long.endsWith('…')).toBe(true)
  })
})

describe('latestActivity', () => {
  it('reads newest first and stops at the shown count', () => {
    const rows = Array.from({ length: PLAN_ACTIVITY_SHOWN + 5 }, (_, i) =>
      mapPlanActivityRow(row({ id: `a-${i}`, created_at: `2026-09-${String(1 + (i % 28)).padStart(2, '0')}T10:00:00Z` }), { actorName: null, spaceName: null }, null),
    )
    const shown = latestActivity(rows)
    expect(shown.length).toBe(PLAN_ACTIVITY_SHOWN)
    expect(shown[0].createdAt >= shown[1].createdAt).toBe(true)
    expect(latestActivity(rows, 3).length).toBe(3)
  })
})

describe('who did it', () => {
  it('names the actor and the Space, falls back to the Space, then stays honest, with no long dash', () => {
    const mine = mapPlanActivityRow(row(), { actorName: 'Mara', spaceName: 'Lab' }, 'profile-1')
    expect(mine.mine).toBe(true)
    expect(actorWords(mine)).toBe('You')
    expect(actorWords({ actorName: 'Mara', spaceName: 'The Green Room', mine: false })).toBe('Mara (The Green Room)')
    expect(actorWords({ actorName: null, spaceName: 'The Green Room', mine: false })).toBe('Someone at The Green Room')
    expect(actorWords({ actorName: null, spaceName: null, mine: false })).toBe('Someone on the Plan')
    expect(actorWords({ actorName: null, spaceName: 'The Green Room', mine: false })).not.toMatch(/[–—!]/)
  })
})
