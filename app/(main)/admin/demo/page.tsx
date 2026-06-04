import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminPage, AdminSection } from '@/components/admin/admin-page'
import { Sparkles } from 'lucide-react'
import { DemoControls } from './demo-controls'
import { StudioWizard } from './studio/studio-wizard'

// Janitor-only: the single home for the Beta demo content layer (docs/DEMO-SYSTEM.md).
// Two zones on one page: the Seed Studio (generate a believable area on demand) and
// the management controls (the global show/hide switch, grow, select/delete, purge).
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
    <AdminPage
      title="Demo Studio"
      eyebrow="Platform"
      icon={Sparkles}
      description="Generate a believable, year-old-feeling community for any area — then show, hide, grow, or purge it. Everything is tagged demo (⚡), previewable before it writes, and reversible."
      width="narrow"
    >
      <AdminSection
        title="Create an area"
        description="Spin up circles, people with journeys, conversations, events, practices, and gamification for a new place. Demographic-aware, previewable, reversible by area."
      >
        <StudioWizard channels={channels} />
      </AdminSection>

      <div className="border-t border-border pt-2" />

      <AdminSection
        title="Manage demo content"
        description="Show or hide all demo content with one switch, grow specific circles, or purge it for good once real content has taken over."
      >
        <DemoControls enabled={enabled} counts={counts} total={total} circles={demoCircles} channels={channels} />
      </AdminSection>
    </AdminPage>
  )
}
