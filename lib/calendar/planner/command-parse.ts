import { dayInZone, resolveZone } from '@/lib/time/zone'
import { addDays, clockLabel, dayLabel, dayOfWeek, lengthLabel } from './days'

// THE COMMAND BAR PARSER. "Pencil supper club with Ocean House next fri 7pm" becomes a kind, a title,
// a day, a time, a length and a co-host, plus a preview a person reads before anything is made.
//
// Fixes on the prototype's grammar: a weekday only counts as a WHOLE word ("Sunset stretch" stays a
// title, so do Wedding, Monitor and Saturate); "on" and "at" are dropped only when they sit right
// before the date or time they introduce, never from inside a title; and the kind words (block,
// todo, private, off) count only as the leading word or in an explicit "as <kind>" form, so "Sign off
// the budget" stays a pencil. Today and the Space time zone come in as arguments; nothing here reads
// the clock.

type CommandKind = 'pencil' | 'private' | 'unavailable' | 'todo'

interface CohostOption {
  id: string
  /** What the preview calls it. */
  name: string
  /** Lowercase spellings after "with", longest first is not required. */
  aliases: readonly string[]
}

/** The Spaces a command can name today. The data pass replaces this with the Space's partners. */
export const DEFAULT_COHOSTS: readonly CohostOption[] = [
  { id: 'ocean', name: 'Ocean House', aliases: ['ocean house', 'ocean'] },
  { id: 'vine', name: 'Sunshine Vineyard', aliases: ['sunshine vineyard', 'sunshine', 'vine'] },
  { id: 'swami', name: "Swami's Beach", aliases: ["swami's beach", 'swamis beach', "swami's", 'swami'] },
]

interface ParseOptions {
  /** Today's day key in the Space time zone. */
  today: string
  /** The Space time zone, echoed on the result so a preview can name it. */
  timeZone?: string
  cohosts?: readonly CohostOption[]
}

interface UnderstoodPart {
  label: 'Kind' | 'Title' | 'Day' | 'Time' | 'Length' | 'Co-host'
  value: string
  /** False when the parser filled it in (today, one hour) rather than the person saying it. */
  said: boolean
}

interface ParsedCommand {
  kind: CommandKind
  kindWord: string
  title: string
  /** Day key, or null for a to-do with no day (it goes to the inbox). */
  date: string | null
  /** Minutes since midnight, or null. */
  startMin: number | null
  durMin: number
  cohost: { id: string; name: string } | null
  timeZone: string
  /** The command bar's create row: "Add pencil: Supper club". */
  rowLabel: string
  /** Under it: "Fri, Oct 23, 7 PM", or "No date, goes to inbox". */
  rowMeta: string
  /** One line: "Pencil: Supper club, Fri, Oct 23, 7 PM, with Ocean House". */
  summary: string
  /** The "what I understood" list. */
  understood: UnderstoodPart[]
}

const KIND_WORD: Record<CommandKind, string> = {
  pencil: 'Pencil',
  private: 'Private',
  unavailable: 'Unavailable',
  todo: 'To-do',
}

const WEEKDAYS: Record<string, number> = {
  sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6,
}
const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6,
  jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10,
  nov: 11, november: 11, dec: 12, december: 12,
}

const NOT_POSSESSIVE = String.raw`(?!['’]s)`
const KIND_BY_WORD: Record<string, CommandKind> = {
  todo: 'todo', 'to-do': 'todo', task: 'todo', reminder: 'todo', remind: 'todo',
  block: 'unavailable', unavailable: 'unavailable', closed: 'unavailable', off: 'unavailable',
  private: 'private', meeting: 'private', sync: 'private', call: 'private',
  pencil: 'pencil', hold: 'pencil',
}
/** Leading kind words that are also the first word of the title, so they stay in it. */
const KEEP_IN_TITLE = new Set(['closed', 'off', 'meeting', 'sync', 'call'])

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const pad = (n: number) => String(n).padStart(2, '0')

function validDay(year: number, month: number, day: number): string | null {
  const dt = new Date(Date.UTC(year, month - 1, day))
  if (dt.getUTCFullYear() !== year || dt.getUTCMonth() !== month - 1 || dt.getUTCDate() !== day) return null
  return `${year}-${pad(month)}-${pad(day)}`
}

/** Removes the first match of `re` from `state.rest` and returns it. */
function take(state: { rest: string }, re: RegExp): RegExpMatchArray | null {
  const m = state.rest.match(re)
  if (!m || m.index === undefined) return null
  state.rest = `${state.rest.slice(0, m.index)} ${state.rest.slice(m.index + m[0].length)}`
  return m
}

/** Reads one command. Null when nothing is left to call it (an empty title). */
export function parseCommand(text: string, opts: ParseOptions): ParsedCommand | null {
  const { today } = opts
  const cohosts = opts.cohosts ?? DEFAULT_COHOSTS
  const state = { rest: ` ${text.trim()} ` }
  if (!text.trim()) return null

  // Kind: an explicit "as <kind>" first, else a leading word.
  let kind: CommandKind = 'pencil'
  let kindSaid = false
  const explicit = take(state, /\bas\s+(?:an?\s+)?(to-?do|task|reminder|block|unavailable|private|pencil|hold)\b/i)
  if (explicit) {
    kind = KIND_BY_WORD[explicit[1].toLowerCase()]
    kindSaid = true
  } else {
    const lead = state.rest.match(/^\s*(to-?do|task|remind me to|remind|block|unavailable|private|pencil(?:\s+it)?(?:\s+in)?|closed|off|meeting|sync|call)\b/i)
    if (lead) {
      const word = lead[1].toLowerCase().split(/\s+/)[0]
      kind = KIND_BY_WORD[word]
      kindSaid = true
      if (!KEEP_IN_TITLE.has(word)) state.rest = ` ${state.rest.slice(lead[0].length)}`
    }
  }

  // Co-host: "with Ocean House".
  let cohost: ParsedCommand['cohost'] = null
  const aliasList = cohosts
    .flatMap((c) => c.aliases.map((a) => ({ alias: a, c })))
    .sort((a, b) => b.alias.length - a.alias.length)
  if (aliasList.length) {
    const re = new RegExp(`\\bwith\\s+(${aliasList.map((a) => escapeRe(a.alias).replace(/'/g, "['’]")).join('|')})(?![\\w])`, 'i')
    const m = take(state, re)
    if (m) {
      const spoken = m[1].toLowerCase().replace(/’/g, "'")
      const hit = aliasList.find((a) => a.alias === spoken) ?? aliasList.find((a) => spoken.startsWith(a.alias))
      if (hit) cohost = { id: hit.c.id, name: hit.c.name }
    }
  }

  // Length: "for 30 min", "for 1.5 hours".
  let durMin = 60
  let lengthSaid = false
  const lenRe = /\bfor\s+(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m)\b/i
  const lm = state.rest.match(lenRe)
  if (lm) {
    const minutes = Math.round(Number(lm[1]) * (/^m/i.test(lm[2]) ? 1 : 60))
    if (minutes >= 1 && minutes <= 1440) {
      take(state, lenRe)
      durMin = minutes
      lengthSaid = true
    }
  }

  // Time: "7pm", "10:30 am", "19:30". "at" goes with it when it sits right before.
  let startMin: number | null = null
  const ampm = state.rest.match(/(?:\bat\s+)?\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i)
  if (ampm) {
    const h = Number(ampm[1])
    const min = ampm[2] ? Number(ampm[2]) : 0
    if (h >= 1 && h <= 12 && min < 60) {
      take(state, /(?:\bat\s+)?\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/i)
      startMin = ((h % 12) + (/pm/i.test(ampm[3]) ? 12 : 0)) * 60 + min
    }
  } else {
    const h24 = state.rest.match(/(?:\bat\s+)?\b([01]?\d|2[0-3]):([0-5]\d)\b/)
    if (h24) {
      take(state, /(?:\bat\s+)?\b(?:[01]?\d|2[0-3]):[0-5]\d\b/)
      startMin = Number(h24[1]) * 60 + Number(h24[2])
    }
  }

  // Day: today / tomorrow, a whole-word weekday, a month and day, or an ISO day.
  let date: string | null = null
  let dateSaid = false
  const onP = String.raw`(?:\bon\s+)?`
  if (take(state, new RegExp(`${onP}\\b(?:today|tonight)\\b${NOT_POSSESSIVE}`, 'i'))) {
    date = today
    dateSaid = true
  } else if (take(state, new RegExp(`${onP}\\btomorrow\\b${NOT_POSSESSIVE}`, 'i'))) {
    date = addDays(today, 1)
    dateSaid = true
  } else {
    const wdRe = new RegExp(
      `${onP}\\b(?:(next|this)\\s+)?(${Object.keys(WEEKDAYS).sort((a, b) => b.length - a.length).join('|')})\\b${NOT_POSSESSIVE}`,
      'i',
    )
    const wm = take(state, wdRe)
    if (wm) {
      let d = (WEEKDAYS[wm[2].toLowerCase()] - dayOfWeek(today) + 7) % 7 || 7
      if (wm[1]?.toLowerCase() === 'next') d += 7
      date = addDays(today, d)
      dateSaid = true
    } else {
      const mdRe = new RegExp(
        `${onP}\\b(${Object.keys(MONTHS).sort((a, b) => b.length - a.length).join('|')})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`,
        'i',
      )
      const mm = state.rest.match(mdRe)
      if (mm) {
        const month = MONTHS[mm[1].toLowerCase()]
        const day = Number(mm[2])
        const year = Number(today.slice(0, 4))
        let found = validDay(year, month, day)
        if (found && found < today) found = validDay(year + 1, month, day)
        if (found) {
          take(state, mdRe)
          date = found
          dateSaid = true
        }
      } else {
        const iso = state.rest.match(/\b(\d{4})-(\d{2})-(\d{2})\b/)
        const found = iso ? validDay(Number(iso[1]), Number(iso[2]), Number(iso[3])) : null
        if (found) {
          take(state, /\b\d{4}-\d{2}-\d{2}\b/)
          date = found
          dateSaid = true
        }
      }
    }
  }
  if (!date && kind !== 'todo') date = today

  // Title: what is left.
  let title = state.rest
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[\s,;:.\-]+|[\s,;:.\-]+$/g, '')
    .trim()
  if (!title) return null
  title = title[0].toUpperCase() + title.slice(1)

  const dateLabel = date ? dayLabel(date) : 'No date, goes to inbox'
  const timeLabel = startMin == null ? '' : clockLabel(startMin)
  const rowMeta = date ? (timeLabel ? `${dateLabel}, ${timeLabel}` : dateLabel) : dateLabel
  const kindWord = KIND_WORD[kind]
  const understood: UnderstoodPart[] = [
    { label: 'Kind', value: kindWord, said: kindSaid },
    { label: 'Title', value: title, said: true },
    { label: 'Day', value: date ? dateLabel : 'No day yet', said: dateSaid },
  ]
  if (startMin != null) understood.push({ label: 'Time', value: timeLabel, said: true })
  understood.push({ label: 'Length', value: lengthLabel(durMin), said: lengthSaid })
  if (cohost) understood.push({ label: 'Co-host', value: cohost.name, said: true })

  return {
    kind,
    kindWord,
    title,
    date,
    startMin,
    durMin,
    cohost,
    timeZone: resolveZone(opts.timeZone),
    rowLabel: `Add ${kindWord.toLowerCase()}: ${title}`,
    rowMeta,
    summary: `${kindWord}: ${title}, ${rowMeta}${cohost ? `, with ${cohost.name}` : ''}`,
    understood,
  }
}

/** Reads one command at an instant: today is the day it is in the Space time zone right now. */
export function parseCommandAt(
  text: string,
  now: Date,
  timeZone: string,
  cohosts?: readonly CohostOption[],
): ParsedCommand | null {
  return parseCommand(text, { today: dayInZone(now, timeZone), timeZone, cohosts })
}
