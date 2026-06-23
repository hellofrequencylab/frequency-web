// Connection-edge provenance (ADR-372 · docs/CRM-OVERHAUL.md Phase 3). How a member-to-member
// connection was made, classified. Pairs with the friendships columns added in
// 20260729000000_connection_edge_provenance.sql. PURE + framework-independent (no Supabase/Next), so
// it is trivially unit-testable; the write paths (friend-actions, introductions) call resolve* to get
// the columns to stamp.

export type ConnectionEdgeType = 'met_at_event' | 'introduced_by' | 'shared_circle' | 'opt_in_connect'

export const CONNECTION_EDGE_TYPES: readonly ConnectionEdgeType[] = [
  'met_at_event',
  'introduced_by',
  'shared_circle',
  'opt_in_connect',
] as const

export function isConnectionEdgeType(v: unknown): v is ConnectionEdgeType {
  return typeof v === 'string' && (CONNECTION_EDGE_TYPES as readonly string[]).includes(v)
}

/** The context a connect affordance can pass: where the tap came from. All optional; the default is a
 *  plain opt-in connect. `introduced_by` is NOT set here, the introductions flow stamps that. */
export interface ConnectContext {
  edgeType?: string
  eventId?: string | null
  circleId?: string | null
}

/** The friendships provenance columns to stamp from a connect context. PURE + fail-honest: it never
 *  claims a provenance it does not have. A 'met_at_event' with no eventId (or 'shared_circle' with no
 *  circleId) falls back to 'opt_in_connect' rather than recording a dangling edge type, and a
 *  provenance FK is only kept when it matches the resolved edge type. */
export function resolveConnectProvenance(ctx?: ConnectContext): {
  edge_type: ConnectionEdgeType
  event_id: string | null
  circle_id: string | null
} {
  const requested = isConnectionEdgeType(ctx?.edgeType) ? ctx!.edgeType : 'opt_in_connect'
  const eventId = ctx?.eventId?.trim() || null
  const circleId = ctx?.circleId?.trim() || null

  if (requested === 'met_at_event' && eventId) {
    return { edge_type: 'met_at_event', event_id: eventId, circle_id: null }
  }
  if (requested === 'shared_circle' && circleId) {
    return { edge_type: 'shared_circle', event_id: null, circle_id: circleId }
  }
  // No matching provenance (or a plain/unknown request) → a plain opt-in connect, no dangling FK.
  return { edge_type: 'opt_in_connect', event_id: null, circle_id: null }
}
