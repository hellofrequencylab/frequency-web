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
