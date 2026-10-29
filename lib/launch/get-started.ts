// THE GET STARTED LIST AFTER PUBLISH (the pure half). The same to-do the launch overview draws before the launch
// (lib/launch/overview.ts over lib/launch/inventory.ts), cut for the rail: what is still to do with where each
// item goes, what is already done with the record's own words, and the one set of numbers. No second list, no second
// count. PURE.

import { launchStepHref } from './steps.ts'
import { overviewProgress, type InventorySection } from './overview.ts'

/** The launch step whose screen finishes each section's items. */
const SECTION_STEP = {
  spotlight: 'spotlight',
  space: 'space',
  website: 'website',
  email: 'people',
  schedule: 'event',
  circle: 'circle',
  journey: 'journey',
  paid: 'paid',
} as const

interface GetStartedItem {
  id: string
  section: InventorySection['id']
  label: string
  href: string
  photo: boolean
  skipped: boolean
  found?: string
}

interface GetStartedView {
  done: number
  total: number
  ratio: number
  left: number
  complete: boolean
  sections: { id: InventorySection['id']; title: string; done: number; total: number; ratio: number }[]
  todo: GetStartedItem[]
  found: GetStartedItem[]
}

/** True once the person's Spotlight is published: the moment the launch box hands the list over. */
export function isPublished(sections: readonly InventorySection[]): boolean {
  return sections.some((s) => s.id === 'spotlight' && s.items.some((i) => i.id === 'sp-live' && i.state === 'done'))
}

export function getStartedView(sections: readonly InventorySection[]): GetStartedView {
  const p = overviewProgress(sections)
  const items = sections.flatMap((s) =>
    s.items.map((i) => ({ state: i.state, row: { id: i.id, section: s.id, label: i.label, href: launchStepHref(SECTION_STEP[s.id]), photo: i.photo === true, skipped: i.skipped === true, found: i.found } })),
  )
  // Skipped items stay on the list; they just come after the ones still asking.
  const todo = items.filter((x) => x.state === 'todo').map((x) => x.row)
  todo.sort((a, b) => Number(a.skipped) - Number(b.skipped))
  return {
    done: p.done,
    total: p.total,
    ratio: p.ratio,
    left: p.total - p.done,
    complete: p.total > 0 && p.done === p.total,
    sections: p.sections.map(({ id, title, done, total, ratio }) => ({ id, title, done, total, ratio })),
    todo,
    found: items.filter((x) => x.state === 'done').map((x) => x.row),
  }
}
