import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// LIVE-467, finding 4. Vera's accepted "archive" change set `archived_at` and nothing else, while
// the drawer's "Archive Plan" goes through archiveSpacePlan (plans-store's archiveSpacePlanRows:
// pencilled dates dropped, event-backed dates unlinked, then the stamp). So after Vera archived a
// Plan its pencilled dates stayed on the grid, tied to a Plan no list showed and whose "Open Plan"
// did nothing. Source-level, the house archetype (plan-actions.test.ts), because the failure is
// silent at runtime: nothing throws when a date is left behind.

const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const actions = code(readFileSync('app/(main)/spaces/[slug]/settings/calendar/vera-calendar-actions.ts', 'utf8'))

function caseBody(src: string, kind: string): string {
  const at = src.indexOf(`case '${kind}': {`)
  expect(at, `the ${kind} case exists`).toBeGreaterThan(-1)
  return src.slice(at, src.indexOf('\n    }', at))
}

describe('Vera archives a Plan through the same door the drawer uses', () => {
  it('the archive case calls archiveSpacePlan, never a bare archived_at stamp', () => {
    const body = caseBody(actions, 'archive')
    expect(body).toContain('archiveSpacePlan(slug, change.planId)')
    expect(body).not.toContain('archived_at')
    expect(body).not.toContain('updateSpacePlan(')
    expect(actions).toMatch(/import \{[^}]*\barchiveSpacePlan\b[^}]*\} from '\.\/plan-actions'/)
  })

  it('the result line says what happened to the dates', () => {
    const body = caseBody(actions, 'archive')
    expect(body).toContain('Its penciled dates left the calendar')
    expect(body).not.toContain('Nothing is deleted')
  })
})

// DATES FROM WHAT HAPPENED (LIVE-539). The attendance read is handed to the model loop as a reader
// keyed by the editor's Space, over this Space's published past events only, and the loop itself
// imports no store, so no other Space's history can reach the prompt (ADR-1386 P6). Source-level,
// like the cases above: the failure is a wider read, which throws nothing.
describe('Vera reads what drew people through the action, never through the loop', () => {
  it('hands the model loop a reader keyed by the Space the editor resolved', () => {
    expect(actions).toMatch(/readAttendance:\s*\(\)\s*=>\s*readAttendanceHistory\(editor\.spaceId\)/)
  })

  it('reads this Space own past, published events, bounded, and folds the per-event record', () => {
    const at = actions.indexOf('async function readAttendanceHistory(')
    expect(at).toBeGreaterThan(-1)
    const body = actions.slice(at, actions.indexOf('\n}', at))
    expect(body).toContain('listEventsForSpace(spaceId, {')
    expect(body).toContain('toDay: dayInZone(new Date(), HOME_TZ)')
    expect(body).not.toContain('upcomingOnly')
    expect(body).toContain('limit: MAX_HISTORY_EVENTS')
    expect(body).not.toContain('includeUnpublished')
    expect(body).toContain('loadEventAttendanceCounts(')
    expect(body).toContain('attendanceHistory(')
  })

  it('the loop imports no store and no admin client', () => {
    const loop = code(readFileSync('lib/ai/vera-calendar.ts', 'utf8'))
    expect(loop).not.toMatch(/event-stats|entries-store|plans-store|@\/lib\/events\/store|supabase\/admin/)
  })
})

// THE REASON ON THE LINE (LIVE-540). The fold the loop read rides the describe context the propose
// door returns, so the box can end a pencil line with the server's sentence; the model's note is
// never the carrier, and the undo door (which reads no history) never carries one.
describe('the propose door carries what drew people onto the describe context', () => {
  it('moves attendance off the reply and onto the context, only when Vera read it', () => {
    const at = actions.indexOf('export async function veraCalendarCommand(')
    const body = actions.slice(at, actions.indexOf('\n}', at))
    expect(body).toContain('const { attendance, ...reply } = res')
    expect(body).toContain('if (attendance) describe.attendance = attendance')
    expect(body).toContain('return ok({ ...reply, timeZone, context: describe })')
  })
})
