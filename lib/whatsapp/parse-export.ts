// Pure parser for a WhatsApp "Export chat" .txt — the ToS-safe way to get a group's
// history out (group info > Export chat). No network, no automation against WhatsApp,
// so neither the admin's number nor a throwaway is ever at risk. The export's line
// shape differs by OS and locale; this turns either into a flat list of messages the
// classifier can read. Deliberately defensive: it never throws, and anything it can't
// place becomes a continuation of the previous line rather than lost text.
//
// iOS:      [2024-01-15, 10:23:45 PM] Sara Lee: Looking for a room
// Android:  1/15/24, 10:23 PM - Sara Lee: Looking for a room
// System lines have no "Name: " (the encryption notice, "X added Y", subject changes).
// Attachment-only bodies ("image omitted", "<Media omitted>") are flagged, not dropped.

import type { ExportFormat, ParsedExport, WhatsAppMessage } from './types'

// WhatsApp sprinkles a left-to-right mark (U+200E) and a narrow no-break space
// (U+202F, before AM/PM on iOS) through exports. Strip the LRM; keep text otherwise.
const LRM = /‎/g
const NBSP_THIN = '[\\s\\u202f\\u00a0]'

// A date like 1/15/24, 15/01/2024, or 2024-01-15 (separators / . or -).
const DATE = '\\d{1,4}[\\/.\\-]\\d{1,2}[\\/.\\-]\\d{1,4}'
// A time like 10:23, 10:23:45, 22:23, or 10:23:45 PM (optional seconds + meridiem).
const TIME = `\\d{1,2}:\\d{2}(?::\\d{2})?(?:${NBSP_THIN}?[APap][. ]?[Mm][.]?)?`

// iOS: the whole timestamp is bracketed, then "Author: body" (or a system body).
const IOS_PREFIX = new RegExp(`^\\[(${DATE}),?${NBSP_THIN}+(${TIME})\\]${NBSP_THIN}*(.*)$`)
// Android: "date, time - Author: body" (or "date, time - system body").
const ANDROID_PREFIX = new RegExp(`^(${DATE}),?${NBSP_THIN}+(${TIME})${NBSP_THIN}*-${NBSP_THIN}(.*)$`)

// Attachment markers, both OSes. A body equal to (or, for iOS, ending with) one of
// these is attachment-only — there is no text to classify, but we keep the row so
// counts stay honest. Matched case-insensitively against the trimmed body.
const ATTACHMENT_PATTERNS: RegExp[] = [
  /^<media omitted>$/i,
  /(image|video|audio|sticker|gif|document|contact card) omitted$/i,
  /\(file attached\)$/i,
  /^<attached:.*>$/i,
]

// Common system notices that DO contain a colon (so the "no Name:" rule alone would
// misread them as a message). Keep this list short and high-signal; the AI classifier
// and the operator review catch anything that slips through as `other`.
const SYSTEM_WITH_COLON: RegExp[] = [
  /changed the (subject|group name) to/i,
  /changed the group description/i,
  /changed this group's icon/i,
  /pinned a message/i,
  /changed the group settings/i,
]

interface Prefix {
  date: string
  time: string
  rest: string
  format: Exclude<ExportFormat, 'unknown'>
}

/** Match a line's message prefix (iOS first, then Android). Null ⇒ a continuation. */
function matchPrefix(line: string): Prefix | null {
  const ios = IOS_PREFIX.exec(line)
  if (ios) return { date: ios[1], time: ios[2], rest: ios[3], format: 'ios' }
  const android = ANDROID_PREFIX.exec(line)
  if (android) return { date: android[1], time: android[2], rest: android[3], format: 'android' }
  return null
}

/** Split "Author: body" on the FIRST ": ". Returns null when there is no author
 *  colon (a system line) or when the body reads as a known colon-bearing notice. */
function splitAuthor(rest: string): { author: string; body: string } | null {
  const idx = rest.indexOf(': ')
  if (idx < 0) return null
  const author = rest.slice(0, idx).trim()
  // A real sender name is short and single-line; a long "author" is almost always a
  // system sentence that happens to contain a colon. Guard both ways.
  if (!author || author.length > 60) return null
  if (SYSTEM_WITH_COLON.some((re) => re.test(rest))) return null
  return { author, body: rest.slice(idx + 2) }
}

function isAttachmentOnly(body: string): boolean {
  const t = body.trim()
  return t.length > 0 && ATTACHMENT_PATTERNS.some((re) => re.test(t))
}

// Month/day order is locale-dependent and unknowable from the file alone, so this is
// best-effort and only feeds display/sorting — the AI re-derives event dates from the
// message TEXT. Returns '' when the parts don't form a sane date.
function toIso(date: string, time: string): string {
  const dparts = date.split(/[\/.\-]/).map((n) => parseInt(n, 10))
  if (dparts.length !== 3 || dparts.some((n) => Number.isNaN(n))) return ''
  const [a, b, c] = dparts
  let year: number, month: number, day: number
  if (a > 31) {
    // YYYY-MM-DD
    year = a; month = b; day = c
  } else {
    // D/M/Y or M/D/Y: disambiguate by which value exceeds 12; default to month-first.
    if (a > 12) { day = a; month = b } else { month = a; day = b }
    year = c < 100 ? 2000 + c : c
  }
  const m = /(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(time)
  if (!m || month < 1 || month > 12 || day < 1 || day > 31) return ''
  let hour = parseInt(m[1], 10)
  const min = parseInt(m[2], 10)
  const sec = m[3] ? parseInt(m[3], 10) : 0
  if (/p/i.test(time) && hour < 12) hour += 12
  if (/a/i.test(time) && hour === 12) hour = 0
  const d = new Date(year, month - 1, day, hour, min, sec)
  return Number.isNaN(d.getTime()) ? '' : d.toISOString()
}

/**
 * Parse a WhatsApp export into a flat message list. Lines that match a timestamp
 * prefix start a new message; everything else is appended to the message above it
 * (so multi-line posts stay whole). System and attachment-only rows are kept and
 * flagged, never silently dropped, so the parse stats are trustworthy.
 */
export function parseWhatsAppExport(raw: string): ParsedExport {
  const text = (raw ?? '').replace(LRM, '').replace(/\r\n?/g, '\n')
  const lines = text.split('\n')
  const messages: WhatsAppMessage[] = []
  let iosHits = 0
  let androidHits = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const prefix = matchPrefix(line)

    if (!prefix) {
      // A continuation of the message above (or stray leading text we ignore).
      if (messages.length > 0 && line.length > 0) {
        const prev = messages[messages.length - 1]
        prev.text = prev.text ? `${prev.text}\n${line}` : line
      }
      continue
    }

    if (prefix.format === 'ios') iosHits++
    else androidHits++

    const split = splitAuthor(prefix.rest)
    const ref = i + 1
    const timestamp = toIso(prefix.date, prefix.time)
    const rawTimestamp = `${prefix.date}, ${prefix.time}`

    if (!split) {
      messages.push({
        ref,
        timestamp,
        rawTimestamp,
        author: '',
        text: prefix.rest.trim(),
        system: true,
        attachmentOnly: false,
      })
      continue
    }

    messages.push({
      ref,
      timestamp,
      rawTimestamp,
      author: split.author,
      text: split.body,
      system: false,
      attachmentOnly: isAttachmentOnly(split.body),
    })
  }

  // A trailing continuation pass already folded multi-line bodies; re-flag attachment
  // -only rows whose body grew (rare) and trim every body once at the end.
  for (const m of messages) {
    if (!m.system) {
      m.text = m.text.trim()
      m.attachmentOnly = isAttachmentOnly(m.text)
    }
  }

  const format: ExportFormat =
    iosHits === 0 && androidHits === 0 ? 'unknown' : iosHits >= androidHits ? 'ios' : 'android'

  const system = messages.filter((m) => m.system).length
  const attachmentOnly = messages.filter((m) => m.attachmentOnly).length
  return {
    messages,
    format,
    stats: {
      total: messages.length,
      system,
      attachmentOnly,
      authored: messages.length - system - attachmentOnly,
    },
  }
}

/** The messages worth sending to the classifier: authored, with real text, and not
 *  just an attachment marker. Short one-word replies ("thanks", "yes") are dropped to
 *  keep the AI batches cheap — a listing or an event is never one word. */
export function classifiableMessages(parsed: ParsedExport): WhatsAppMessage[] {
  return parsed.messages.filter(
    (m) => !m.system && !m.attachmentOnly && m.text.trim().length >= 12,
  )
}
