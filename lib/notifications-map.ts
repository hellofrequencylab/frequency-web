// View-model mapping for notifications, split out of the 'use server' actions so
// it's a plain (testable) function. The flat row comes from the `my_notifications`
// SECURITY DEFINER RPC (migration 20240304000000); the UI wants a nested actor.

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
