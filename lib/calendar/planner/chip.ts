import { dayOfWeek, lastDay } from './days'
import { KINDS } from './kinds'
import type { PlannerItem, PlannerTask } from './types'

// THE MONTH CHIP, as data (README 1.3). What one item prints on one day of the grid: its title, the
// short word, the short time and the flags, and the shape of its edges when it runs across several
// days. The view paints it; deciding it here keeps the rule testable and the same for the Agenda.

/** "7p", "9:30a", "12p": the short time a chip prints. Empty for an all-day item. */
export function shortClock(minutes: number | null | undefined): string {
  if (minutes == null) return ''
  const total = Math.max(0, Math.min(1439, Math.round(minutes)))
  const h24 = Math.floor(total / 60)
  const m = total % 60
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  return `${h12}${m ? `:${String(m).padStart(2, '0')}` : ''}${h24 < 12 ? 'a' : 'p'}`
}

export interface ChipModel {
  /** The record the chip opens in Details. */
  ref: { kind: 'item' | 'todo'; id: string }
  kind: PlannerItem['kind'] | 'todo'
  /** The title to print, or empty on a band's middle days. */
  title: string
  /** The short word ("Evt"), empty where the title is hidden. */
  word: string
  /** "Opt A", or empty. */
  option: string
  time: string
  /** "Clash", "Invite" and the like. */
  flags: string[]
  /** All day, or several days: drawn as a band that runs across cells. */
  band: boolean
  startsHere: boolean
  endsHere: boolean
  struck: boolean
  /** The tooltip and the accessible name: "Production · 7p · Sound bath". */
  label: string
}

/** The chip for an item on `day`. A band prints its title on the day it starts and on each Monday. */
export function itemChip(
  item: PlannerItem,
  day: string,
  flags: { clash?: boolean; invite?: boolean } = {},
): ChipModel {
  const look = KINDS[item.kind]
  const band = item.startMin == null || !!item.end
  const startsHere = item.date === day
  const endsHere = lastDay(item) === day
  const showTitle = band ? startsHere || dayOfWeek(day) === 1 : true
  const time = band ? '' : shortClock(item.startMin)
  const out: string[] = []
  if (flags.clash) out.push('Clash')
  if (flags.invite) out.push('Invite')
  return {
    ref: { kind: 'item', id: item.id },
    kind: item.kind,
    title: showTitle ? item.title : '',
    word: showTitle ? look.short : '',
    option: item.option ? `Opt ${item.option}` : '',
    time,
    flags: out,
    band,
    startsHere,
    endsHere,
    struck: look.deco === 'line-through',
    label: [look.word, time, item.title].filter(Boolean).join(' · '),
  }
}

/** The chip for a to-do due on a day. */
export function todoChip(task: PlannerTask): ChipModel {
  return {
    ref: { kind: 'todo', id: task.id },
    kind: 'todo',
    title: task.title,
    word: KINDS.todo.short,
    option: '',
    time: '',
    flags: [],
    band: false,
    startsHere: true,
    endsHere: true,
    struck: task.done,
    label: [task.done ? 'To-do, done' : 'To-do', task.title].join(' · '),
  }
}
