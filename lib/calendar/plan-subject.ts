// WHAT A RECORD IS ABOUT (calendar suite pass 2). The Plan record (space_plan_activity) and the Plan
// thread (space_plan_comments) were about a Plan. A standalone calendar entry, one that is not on a
// Plan, can now be their subject too, and the tables hold that as a CHECK: exactly one of plan_id
// and entry_id is set. This is the pure half of that rule, so the stores cannot write a row the
// database would refuse and the two stores cannot drift. No IO, no imports.

/** Exactly one subject: a Plan or a standalone entry. `never` makes naming both a type error. */
export type PlanSubject = { planId: string; entryId?: never } | { entryId: string; planId?: never }

/** The two columns a row is written with, or null when the subject names neither or both (a
 *  caller bug, refused before it reaches the database). */
export function subjectColumns(subject: { planId?: string | null; entryId?: string | null }): { plan_id: string | null; entry_id: string | null } | null {
  const plan = typeof subject.planId === 'string' && subject.planId ? subject.planId : null
  const entry = typeof subject.entryId === 'string' && subject.entryId ? subject.entryId : null
  if ((plan === null) === (entry === null)) return null
  return { plan_id: plan, entry_id: entry }
}
