// THE SUBJECT OF A SHARE, for the guest who may not yet read it (PROG-CAL7, LIVE-541).
//
// A Plan offered to a Space is readable by that Space only once the share is ACCEPTED
// (`private.plan_is_shared_with_me`, 20270345007300). So a PENDING offer, read on the guest's own
// session, is a share id, a plan id and a date, and a strip that read "a Plan was shared with you"
// with no title and no sender is an offer nobody can answer. This resolves the title and the host
// Space's name for EXACTLY the plan ids the guest's session already returned as shares addressed
// to it: the tenancy decision stays with RLS on space_plan_shares, and this read widens nothing but
// the two words the offer needs. Service-role, on the admin-client baseline with this reason.
//
// Never handed a plan id from the browser: the caller (the calendar settings page) passes the ids
// it read from the session. Fail-safe to an empty map; the strip then says what it can.

import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import type { ShareSubject } from './plan-shares'

export async function resolveShareSubjects(planIds: readonly string[]): Promise<Map<string, ShareSubject>> {
  const ids = [...new Set(planIds.filter(Boolean))].slice(0, 100)
  const out = new Map<string, ShareSubject>()
  if (ids.length === 0) return out
  try {
    const admin = createAdminClient()
    const { data: plans } = await admin.from('space_plans').select('id, title, space_id').in('id', ids)
    const rows = (plans ?? []) as { id: string; title: string; space_id: string }[]
    const spaceIds = [...new Set(rows.map((r) => r.space_id))]
    const { data: spaces } = spaceIds.length ? await admin.from('spaces').select('id, name').in('id', spaceIds) : { data: [] }
    const names = new Map(((spaces ?? []) as { id: string; name: string }[]).map((s) => [s.id, s.name]))
    for (const r of rows) out.set(r.id, { title: r.title, hostSpaceId: r.space_id, hostName: names.get(r.space_id) ?? null })
    return out
  } catch {
    return out
  }
}
