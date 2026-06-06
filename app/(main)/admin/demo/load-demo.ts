import { createAdminClient } from '@/lib/supabase/admin'

// Demo-content state for the in-place Demo module (ADR-138 — Platform): the global
// switch, the per-type counts, the demo circles, and the channels. Mirrors the
// /admin/demo page load (which can adopt this to DRY).

type DemoCircle = { id: string; name: string; memberCount: number; channel: string | null }
type Channel = { slug: string; name: string }
type Count = { label: string; count: number }

export async function getDemoData(): Promise<{
  enabled: boolean
  counts: Count[]
  total: number
  demoCircles: DemoCircle[]
  channels: Channel[]
}> {
  const admin = createAdminClient()
  const head = { count: 'exact' as const, head: true }

  const [flag, members, circles, events, posts, practices, circleList, channelList] = await Promise.all([
    admin.from('platform_flags').select('value').eq('key', 'demo_mode').maybeSingle(),
    admin.from('profiles').select('id', head).eq('is_demo', true),
    admin.from('circles').select('id', head).eq('is_demo', true),
    admin.from('events').select('id', head).eq('is_demo', true),
    admin.from('posts').select('id', head).eq('is_demo', true),
    admin.from('practices').select('id', head).eq('is_demo', true),
    admin
      .from('circles')
      .select('id, name, member_count, channel:topical_channels!topical_channel_id(name)')
      .eq('is_demo', true)
      .order('name'),
    admin.from('topical_channels').select('slug, name').eq('is_active', true).order('display_order'),
  ])

  const enabled = (flag.data?.value as boolean | undefined) ?? true
  const counts: Count[] = [
    { label: 'members', count: members.count ?? 0 },
    { label: 'circles', count: circles.count ?? 0 },
    { label: 'events', count: events.count ?? 0 },
    { label: 'posts', count: posts.count ?? 0 },
    { label: 'practices', count: practices.count ?? 0 },
  ]
  const total = counts.reduce((s, c) => s + c.count, 0)

  const demoCircles: DemoCircle[] = (circleList.data ?? []).map((c) => ({
    id: c.id as string,
    name: c.name as string,
    memberCount: (c.member_count as number) ?? 0,
    channel: ((c.channel as { name?: string } | null)?.name ?? null) as string | null,
  }))
  const channels: Channel[] = (channelList.data ?? []).map((c) => ({ slug: c.slug as string, name: c.name as string }))

  return { enabled, counts, total, demoCircles, channels }
}
