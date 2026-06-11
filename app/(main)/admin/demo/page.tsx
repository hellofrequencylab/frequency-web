import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { Sparkles } from 'lucide-react'
import { DemoOverview } from './demo-overview'
import { GrowNetwork } from './grow-network'
import { DangerZone } from './danger-zone'
import { StudioWizard } from './studio/studio-wizard'

// Janitor-only: the single home for the Beta demo content layer (docs/DEMO-SYSTEM.md).
// Laid out as a dashboard: an at-a-glance Overview (counts + the global switch) on
// top, the everyday non-destructive tools (Create an area, Grow the network) in the
// middle, and a single Danger zone at the bottom where every delete/purge lives,
// gated behind one typed-DELETE confirm.
export default async function AdminDemoPage() {
  await requireAdmin('janitor')

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
  const counts = [
    { label: 'members', count: members.count ?? 0 },
    { label: 'circles', count: circles.count ?? 0 },
    { label: 'events', count: events.count ?? 0 },
    { label: 'posts', count: posts.count ?? 0 },
    { label: 'practices', count: practices.count ?? 0 },
  ]
  const total = counts.reduce((s, c) => s + c.count, 0)

  const demoCircles = (circleList.data ?? []).map((c) => ({
    id: c.id as string,
    name: c.name as string,
    memberCount: (c.member_count as number) ?? 0,
    channel: ((c.channel as { name?: string } | null)?.name ?? null) as string | null,
  }))
  const channels = (channelList.data ?? []).map((c) => ({ slug: c.slug as string, name: c.name as string }))

  return (
    <AdminTemplate
      title="Demo Studio"
      eyebrow="Operations"
      icon={Sparkles}
      description="Generate a believable community for any area, then manage or purge it. All tagged demo (⚡), previewable, and reversible."
      width="default"
    >
      {/* Overview — at-a-glance state + the one global show/hide switch */}
      <DemoOverview enabled={enabled} counts={counts} total={total} />

      <AdminSection
        title="Create an area"
        description="Spin up circles, people with journeys, conversations, events, practices, and gamification for a new place. Demographic-aware, previewable, reversible by area."
      >
        <StudioWizard channels={channels} />
      </AdminSection>

      <AdminSection
        title="Grow the network"
        description="Top up a circle or spin up a new one. Each arrives fully populated. Non-destructive."
      >
        <GrowNetwork circles={demoCircles} channels={channels} />
      </AdminSection>

      <AdminSection
        title="Danger zone"
        description="Every delete & purge lives here, behind a single DELETE confirm. None of it can be undone."
      >
        <DangerZone
          total={total}
          counts={counts}
          circles={demoCircles}
          defaultLocation={{ name: 'Encinitas', lat: 33.0369, lng: -117.292 }}
        />
      </AdminSection>
    </AdminTemplate>
  )
}
