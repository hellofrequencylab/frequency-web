// REALTIME CHANNEL SHAPE — E0 task 18. The pure half of the editor's transport: the private
// Broadcast topic name and the envelope a Yjs update travels in. No client, no network, so the
// server-side authorization (a `realtime.messages` policy keyed on this exact topic) and the
// browser provider both import one definition. Editor only: no visitor bundle may import this.
//
// An update from a peer is UNTRUSTED. `decodeUpdate` bounds it (size, shape, encoding) and returns
// null instead of throwing; the caller then drops it and, if the doc drifts, asks for a resync.

import type { EntityKind } from '../entity-blocks/registry'

/** Hard cap on one update, in bytes after decoding. A full large page doc is well under this. */
export const MAX_UPDATE_BYTES = 256 * 1024

const ENVELOPE_VERSION = 1
const KINDS: readonly EntityKind[] = ['member', 'space', 'email', 'site']
const ID_RE = /^[0-9a-f-]{8,64}$/i
const B64_RE = /^[A-Za-z0-9+/]*={0,2}$/

/** The private Broadcast topic for one entity's editing session: `editor:<kind>:<id>`. */
export function editorTopic(kind: EntityKind, entityId: string): string | null {
  if (!KINDS.includes(kind) || !ID_RE.test(entityId)) return null
  return `editor:${kind}:${entityId.toLowerCase()}`
}

/** Split a topic back into its parts, or null when it is not an editor topic. */
export function parseEditorTopic(topic: string): { kind: EntityKind; entityId: string } | null {
  const m = /^editor:([a-z]+):([0-9a-f-]{8,64})$/.exec(topic)
  if (!m) return null
  const kind = m[1] as EntityKind
  return KINDS.includes(kind) ? { kind, entityId: m[2] } : null
}

interface UpdateEnvelope {
  v: number
  /** base64 of the Yjs update bytes. */
  u: string
}

function toBase64(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

/** Wrap update bytes for Broadcast. Returns null when the update is over the cap. */
export function encodeUpdate(update: Uint8Array): UpdateEnvelope | null {
  if (update.byteLength === 0 || update.byteLength > MAX_UPDATE_BYTES) return null
  return { v: ENVELOPE_VERSION, u: toBase64(update) }
}

/** Unwrap an untrusted payload to update bytes, or null when it is unusable or oversize. */
export function decodeUpdate(raw: unknown): Uint8Array | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (r.v !== ENVELOPE_VERSION || typeof r.u !== 'string') return null
  // Reject on the encoded length first so a huge string is never decoded.
  if (r.u.length > Math.ceil((MAX_UPDATE_BYTES * 4) / 3) + 4 || !B64_RE.test(r.u)) return null
  try {
    const bin = atob(r.u)
    if (bin.length === 0 || bin.length > MAX_UPDATE_BYTES) return null
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return out
  } catch {
    return null
  }
}
