// THE PLAN TO-DO LIST, IN ORDER (Plan pop-up, 2026-11-25). The drawer listed every to-do in the
// order it was added, done and open together, so a Plan with a launch run of twenty rows read as a
// wall. This is the one ordering the drawer renders: open to-dos first, the overdue ones at the
// top, then by due day, then the undated ones; the done ones apart, so the drawer can fold them.
//
// Pure and client-safe: it reads only the fields it orders by, and today's day is passed in.

type TodoLike = { status: string; dueAt: string | null }

/** The day of a due value as YYYY-MM-DD (a `due_at` instant or a day key), or null. */
function dueDay(dueAt: string | null): string | null {
  return typeof dueAt === 'string' && /^\d{4}-\d{2}-\d{2}/.test(dueAt) ? dueAt.slice(0, 10) : null
}

/** True when an open to-do's due day is before `today` (YYYY-MM-DD). A done one is never overdue. */
export function isOverdueTodo(todo: TodoLike, today: string): boolean {
  if (todo.status === 'done') return false
  const day = dueDay(todo.dueAt)
  return day !== null && day < today
}

/** Open to-dos (overdue first, then by due day, undated last, ties in the order given) and the done
 *  ones (in the order given). */
export function orderPlanTodos<T extends TodoLike>(todos: readonly T[]): { open: T[]; done: T[] } {
  const open: { t: T; i: number }[] = []
  const done: T[] = []
  todos.forEach((t, i) => (t.status === 'done' ? done.push(t) : open.push({ t, i })))
  open.sort((a, b) => {
    const da = dueDay(a.t.dueAt)
    const db = dueDay(b.t.dueAt)
    if (da !== db) {
      if (da === null) return 1
      if (db === null) return -1
      return da < db ? -1 : 1
    }
    return a.i - b.i
  })
  return { open: open.map((o) => o.t), done }
}

/** Today in the viewer's own zone, as YYYY-MM-DD (en-CA is the locale that formats that way). */
export function todayDayKey(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}
