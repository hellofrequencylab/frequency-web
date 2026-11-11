// EPHEMERAL PRESENCE — E0 task 18. Cursors and who-is-here travel over the Realtime channel and
// are NEVER persisted: a cursor that reaches the database is a bug. This module is the one place
// that shapes an awareness payload, so the shape is bounded and carries no document content.
// Editor only.

const MAX_NAME = 40
const COLOR_RE = /^#[0-9a-f]{6}$/i

export interface PresenceState {
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

const toHex = (n: number) => Math.round(n * 255).toString(16).padStart(2, '0')

/** A stable marker colour for a person: a hue hashed from their id, as the #rrggbb the payload carries. */
export function presenceColor(userId: string): string {
  let h = 0
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) >>> 0
  const hue = (h % 360) / 60
  const s = 0.65, l = 0.45
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs((hue % 2) - 1))
  const m = l - c / 2
  const [r, g, b] = hue < 1 ? [c, x, 0] : hue < 2 ? [x, c, 0] : hue < 3 ? [0, c, x] : hue < 4 ? [0, x, c] : hue < 5 ? [x, 0, c] : [c, 0, x]
  return `#${toHex(r + m)}${toHex(g + m)}${toHex(b + m)}`
}

/** This tab's own presence from the signed-in user: the id, a display name (never the email) and a colour. */
export function presenceSelf(user: { id?: unknown; user_metadata?: unknown } | null | undefined): PresenceState | null {
  const id = typeof user?.id === 'string' ? user.id : ''
  if (!id) return null
  const meta = (user?.user_metadata && typeof user.user_metadata === 'object' ? user.user_metadata : {}) as Record<string, unknown>
  const raw = [meta.display_name, meta.full_name, meta.name].find((v) => typeof v === 'string' && v.trim())
  return readPresence({ userId: id, name: typeof raw === 'string' ? raw.trim() : '', color: presenceColor(id), selectedNid: null })
}

/** A peer not heard from for this long is gone (a closed tab sends no goodbye). Heartbeats are well inside it. */
export const PRESENCE_TTL_MS = 20_000
export const PRESENCE_BEAT_MS = 6_000
const MAX_PEERS = 50

/** Who is in the room right now. Pure: the clock is passed in, nothing here touches the document. */
export function createPeerBook() {
  const seen = new Map<string, { state: PresenceState; at: number }>()
  const list = () => [...seen.values()].map((v) => v.state).sort((a, b) => a.userId.localeCompare(b.userId))
  return {
    /** Take a peer's state. Returns true when the visible list changed. */
    hear(raw: unknown, now: number, selfId: string): boolean {
      const st = readPresence(raw)
      if (!st || st.userId === selfId) return false
      const before = seen.get(st.userId)
      if (!before && seen.size >= MAX_PEERS) return false
      seen.set(st.userId, { state: st, at: now })
      return !before || JSON.stringify(before.state) !== JSON.stringify(st)
    },
    leave(userId: string): boolean {
      return seen.delete(userId)
    },
    /** Drop peers past the TTL. Returns true when anyone was dropped. */
    prune(now: number): boolean {
      let dropped = false
      for (const [id, v] of seen) {
        if (now - v.at < PRESENCE_TTL_MS) continue
        seen.delete(id)
        dropped = true
      }
      return dropped
    },
    list,
  }
}
