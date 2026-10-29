import type { buildBoard } from './board'

// THE LIST'S ORDER. The List is the board's Plans in rows, grouped by stage; a person sorts the rows
// inside each group by the column they press. Sorting never moves a Plan between groups, because the
// group is the stage. Pure, so a test can walk every column both ways.

type BoardColumn = ReturnType<typeof buildBoard>[number]
type ListCard = BoardColumn['cards'][number]

export type ListSort = 'plan' | 'next' | 'todos' | 'health'
export type ListDir = 'asc' | 'desc'

/** How worrying a health is, so "Health" sorts the Plans that need a look to the top. */
const HEALTH_RANK: Record<string, number> = {
  overdue: 0,
  'hold-lapsed': 1,
  'needs-date': 2,
  holding: 3,
  'on-track': 4,
  cancelled: 5,
}

/** The direction a column opens in: dates and names run forward, health runs worst first. */
export function firstDir(sort: ListSort): ListDir {
  return sort === 'todos' ? 'desc' : 'asc'
}

function compare(a: ListCard, b: ListCard, sort: ListSort): number {
  if (sort === 'plan') return a.title.localeCompare(b.title)
  if (sort === 'next') {
    // A Plan with no date has no place in time: it goes last whichever way the column runs.
    if (a.nextDate === b.nextDate) return 0
    if (a.nextDate == null) return 1
    if (b.nextDate == null) return -1
    return a.nextDate < b.nextDate ? -1 : 1
  }
  if (sort === 'todos') return a.pct - b.pct
  return (HEALTH_RANK[a.health.key] ?? 9) - (HEALTH_RANK[b.health.key] ?? 9)
}

/** The cards of one group in the order a column asks for. Ties keep the title order, so the list does
 *  not shuffle between two presses. */
export function sortCards(cards: readonly ListCard[], sort: ListSort, dir: ListDir): ListCard[] {
  const sign = dir === 'asc' ? 1 : -1
  return cards.slice().sort((a, b) => {
    // The empty dates stay last in both directions.
    if (sort === 'next' && (a.nextDate == null || b.nextDate == null)) return compare(a, b, sort) || a.title.localeCompare(b.title)
    return compare(a, b, sort) * sign || a.title.localeCompare(b.title)
  })
}
