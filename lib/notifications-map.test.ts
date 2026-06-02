import { describe, it, expect } from 'vitest'
import { mapNotificationRow, type NotificationRpcRow } from './notifications-map'

const base: NotificationRpcRow = {
  id: 'n1',
  type: 'mention',
  reference_type: 'post',
  reference_id: 'p1',
  body: 'mentioned you',
  read_at: null,
  created_at: '2026-06-02T00:00:00Z',
  actor_id: 'a1',
  actor_display_name: 'Ada',
  actor_handle: 'ada',
  actor_avatar_url: 'https://x/a.png',
}

describe('mapNotificationRow (RPC row → view-model)', () => {
  it('nests the actor when actor_id is present', () => {
    const out = mapNotificationRow(base)
    expect(out.actor).toEqual({
      id: 'a1',
      display_name: 'Ada',
      handle: 'ada',
      avatar_url: 'https://x/a.png',
    })
    expect(out.id).toBe('n1')
    expect(out.reference_id).toBe('p1')
  })

  it('returns a null actor for system notifications (no actor_id)', () => {
    const out = mapNotificationRow({ ...base, actor_id: null, actor_display_name: null, actor_handle: null, actor_avatar_url: null })
    expect(out.actor).toBeNull()
  })

  it('coerces missing actor name/handle to empty strings, keeps null avatar', () => {
    const out = mapNotificationRow({ ...base, actor_display_name: null, actor_handle: null, actor_avatar_url: null })
    expect(out.actor).toEqual({ id: 'a1', display_name: '', handle: '', avatar_url: null })
  })
})
