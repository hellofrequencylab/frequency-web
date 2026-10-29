import {
  deleteCalendarEntry,
  pickPencilDate,
  saveCalendarEntry,
  saveCalendarEntryOccurrence,
  skipPencilDate,
} from '@/app/(main)/spaces/[slug]/settings/calendar/entry-actions'
import { listEntryActivity, listEntryComments, postEntryComment } from '@/app/(main)/spaces/[slug]/settings/calendar/entry-record-actions'
import {
  addPlanTodo,
  editPlanText,
  listPlanActivity,
  listPlanComments,
  postPlanComment,
  transitionPlanStage,
} from '@/app/(main)/spaces/[slug]/settings/calendar/plan-actions'
import {
  assignPlanTodo,
  deleteSpaceTodo,
  moveSpaceTodo,
  renameSpaceTodo,
  setSpaceTaskDone,
} from '@/app/(main)/spaces/[slug]/settings/calendar/task-actions'
import type { ActionResult } from '@/lib/action-result'
import type { EntryInput } from '@/lib/calendar/entries'
import type { PlanActivityView } from '@/lib/calendar/plan-activity'
import type { PlanCommentView } from '@/lib/calendar/plan-comments'
import type { WorkflowStage } from '@/lib/calendar/workflow-board'

// THE WRITES BEHIND THE DETAILS PANEL. Every one is a server action the calendar already had (pass 2
// and before), bound to one Space, except renaming and deleting a to-do, which had no door. The panel
// takes them as a prop so a test or a still picture can pass recorders; CalendarSuite passes these.

/** What a result looks like to the panel: an error sentence, or success. */
type Done = { error: string } | { data?: unknown }

/** Whose record and thread Details shows: a Plan's, or a standalone date's own. */
export type RecordSubject = { kind: 'plan'; id: string } | { kind: 'entry'; id: string }

/** One line of the merged history: an edit the team made, or a note someone left. */
export interface RecordLoad {
  activity: PlanActivityView[]
  comments: PlanCommentView[]
}

export interface DetailsActions {
  /** Create (null) or save one entry. */
  saveEntry: (entryId: string | null, input: EntryInput) => Promise<Done>
  /** Change one date of a repeating entry on its own. */
  saveOccurrence: (entryId: string, day: string, input: EntryInput) => Promise<Done>
  /** Skip one date of a repeating entry. */
  skipDate: (entryId: string, day: string) => Promise<Done>
  deleteEntry: (entryId: string) => Promise<Done>
  /** Keep one candidate date and let the others go. */
  pickDate: (entryId: string) => Promise<Done>
  /** Change a Plan's title or notes and nothing else. */
  editPlan: (planId: string, patch: { title?: string; notes?: string }) => Promise<Done>
  setPlanStage: (planId: string, stage: WorkflowStage) => Promise<Done>
  addTodo: (planId: string, title: string, offsetDays: number) => Promise<Done>
  setTodoDone: (taskId: string, done: boolean) => Promise<Done>
  renameTodo: (taskId: string, title: string) => Promise<Done>
  moveTodo: (taskId: string, due: string | null) => Promise<Done>
  assignTodo: (taskId: string, profileId: string | null) => Promise<Done>
  deleteTodo: (taskId: string) => Promise<Done>
  loadRecord: (subject: RecordSubject) => Promise<RecordLoad | { error: string }>
  postComment: (subject: RecordSubject, body: string) => Promise<Done>
}

async function load<T>(res: Promise<ActionResult<T>>): Promise<{ data: T } | { error: string }> {
  try {
    return await res
  } catch {
    return { error: 'Something went wrong. Try again.' }
  }
}

/** The calendar's own server actions, bound to one Space. */
export function bindDetailsActions(slug: string): DetailsActions {
  return {
    saveEntry: (entryId, input) => saveCalendarEntry(slug, entryId, input),
    saveOccurrence: (entryId, day, input) => saveCalendarEntryOccurrence(slug, entryId, day, input),
    skipDate: (entryId, day) => skipPencilDate(slug, entryId, day),
    deleteEntry: (entryId) => deleteCalendarEntry(slug, entryId),
    pickDate: (entryId) => pickPencilDate(slug, entryId),
    editPlan: (planId, patch) => editPlanText(slug, planId, patch),
    setPlanStage: (planId, stage) => transitionPlanStage(slug, planId, stage),
    addTodo: (planId, title, offsetDays) => addPlanTodo(slug, planId, title, null, offsetDays),
    setTodoDone: (taskId, done) => setSpaceTaskDone(slug, taskId, done),
    renameTodo: (taskId, title) => renameSpaceTodo(slug, taskId, title),
    moveTodo: (taskId, due) => moveSpaceTodo(slug, taskId, due),
    assignTodo: (taskId, profileId) => assignPlanTodo(slug, taskId, profileId),
    deleteTodo: (taskId) => deleteSpaceTodo(slug, taskId),
    loadRecord: async (subject) => {
      const [activity, comments] =
        subject.kind === 'plan'
          ? await Promise.all([load(listPlanActivity(slug, subject.id)), load(listPlanComments(slug, subject.id))])
          : await Promise.all([load(listEntryActivity(slug, subject.id)), load(listEntryComments(slug, subject.id))])
      if ('error' in activity) return { error: activity.error }
      if ('error' in comments) return { error: comments.error }
      return { activity: activity.data, comments: comments.data }
    },
    postComment: (subject, body) =>
      subject.kind === 'plan' ? postPlanComment(slug, subject.id, null, body) : postEntryComment(slug, subject.id, body),
  }
}
