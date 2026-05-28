import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const q = (searchParams.get('q') ?? '').trim()

  if (!q || q.length < 1) {
    return NextResponse.json({ profiles: [] })
  }

  // Profile search uses search_handles_public RPC (SECURITY DEFINER) so we
  // don't need service-role just to find people. The narrow return shape
  // (id, handle, display_name, avatar_url) is enforced by the RPC itself.
  type SearchHit = { id: string; handle: string; display_name: string; avatar_url: string | null }
  const supabase = await createClient()
  const { data: hits } = await supabase.rpc('search_handles_public', { q })
  const profiles = (hits ?? []) as SearchHit[]

  // The friendships annotation below still uses admin client because the
  // friendships table RLS hasn't been reviewed in this pass.
  const admin = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()
  let myProfileId: string | null = null
  if (user) {
    const { data: me } = await supabase
      .from('profiles')
      .select('id')
      .eq('auth_user_id', user.id)
      .maybeSingle()
    myProfileId = (me?.id as string | undefined) ?? null
  }

  if (!myProfileId || profiles.length === 0) {
    return NextResponse.json({
      profiles: profiles.map((p) => ({ ...p, friend_status: 'none' as const })),
    })
  }

  const otherIds = profiles.map((p) => p.id as string)
  const { data: rows } = await admin
    .from('friendships')
    .select('user_a_id, user_b_id, status, requested_by')
    .or(
      [
        `and(user_a_id.eq.${myProfileId},user_b_id.in.(${otherIds.join(',')}))`,
        `and(user_b_id.eq.${myProfileId},user_a_id.in.(${otherIds.join(',')}))`,
      ].join(',')
    )

  const statusByOther = new Map<string, 'none' | 'pending_outgoing' | 'pending_incoming' | 'accepted'>()
  for (const r of (rows ?? []) as Array<{
    user_a_id: string; user_b_id: string; status: string; requested_by: string
  }>) {
    const other = r.user_a_id === myProfileId ? r.user_b_id : r.user_a_id
    if (r.status === 'accepted') statusByOther.set(other, 'accepted')
    else if (r.requested_by === myProfileId) statusByOther.set(other, 'pending_outgoing')
    else statusByOther.set(other, 'pending_incoming')
  }

  return NextResponse.json({
    profiles: profiles.map((p) => ({
      ...p,
      friend_status: statusByOther.get(p.id as string) ?? 'none',
    })),
  })
}
