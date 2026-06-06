import { createAdminClient } from '@/lib/supabase/admin'

export type AdminEvent = {
  id: string
  title: string
  slug: string
  starts_at: string
  ends_at: string | null
  location: string | null
  is_cancelled: boolean
  host: { display_name: string } | null
}

// "Manage events across your circles" data for the in-place Spaces·Events module
// (ADR-138) and the /admin/events page (which adopts this loader). Gathers events in
// the host's circles plus events they host directly, dedupes, and splits
// upcoming/past. Also returns the caller's circles for the New Event modal.
export async function getEventsAdminData(profileId: string) {
  const admin = createAdminClient()

  const { data: hostedCircles } = await admin.from('circles').select('id').eq('host_id', profileId)

  const { data: myMemberships } = await admin
    .from('memberships')
    .select('circle:circles!circle_id ( id, name )')
    .eq('profile_id', profileId)
    .eq('status', 'active')
  const myCircles = ((myMemberships ?? []) as unknown as { circle: { id: string; name: string } | null }[])
    .map((m) => m.circle)
    .filter((c): c is { id: string; name: string } => !!c)

  const circleIds = (hostedCircles ?? []).map((c: { id: string }) => c.id)

  let events: AdminEvent[] = []
  if (circleIds.length > 0) {
    const { data } = await admin
      .from('events')
      .select(
        `id, title, slug, starts_at, ends_at, location, is_cancelled,
         host:profiles!host_id ( display_name )`,
      )
      .in('scope_id', circleIds)
      .order('starts_at', { ascending: false })
    events = (data ?? []) as unknown as AdminEvent[]
  }

  // Also include events hosted directly by this profile (not scoped to their circles).
  const { data: directHosted } = await admin
    .from('events')
    .select(
      `id, title, slug, starts_at, ends_at, location, is_cancelled,
       host:profiles!host_id ( display_name )`,
    )
    .eq('host_id', profileId)
    .order('starts_at', { ascending: false })

  const seen = new Set(events.map((e) => e.id))
  for (const e of (directHosted ?? []) as unknown as AdminEvent[]) {
    if (!seen.has(e.id)) events.push(e)
  }
  events.sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime())

  const now = new Date()
  const upcoming = events.filter((e) => new Date(e.starts_at) >= now)
  const past = events.filter((e) => new Date(e.starts_at) < now)

  return { upcoming, past, myCircles }
}
