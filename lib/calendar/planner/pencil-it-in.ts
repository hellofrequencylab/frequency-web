import type { EntryInput } from '../entries'
import { isValidTimeZone } from '@/lib/time/zone'
import { HOLD_LENGTHS, holdEnd } from './hold'
import { findPlaybook, schedulePlaybook } from './playbook-schedule'
import type { TodoPhase } from './types'

// WHAT A PENCIL IT IN SAVE, AND A QUICK ADD, ASK THE SERVER TO WRITE. Pure: the browser sends plain
// values, this reads them against today's day key and hands back the rows to make, or one sentence
// saying what is wrong. The server actions (pencil-actions.ts) only carry the result out.

/** The most dates one Pencil it in holds (the sheet says "up to three"). */
export const PENCIL_MAX_DATES = 3

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const pad = (n: number) => String(n).padStart(2, '0')
const hhmm = (min: number) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`

function isDay(key: unknown): key is string {
  if (typeof key !== 'string') return false
  const m = DAY_RE.exec(key)
  if (!m) return false
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  return dt.getUTCFullYear() === Number(m[1]) && dt.getUTCMonth() === Number(m[2]) - 1 && dt.getUTCDate() === Number(m[3])
}

function cleanTitle(raw: unknown): string {
  return typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim().slice(0, 200) : ''
}

function cleanStart(raw: unknown): number | null | 'bad' {
  if (raw === null || raw === undefined) return null
  return typeof raw === 'number' && Number.isInteger(raw) && raw >= 0 && raw < 1440 ? raw : 'bad'
}

function cleanLength(raw: unknown): number | 'bad' {
  if (raw === undefined) return 60
  return typeof raw === 'number' && Number.isInteger(raw) && raw >= 5 && raw <= 1440 ? raw : 'bad'
}

/** A timed date that would run past midnight stops at 11:59 PM. */
function pencilEntry(title: string, day: string, startMin: number | null, durMin: number, timeZone: string, planId: string | null): EntryInput {
  return {
    kind: 'pencil',
    title,
    allDay: startMin === null,
    startDate: day,
    endDate: day,
    startTime: startMin === null ? null : hhmm(startMin),
    endTime: startMin === null ? null : hhmm(Math.min(startMin + durMin, 1439)),
    timeZone,
    stage: 'pencil',
    blocksTime: false,
    showPublicly: false,
    planId,
  }
}

interface PencilTodo {
  title: string
  /** The ISO instant the to-do is due: noon UTC on its day, like every other relative to-do. */
  dueAt: string
  dueOffsetDays: number
  phase: TodoPhase
  estMinutes: number
}

interface PencilItInPlan {
  title: string
  dates: string[]
  /** One pencil entry form per held date, the first the Plan's lead. */
  entries: (planId: string | null) => EntryInput[]
  /** The day the hold ends, or null for none. */
  holdUntil: string | null
  /** The playbook's name when it adds to-dos, else null. */
  playbookName: string | null
  todos: PencilTodo[]
}

/** Reads a Pencil it in save. `today` is the Space's day key. */
export function planPencilItIn(raw: unknown, today: string): { data: PencilItInPlan } | { error: string } {
  if (!raw || typeof raw !== 'object') return { error: 'There was nothing to save.' }
  const r = raw as Record<string, unknown>
  const title = cleanTitle(r.title)
  if (!title) return { error: 'Say what you are holding dates for.' }
  const dates: string[] = []
  for (const d of Array.isArray(r.dates) ? r.dates : []) {
    if (!isDay(d)) return { error: 'One of the dates is not a real day.' }
    if (d < today) return { error: 'A date that has passed cannot be held.' }
    if (!dates.includes(d)) dates.push(d)
  }
  if (dates.length === 0) return { error: 'Pick at least one day to hold.' }
  if (dates.length > PENCIL_MAX_DATES) return { error: 'Hold up to three dates.' }
  const start = cleanStart(r.startMin)
  if (start === 'bad') return { error: 'That is not a start time.' }
  const dur = cleanLength(r.durMin)
  if (dur === 'bad') return { error: 'That is not a length.' }
  const holdDays =
    r.holdDays === 0 || r.holdDays === undefined ? 0 : (HOLD_LENGTHS as readonly unknown[]).includes(r.holdDays) ? (r.holdDays as number) : -1
  if (holdDays < 0) return { error: 'Hold for 3, 7 or 14 days.' }
  const playbookId = typeof r.playbookId === 'string' ? r.playbookId : ''
  const playbook = playbookId ? findPlaybook(playbookId) : undefined
  if (playbookId && !playbook) return { error: 'That playbook is not here.' }
  const timeZone = typeof r.timeZone === 'string' ? r.timeZone.trim() : ''
  if (!isValidTimeZone(timeZone)) return { error: 'The calendar needs a time zone.' }

  const todos = schedulePlaybook(playbook?.id, dates, today).map((t) => ({
    title: t.title,
    dueAt: `${t.due}T12:00:00.000Z`,
    dueOffsetDays: t.dueOffsetDays,
    phase: t.phase,
    estMinutes: Math.round(t.estHours * 60),
  }))
  return {
    data: {
      title,
      dates,
      entries: (planId) => dates.map((d) => pencilEntry(title, d, start, dur, timeZone, planId)),
      holdUntil: holdDays > 0 ? holdEnd(today, holdDays) : null,
      playbookName: playbook && playbook.lines.length ? playbook.name : null,
      todos,
    },
  }
}

export type QuickKind = 'pencil' | 'private' | 'unavailable' | 'todo'

interface QuickAddPlan {
  kind: QuickKind
  title: string
  day: string | null
  startMin: number | null
  durMin: number
}

/** Reads a quick add or a command-bar create. A to-do may have no day; everything else needs one. */
export function planQuickAdd(raw: unknown): { data: QuickAddPlan } | { error: string } {
  if (!raw || typeof raw !== 'object') return { error: 'There was nothing to add.' }
  const r = raw as Record<string, unknown>
  const kind = r.kind
  if (kind !== 'pencil' && kind !== 'private' && kind !== 'unavailable' && kind !== 'todo') return { error: 'Choose what to add.' }
  const title = cleanTitle(r.title)
  if (!title) return { error: 'Give it a name.' }
  const day = r.day === null || r.day === undefined ? null : r.day
  if (day !== null && !isDay(day)) return { error: 'That is not a real day.' }
  if (day === null && kind !== 'todo') return { error: 'Pick a day.' }
  const start = cleanStart(r.startMin)
  if (start === 'bad') return { error: 'That is not a start time.' }
  const dur = cleanLength(r.durMin)
  if (dur === 'bad') return { error: 'That is not a length.' }
  return { data: { kind, title, day, startMin: kind === 'unavailable' ? null : start, durMin: dur } }
}

/** The entry form for a private or unavailable quick add. An unavailable span is always all day. */
export function quickEntry(q: { kind: QuickKind; title: string; day: string | null; startMin: number | null; durMin: number }, timeZone: string): EntryInput {
  const timed = q.kind === 'private' && q.startMin !== null
  const startMin = q.startMin ?? 0
  return {
    kind: q.kind,
    title: q.title,
    allDay: !timed,
    startDate: q.day ?? '',
    endDate: q.day ?? '',
    startTime: timed ? hhmm(startMin) : null,
    endTime: timed ? hhmm(Math.min(startMin + q.durMin, 1439)) : null,
    timeZone,
    blocksTime: q.kind === 'unavailable',
    showPublicly: false,
  }
}

/** The line a Pencil it in says when it is done: "Pencilled in. Holding 2 dates until Oct 27". */
export function pencilDoneLine(dates: number, holdUntilLabel: string | null): string {
  const held = `Holding ${dates === 1 ? '1 date' : `${dates} dates`}`
  return `Pencilled in. ${holdUntilLabel ? `${held} until ${holdUntilLabel}` : held}`
}
