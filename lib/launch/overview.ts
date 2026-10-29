// THE LAUNCH OVERVIEW (the pure half). Everything the person already has, read as a to-do: what is done, what is next,
// and how far along they are, per section and overall. The same model draws the page before the launch and the Get
// Started list after it, so there is one list and one set of numbers. Photos are encouraged and always skippable: a
// skipped photo is just an item that stays on the list. Nothing here is invented; an item is done only when a real
// record says so, and what was found is shown beside it. PURE.

type ItemState = 'done' | 'todo'

interface InventoryItem {
  id: string
  label: string
  state: ItemState
  /** What was found for a done item, in the person's own words or the record's own value. */
  found?: string
  /** A photo item: encouraged, never required, with a plain Skip. */
  photo?: boolean
  /** The person chose to skip it for now. It stays on the list, it just stops asking. */
  skipped?: boolean
  /** Where the item opens, when it is not one of the launch's own steps (a Space console tool, lib/launch/setup-items.ts). */
  href?: string
}

export interface InventorySection {
  id: 'spotlight' | 'space' | 'website' | 'email' | 'schedule' | 'circle' | 'journey' | 'paid' | 'money' | 'reach'
  title: string
  items: InventoryItem[]
}

interface SectionProgress {
  id: InventorySection['id']
  title: string
  done: number
  total: number
  /** 0 to 1. */
  ratio: number
  state: 'done' | 'next' | 'later'
}

interface OverviewProgress {
  done: number
  total: number
  ratio: number
  sections: SectionProgress[]
  /** The first item still to do, in section order, skipped ones last. */
  next: { section: InventorySection['id']; item: InventoryItem } | null
}

export function overviewProgress(sections: readonly InventorySection[]): OverviewProgress {
  let nextSection: InventorySection['id'] | null = null
  const rows: SectionProgress[] = sections.map((s) => {
    const done = s.items.filter((i) => i.state === 'done').length
    const total = s.items.length
    const complete = total > 0 && done === total
    const row: SectionProgress = { id: s.id, title: s.title, done, total, ratio: total ? done / total : 0, state: complete ? 'done' : 'later' }
    if (!complete && nextSection === null) {
      nextSection = s.id
      row.state = 'next'
    }
    return row
  })
  const done = rows.reduce((n, r) => n + r.done, 0)
  const total = rows.reduce((n, r) => n + r.total, 0)
  const open = sections.flatMap((s) => s.items.filter((i) => i.state === 'todo').map((item) => ({ section: s.id, item })))
  const next = open.find((o) => !o.item.skipped) ?? open[0] ?? null
  return { done, total, ratio: total ? done / total : 0, sections: rows, next }
}
