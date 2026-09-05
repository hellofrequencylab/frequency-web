// View-model mapping for notifications, split out of the 'use server' actions so
// it's a plain (testable) function. The flat row comes from the `my_notifications`
// SECURITY DEFINER RPC (migration 20240307000000); the UI wants a nested actor.

export type NotificationItem = {
  id: string
  type: string
  reference_type: string | null
  reference_id: string | null
  body: string | null
  read_at: string | null
  created_at: string
  actor: {
    id: string
    display_name: string
    handle: string
    avatar_url: string | null
  } | null
}

// Flat row shape returned by the my_notifications RPC.
export type NotificationRpcRow = {
  id: string
  type: string
  reference_type: string | null
  reference_id: string | null
  body: string | null
  read_at: string | null
  created_at: string
  actor_id: string | null
  actor_display_name: string | null
  actor_handle: string | null
  actor_avatar_url: string | null
}

export function mapNotificationRow(r: NotificationRpcRow): NotificationItem {
  return {
    id: r.id,
    type: r.type,
    reference_type: r.reference_type,
    reference_id: r.reference_id,
    body: r.body,
    read_at: r.read_at,
    created_at: r.created_at,
    actor: r.actor_id
      ? {
          id: r.actor_id,
          display_name: r.actor_display_name ?? '',
          handle: r.actor_handle ?? '',
          avatar_url: r.actor_avatar_url,
        }
      : null,
  }
}

// ── Load results (scan2 L5-03, 2026-09-05) ─────────────────────────────────────────────────
// The bell's two reads used to fold a failed RPC into "no notifications" and "0 unread". The list
// loader now returns a discriminated result, and the count loader returns UNREAD_COUNT_UNAVAILABLE
// (a negative sentinel, because the count travels through the app shell as a plain number) so the
// bell can render no badge and say the count could not load, instead of a zero that is not real.

export type NotificationsLoad = { kind: 'ok'; items: NotificationItem[] } | { kind: 'error' }

/** `getUnreadCount()` returns this when the count RPC fails: no badge, and never a false zero. */
export const UNREAD_COUNT_UNAVAILABLE = -1
