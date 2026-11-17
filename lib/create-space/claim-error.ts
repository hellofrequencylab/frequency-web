// Why "Save with Google" came back to /create-a-space instead of going on to Google (LIVE-2331). The Google claim is a
// plain form action that ends in a redirect, so it cannot return a line the way the email claim does. It carries a
// short code in the address instead (?claim_error=<code>), and the builder turns the code into a line. Closed set:
// anything else in the address reads as the generic line, so nothing a visitor types into the URL is ever shown.

export const CLAIM_ERROR_PARAM = 'claim_error'

export type ClaimErrorCode = 'handle' | 'draft' | 'generic'

const LINES: Record<ClaimErrorCode, string> = {
  handle: 'That handle got taken while you were saving. Pick another one and try again.',
  draft: 'We could not hold on to your draft on the way to Google. Check your name and handle, then try again.',
  generic: 'Google sign-in did not start. Try again, or email yourself a link instead.',
}

/** Where a refused Google claim goes: back to the builder, with the reason. */
export function claimErrorHref(code: ClaimErrorCode): string {
  return `/create-a-space?${CLAIM_ERROR_PARAM}=${code}#get-started`
}

/** The line the builder shows for a ?claim_error= value, or null when there is none. */
export function claimErrorLine(raw: string | null | undefined): string | null {
  if (!raw) return null
  return Object.hasOwn(LINES, raw) ? LINES[raw as ClaimErrorCode] : LINES.generic
}
