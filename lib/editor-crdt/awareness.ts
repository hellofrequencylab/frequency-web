// EPHEMERAL PRESENCE — E0 task 18. Cursors and who-is-here travel over the Realtime channel and
// are NEVER persisted: a cursor that reaches the database is a bug. This module is the one place
// that shapes an awareness payload, so the shape is bounded and carries no document content.
// Editor only.

const MAX_NAME = 40
const COLOR_RE = /^#[0-9a-f]{6}$/i

interface PresenceState {
  userId: string
  name: string
  color: string
  /** nid of the node this person has selected, or null. A node id, never content. */
  selectedNid: string | null
}

/** Clamp an untrusted peer payload to a PresenceState, or null when it is unusable. */
export function readPresence(raw: unknown): PresenceState | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (typeof r.userId !== 'string' || !r.userId) return null
  const name = typeof r.name === 'string' ? r.name.slice(0, MAX_NAME) : ''
  const color = typeof r.color === 'string' && COLOR_RE.test(r.color) ? r.color : 'currentColor'
  const selectedNid = typeof r.selectedNid === 'string' && /^n[0-9a-z]{6,12}$/i.test(r.selectedNid) ? r.selectedNid : null
  return { userId: r.userId, name, color, selectedNid }
}
