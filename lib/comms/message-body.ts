// Present a message body for the CHAT view. Email carries chrome the conversation UI should not: our own
// List-Unsubscribe / manage-emails footer, and the quoted history a mail client staples under a reply
// ("On <date> <name> wrote: > ..."). We strip that at DISPLAY time only — the raw body stays stored for the
// audit trail and is what actually went out in the email. PURE + unit-tested; fail-safe to the trimmed input.

const QUOTE_MARKERS: RegExp[] = [
  // Gmail / Apple Mail attribution line: "On Fri, Jul 24, 2026 at 9:30 PM Daniel <d@x> wrote:"
  /\n\s*>?\s*On .{0,200}?\bwrote:\s*\n/i,
  // Outlook / classic divider.
  /\n\s*-{2,}\s*Original Message\s*-{2,}\s*\n/i,
  // Outlook "From: ... Sent: ..." header block.
  /\n\s*From:.*\n\s*Sent:.*\n/i,
  // A long underscore rule some clients insert above the quote.
  /\n_{5,}\s*\n/,
]

/** Strip our email footer + any quoted reply history from a body, for chat display. */
export function cleanConversationBody(raw: string | null | undefined): string {
  if (!raw) return ''
  let text = raw.replace(/\r\n/g, '\n')

  // 1) Cut quoted reply history at the earliest marker.
  let cut = text.length
  for (const re of QUOTE_MARKERS) {
    const m = text.match(re)
    if (m && m.index !== undefined && m.index < cut) cut = m.index
  }
  if (cut < text.length) text = text.slice(0, cut)

  // 2) Strip our own footer: a signature separator ("--" / "---") whose tail carries an unsubscribe /
  //    manage-emails link. Cut from the separator, keeping the human sign-off above it.
  const sep = text.search(/\n-{2,}\s*\n/)
  if (sep !== -1 && /\/unsubscribe\?|\/manage-emails\?|^\s*(unsubscribe|manage emails)\s*:/im.test(text.slice(sep))) {
    text = text.slice(0, sep)
  }

  // 3) Belt-and-suspenders: drop any stray footer link lines that survived (no separator present).
  text = text
    .split('\n')
    .filter(
      (l) =>
        !/https?:\/\/\S*\/(unsubscribe|manage-emails)\?/i.test(l) &&
        !/^\s*(unsubscribe|manage emails)\s*:/i.test(l),
    )
    .join('\n')

  // 4) Collapse the blank lines the cuts leave behind, and trim.
  const cleaned = text.replace(/\n{3,}/g, '\n\n').trim()
  // Never blank a real message: if stripping ate everything, fall back to the trimmed original.
  return cleaned || raw.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}
