// MEETING NOTES TO TO-DOS (LIVE-2533). After a meeting, Vera reads its notes and proposes the to-dos
// in them, each with who it is for and when it is due when the notes say so. A proposal only
// (ADR-1386): the drawer lists them, a person unticks any that are wrong, changes the owner
// or the day, and Accept writes the rest. Nothing is written by reading.
//
// Heuristic on purpose, the way people actually write meeting notes:
//   "- [ ] Dana: book the room by Friday"      a checkbox line, an owner, a due day
//   "Action: Sam to send the flyer by Dec 3"   an action marker, "<name> to <verb>"
//   "@Lee will email the venue tomorrow"       a mention, "<name> will <verb>"
//   "TODO confirm the caterer next week"       a marker, no owner
// A ticked box ("- [x]") is already done and is skipped. A line that names a known person at the
// start and says "to" or "will" is an action even with no marker. Anything else is discussion and
// stays in the notes. Pure: no React, no Supabase. Titles go through the house voice module.

import { voiceLine } from '@/lib/ai/voice'

export interface NotesPerson {
  id: string
  name: string
}

export interface TodoProposal {
  title: string
  assigneeProfileId: string | null
  assigneeName: string | null
  /** YYYY-MM-DD, or null when the notes give no day. */
  dueDay: string | null
  /** The line it came from, so the person can see why. */
  source: string
}

const MAX_TODOS = 20
const DAY_MS = 86_400_000
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

const MARKER = /^(?:[-*•]\s*)?(?:\[\s?\]\s*|(?:todo|to-do|to do|action(?: item)?|ai|next steps?|follow[- ]?up)\s*[:\-–]?\s+)/i
const DONE = /^(?:[-*•]\s*)?\[[xX✓]\]/
const BULLET = /^(?:[-*•]|\d+[.)])\s+/

function dayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

function dayMs(key: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key)
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null
}

/** The due day a phrase names, read from the meeting's own day, and the phrase itself. */
export function readDuePhrase(text: string, meetingDay: string): { dueDay: string; phrase: string } | null {
  const base = dayMs(meetingDay)
  if (base === null) return null
  const iso = /\b(?:by|due|on|before)\s+(\d{4}-\d{2}-\d{2})\b/i.exec(text)
  if (iso && dayMs(iso[1]) !== null) return { dueDay: iso[1], phrase: iso[0] }

  const rel = /\b(?:by\s+|due\s+)?(tomorrow|next week|end of (?:the )?week|eow)\b/i.exec(text)
  if (rel) {
    const w = rel[1].toLowerCase()
    if (w === 'tomorrow') return { dueDay: dayKey(base + DAY_MS), phrase: rel[0] }
    if (w === 'next week') return { dueDay: dayKey(base + 7 * DAY_MS), phrase: rel[0] }
    // End of the week: the coming Friday (or a week on, from a Friday or later).
    const today = new Date(base).getUTCDay()
    const ahead = (5 - today + 7) % 7 || 7
    return { dueDay: dayKey(base + ahead * DAY_MS), phrase: rel[0] }
  }

  const wd = /\b(?:by|due|on|before|this|next)\s+(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)[a-z]*\b/i.exec(text)
  if (wd) {
    const target = WEEKDAYS.findIndex((d) => d.startsWith(wd[1].toLowerCase().slice(0, 3)))
    const today = new Date(base).getUTCDay()
    let ahead = (target - today + 7) % 7 || 7
    if (/^next\b/i.test(wd[0]) && ahead < 7) ahead += 7
    return { dueDay: dayKey(base + ahead * DAY_MS), phrase: wd[0] }
  }

  const md = /\b(?:by|due|on|before)\s+([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b/i.exec(text)
  if (md) {
    const month = MONTHS.indexOf(md[1].toLowerCase().slice(0, 3))
    if (month >= 0) {
      const year = new Date(base).getUTCFullYear()
      let at = Date.UTC(year, month, Number(md[2]))
      if (at < base) at = Date.UTC(year + 1, month, Number(md[2]))
      if (new Date(at).getUTCDate() === Number(md[2])) return { dueDay: dayKey(at), phrase: md[0] }
    }
  }

  const slash = /\b(?:by|due|on|before)\s+(\d{1,2})\/(\d{1,2})\b/i.exec(text)
  if (slash) {
    const year = new Date(base).getUTCFullYear()
    const [m, d] = [Number(slash[1]) - 1, Number(slash[2])]
    let at = Date.UTC(year, m, d)
    if (at < base) at = Date.UTC(year + 1, m, d)
    if (m >= 0 && m < 12 && new Date(at).getUTCDate() === d) return { dueDay: dayKey(at), phrase: slash[0] }
  }
  return null
}

/** The person a line starts with ("Dana:", "@Dana", "Dana to", "Dana will"), matched on a whole first
 *  name or full name, case-insensitive. */
function leadingPerson(text: string, people: readonly NotesPerson[]): { person: NotesPerson; rest: string; strong: boolean } | null {
  for (const p of people) {
    const full = p.name.trim()
    const first = full.split(/\s+/)[0]
    for (const n of full === first ? [full] : [full, first]) {
      if (!n) continue
      const esc = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const m = new RegExp(`^@?${esc}\\b\\s*(:|-|–|\\bto\\b|\\bwill\\b|\\bcan\\b|\\bshould\\b)?\\s*`, 'i').exec(text)
      if (m && (m[1] || text.startsWith('@'))) return { person: p, rest: text.slice(m[0].length), strong: true }
    }
  }
  const mention = /@([a-z][\w.-]*)/i.exec(text)
  if (mention) {
    const p = people.find((x) => x.name.split(/\s+/)[0].toLowerCase() === mention[1].toLowerCase())
    if (p) return { person: p, rest: text.replace(mention[0], '').replace(/\s{2,}/g, ' ').trim(), strong: false }
  }
  return null
}

function tidyTitle(raw: string): string {
  const t = raw
    .replace(/^\s*(?:to|will|can|should)\s+/i, '')
    .replace(/\s+[,.;:]+\s*$/, '')
    .replace(/[.;:,]+$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
  return t ? voiceLine(t.charAt(0).toUpperCase() + t.slice(1)).slice(0, 200) : ''
}

/**
 * The to-dos the notes ask for, in the order they appear, at most twenty. `people` is who can take
 * one (the Space's team); `meetingDay` is the day the meeting ran, which "by Friday" counts from.
 */
export function notesToTodos(notes: string, opts: { people: readonly NotesPerson[]; meetingDay: string }): TodoProposal[] {
  const out: TodoProposal[] = []
  const seen = new Set<string>()
  for (const rawLine of String(notes ?? '').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || DONE.test(line)) continue
    const marked = MARKER.test(line)
    let body = marked ? line.replace(MARKER, '') : line.replace(BULLET, '')
    const who = leadingPerson(body, opts.people)
    // No marker and no owner up front: discussion, not an action.
    if (!marked && !(who && who.strong)) continue
    if (who) body = who.rest
    const due = readDuePhrase(body, opts.meetingDay)
    if (due) body = body.replace(due.phrase, ' ')
    const title = tidyTitle(body)
    if (!title || title.length < 3) continue
    const key = `${title.toLowerCase()}|${who?.person.id ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({
      title,
      assigneeProfileId: who?.person.id ?? null,
      assigneeName: who?.person.name ?? null,
      dueDay: due?.dueDay ?? null,
      source: line.slice(0, 300),
    })
    if (out.length === MAX_TODOS) break
  }
  return out
}
