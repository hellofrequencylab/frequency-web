// HIDING THE FINISH SETUP REMINDER (LIVE-1915), the pure half. Someone who does not want the standing "Finish setup"
// button can hide it, and hiding takes two deliberate steps: the first asks (and the server stamps the time), the
// second confirms inside ten minutes. The choice lives on the person's own profile meta under one key each, merged
// (never a whole-object rewrite), and is undone from Settings. Hiding removes the reminder and nothing else: nothing
// they built goes away. PURE and client-safe.

export const SETUP_HIDDEN_KEY = 'launch_setup_hidden'
export const SETUP_HIDE_ASKED_KEY = 'launch_setup_hide_asked_at'
const CONFIRM_WINDOW_MS = 10 * 60 * 1000

const asRecord = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})

/** True when the person has hidden the Finish setup reminder. */
export function readSetupHidden(meta: unknown): boolean {
  return asRecord(meta)[SETUP_HIDDEN_KEY] === true
}

/** True when a first "hide it" step was taken in the last ten minutes, so the second can confirm. */
export function hideAskIsFresh(meta: unknown, now: Date): boolean {
  const raw = asRecord(meta)[SETUP_HIDE_ASKED_KEY]
  const at = typeof raw === 'string' ? Date.parse(raw) : NaN
  if (!Number.isFinite(at)) return false
  const age = now.getTime() - at
  return age >= 0 && age <= CONFIRM_WINDOW_MS
}
