import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// THE DOORS BEHIND THE DETAILS PANEL (calendar suite pass 5). Source-level, like plan-actions.test.ts:
// what these guard is a door that skips its gate, writes more than it was asked to, or leaves the
// record silent. The panel adds three small doors (rename a to-do, delete a to-do, edit a Plan's text)
// and teaches saveCalendarEntry to keep a standalone date's own record.

const dir = 'app/(main)/spaces/[slug]/settings/calendar/'

/** The text of one exported async function, up to the next top-level declaration. */
function body(source: string, name: string): string {
  const start = source.indexOf(`export async function ${name}(`)
  expect(start, name).toBeGreaterThan(-1)
  const rest = source.slice(start + 1)
  const next = rest.search(/\n(?:export |async function |function |\/\*\*|\/\/ ──)/)
  return next === -1 ? rest : rest.slice(0, next)
}

describe('renaming and deleting a to-do', () => {
  const tasks = readFileSync(dir + 'task-actions.ts', 'utf8')

  it('both prove the editor and the to-do inside this Space before they write', () => {
    for (const name of ['renameSpaceTodo', 'deleteSpaceTodo']) {
      const b = body(tasks, name)
      expect(b, name).toContain('await resolveEditor(slug)')
      expect(b, name).toContain('UUID_RE.test(taskId)')
      expect(b, name).toContain('getTaskInScope(taskId, editor.spaceId)')
    }
    expect(body(tasks, 'renameSpaceTodo')).toContain('retitleTaskInScope(taskId, title, editor.spaceId)')
    expect(body(tasks, 'deleteSpaceTodo')).toContain('deleteTaskInScope(taskId, editor.spaceId)')
  })

  it('refuses a blank title and bounds a long one', () => {
    const b = body(tasks, 'renameSpaceTodo')
    expect(b).toContain("fail('Give the to-do a title.')")
    expect(b).toContain('.slice(0, TODO_TITLE_MAX)')
  })

  it('a to-do on a Plan writes the Plan record, and the calendar pages are revalidated', () => {
    for (const name of ['renameSpaceTodo', 'deleteSpaceTodo']) {
      const b = body(tasks, name)
      expect(b, name).toContain('if (task.planId)')
      expect(b, name).toContain('recordPlanActivity(')
      expect(b, name).toContain('revalidatePath(`/spaces/${slug}/settings/calendar`)')
    }
  })
})

describe('editing a Plan title or notes', () => {
  const plans = readFileSync(dir + 'plan-actions.ts', 'utf8')
  const b = body(plans, 'editPlanText')

  it('is gated to this Space’s own Plan, and writes only the keys it was given', () => {
    expect(b).toContain('await editorPlan(slug, planId)')
    expect(b).toContain("if ('title' in rawPatch)")
    expect(b).toContain("if ('notes' in rawPatch)")
    // The whole-form writer would clear links and files; this door must not name them.
    expect(b).not.toMatch(/links|files|playbook/)
    expect(b).toContain('updateSpacePlan(editor.spaceId, planId, patch)')
  })

  it('says what it did in the Plan record', () => {
    expect(b).toContain('recordPlanActivity(')
    expect(b).toContain("'Renamed the Plan.'")
  })
})

describe('a standalone date keeps its own record', () => {
  const entries = readFileSync(dir + 'entry-actions.ts', 'utf8')
  const save = body(entries, 'saveCalendarEntry')

  it('an edit of a date on no Plan writes the entry arm of the record', () => {
    expect(save).toContain('if (!(\'error\' in res) && !current.plan_id) entryNote = standaloneChangeWords(current, w)')
    expect(save).toContain('if (entryId && entryNote)')
    expect(save).toMatch(/recordPlanActivity\(\{\s*entryId,/)
  })

  it('names the change in the words the team reads', () => {
    expect(entries).toContain('`Renamed to "${after.title}".`')
    expect(entries).toContain('`Moved to ${shortDateLabel(after.starts_at.slice(0, 10))}.`')
  })
})
