// THE OPERATOR QUESTIONS VERA CAN ANSWER WITH LIVE NUMBERS (LIVE-2190, Vera assistants plan phase V4, the Admin
// Assistant). A closed list: the model names one of these ids and the server runs a fixed, read-only query for it
// (lib/ai/vera/admin-lookups.ts). There is no free-form query, so she can never read a table the list does not
// name, and she never invents a number: an unknown id is refused and she points at the admin page instead.
// Pure and client-safe: ids and words only.

export const ADMIN_QUESTIONS = {
  spaces_without_site: 'Live Spaces whose website is not published yet (names and links, newest first).',
  new_spaces_week: 'Spaces created in the last 7 days (names and links).',
  new_members_week: 'How many people joined in the last 7 days.',
  open_reports: 'How many moderation reports are waiting for review, and where to review them.',
  open_support: 'How many support tickets are open, and the oldest few.',
} as const

/** Whether this is a question on the list (own keys only, so an inherited name like toString never matches). */
export function isAdminQuestion(id: unknown): id is keyof typeof ADMIN_QUESTIONS {
  return typeof id === 'string' && Object.hasOwn(ADMIN_QUESTIONS, id)
}

/** The list as the tool's description reads it. */
export function adminQuestionList(): string {
  return Object.entries(ADMIN_QUESTIONS)
    .map(([id, what]) => `${id} (${what})`)
    .join('; ')
}
