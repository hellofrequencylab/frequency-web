// QUOTED-REPLY SPLITTER — separate a reply's NEW content from the quoted trail a mail client staples
// underneath ("On <date> <name> wrote:" + "> ..." lines, Outlook dividers, gmail_quote divs). PURE and
// DOM-free: display-time only, so the stored body stays the audit trail. The workspace renders the
// visible part as the chat bubble and offers the quoted part behind a collapsed toggle.
//
// Sibling of lib/comms/message-body.ts (which DROPS the trail for snippets); this module KEEPS both halves.

export interface QuotedReplySplit {
  /** The new content of the message (may be empty when the message is quote-only). */
  visible: string
  /** The quoted/threaded trail, trimmed; null when the message carries no quoted history. */
  quoted: string | null
}

// Plain-text quote markers. Each match's index marks where the trail begins. Anchored to a line start
// via (^|\n) so mid-sentence words never cut a real message. NOTE: a bare "> " block is NOT a marker
// here — an interleaved bottom-poster ("Thanks!\n> can you make Friday?\nYes, Friday works") quotes
// mid-message and answers BELOW, so cutting at the first quote line would demote the answer into the
// collapsed trail. Bare blocks are handled by trailingQuoteIndex below: only a block that runs to the
// END of the message (modulo trailing whitespace / a "-- " signature) is a trail.
const TEXT_MARKERS: RegExp[] = [
  // Gmail / Apple Mail attribution: "On Sat, Jul 25, 2026 at 11:36 AM Daniel Tyack via Frequency <...> wrote:"
  // The window tolerates a wrapped (multi-line) attribution. Case-sensitive "On " avoids prose false-positives.
  /(^|\n)\s*>?\s*On [\s\S]{0,300}?\bwrote:\s*(\n|$)/,
  // Outlook / classic divider.
  /(^|\n)\s*-{2,}\s*Original Message\s*-{2,}\s*(\n|$)/i,
  // Outlook "From: ... Sent: ..." header block.
  /(^|\n)\s*From:.*\n\s*Sent:.*(\n|$)/,
  // A long underscore rule some clients insert above the quote.
  /(^|\n)_{5,}\s*(\n|$)/,
]

// HTML quote markers (a body_html string). Pragmatic string-level matching — no DOM.
const HTML_MARKERS: RegExp[] = [
  /<div[^>]*class="[^"]*\bgmail_quote(?:_container)?\b[^"]*"[^>]*>/i,
  /<blockquote[\s>]/i,
]

/** The earliest match index for any of the regexes; text.length when none match. */
function earliestIndex(text: string, markers: RegExp[]): number {
  let cut = text.length
  for (const re of markers) {
    const m = text.match(re)
    if (m && m.index !== undefined && m.index < cut) cut = m.index
  }
  return cut
}

/**
 * The start index of a TRAILING "> " quote block — one that runs (modulo trailing whitespace-only
 * lines and an RFC-3676 "-- " signature) to the END of the message; text.length when the message
 * does not end in a quote block. This is what keeps an interleaved bottom-posted answer visible:
 * a quote block with real content after it is part of the conversation, not a trail.
 */
function trailingQuoteIndex(text: string): number {
  const lines = text.split('\n')
  let end = lines.length - 1
  const skipBlanks = () => {
    while (end >= 0 && lines[end].trim() === '') end--
  }
  skipBlanks()
  // A short trailing signature block ("-- " delimiter, RFC 3676) below the quote still counts.
  for (let i = end; i >= 0 && i > end - 8; i--) {
    if (/^--\s*$/.test(lines[i])) {
      end = i - 1
      skipBlanks()
      break
    }
  }
  if (end < 0 || !lines[end].startsWith('>')) return text.length
  // Walk up through the quote block (blank lines inside the block are fine).
  let start = end
  while (start >= 0 && (lines[start].startsWith('>') || lines[start].trim() === '')) start--
  start++
  while (start < end && lines[start].trim() === '') start++
  // The character offset of lines[start].
  let idx = 0
  for (let i = 0; i < start; i++) idx += lines[i].length + 1
  return idx
}

/**
 * Split a message body into { visible, quoted }. Handles plain text (attribution lines, "> " blocks,
 * Outlook dividers) and HTML bodies (gmail_quote / blockquote sections). Fail-safe: an unmarked body
 * comes back whole with quoted = null.
 */
export function splitQuotedReply(raw: string | null | undefined): QuotedReplySplit {
  if (!raw) return { visible: '', quoted: null }
  const text = raw.replace(/\r\n/g, '\n')

  // An HTML body is split ONLY on HTML markers — a "\n>" inside markup is not a quote line.
  const looksHtml = /<[a-z][\s\S]*>/i.test(text) && HTML_MARKERS.some((re) => re.test(text))
  const cut = looksHtml
    ? earliestIndex(text, HTML_MARKERS)
    : Math.min(earliestIndex(text, TEXT_MARKERS), trailingQuoteIndex(text))

  if (cut >= text.length) return { visible: text.trim(), quoted: null }
  const quoted = text.slice(cut).trim()
  return { visible: text.slice(0, cut).trim(), quoted: quoted || null }
}
