// EMAIL-082 (owner decision, 2026-11-19): the imported contact list is Daniel Tyack's personal email list. Those
// people know him, not the Frequency brand, so the `imported_contacts` audience only ever receives mail sent as
// him. Brand campaigns (`all_contacts`) skip an imported contact until they opt in (lib/studio/campaigns.ts).
// Pure, so schedule and send share one rule and it is unit-tested.

/** The audience that is Daniel's personal list. */
export const PERSONAL_LIST_SEGMENT = 'imported_contacts'

/** The only From name mail to the personal list may carry. */
export const PERSONAL_LIST_SENDER = 'Daniel Tyack'

/** What the composer says when the From name does not match. */
export const PERSONAL_LIST_SENDER_ERROR = `This list is ${PERSONAL_LIST_SENDER}'s personal list, so it only gets email sent as him. Set the From name to "${PERSONAL_LIST_SENDER}" and try again.`

/** Null when this send is allowed; the refusal copy when a personal-list send is not from Daniel. */
export function personalListSenderError(segment: string | null | undefined, fromName: string | null | undefined): string | null {
  if (segment !== PERSONAL_LIST_SEGMENT) return null
  const name = (fromName ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
  return name === PERSONAL_LIST_SENDER.toLowerCase() ? null : PERSONAL_LIST_SENDER_ERROR
}
