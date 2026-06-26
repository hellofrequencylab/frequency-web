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

// Text-only export markers (no file): the body IS the marker, so there is nothing to
// classify, but we keep the row so counts stay honest. Matched case-insensitively
// against the trimmed body. (The media-INCLUDED markers, which carry a real filename,
// are handled by analyzeAttachment below so we can recover the filename + any caption.)
const OMITTED_PATTERNS: RegExp[] = [
  /^<media omitted>$/i,
  /^(image|video|audio|sticker|gif|document|contact card) omitted$/i,
]

// Media-INCLUDED attachment markers, which name the file. iOS brackets it
// (`<attached: 00000045-PHOTO-….jpg>`); Android suffixes it (`IMG-….jpg (file attached)`).
const IOS_ATTACHED = /<attached:\s*([^>]+?)>/i
const ANDROID_ATTACHED = /\b([A-Za-z0-9][A-Za-z0-9._-]*\.[A-Za-z0-9]{2,5})\s*\(file attached\)/i

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

interface Attachment {
  /** The attached file's name when a media-included marker is present; null otherwise. */
  name: string | null
  /** The body with the attachment marker removed (the caption that rode with the photo). */
  caption: string
  /** True when the message carries an attachment AND no caption text remains. */
  attachmentOnly: boolean
}

/** Pull an attachment filename + caption out of a message body. Handles the
 *  media-included markers (with a real filename) and the text-only "… omitted"
 *  markers (no file). A photo posted with a caption keeps its caption as the body so
 *  it still classifies; a bare photo is `attachmentOnly` and associated by adjacency. */
function analyzeAttachment(body: string): Attachment {
  const trimmed = body.trim()

  const ios = IOS_ATTACHED.exec(trimmed)
  const android = ios ? null : ANDROID_ATTACHED.exec(trimmed)
  const match = ios ?? android
  if (match) {
    const caption = trimmed.replace(match[0], '').trim()
    return { name: match[1].trim(), caption, attachmentOnly: caption.length === 0 }
  }

  if (OMITTED_PATTERNS.some((re) => re.test(trimmed))) {
    return { name: null, caption: '', attachmentOnly: true }
  }

  return { name: null, caption: trimmed, attachmentOnly: false }
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
        attachmentName: null,
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
      attachmentOnly: false,
      attachmentName: null,
    })
  }

  // Continuations were folded above; now resolve each non-system body ONCE: pull out an
  // attachment filename + caption, keep the caption as the text, and flag a bare photo.
  for (const m of messages) {
    if (m.system) continue
    const att = analyzeAttachment(m.text)
    m.text = att.name !== null ? att.caption : m.text.trim()
    m.attachmentName = att.name
    m.attachmentOnly = att.attachmentOnly
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
