import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminPage } from '@/components/admin/admin-page'
import { FlaskConical } from 'lucide-react'
import { DemoControls } from './demo-controls'

// Janitor-only: the operator controls for the Beta demo content layer
// (docs/DEMO-SYSTEM.md) — the global show/hide switch and the permanent purge.
export default async function AdminDemoPage() {
  await requireAdmin('janitor')

  const admin = createAdminClient()
  const head = { count: 'exact' as const, head: true }
  const [flag, members, circles, events, posts, practices] = await Promise.all([
    admin.from('platform_flags').select('value').eq('key', 'demo_mode').maybeSingle(),
    admin.from('profiles').select('id', head).eq('is_demo', true),
    admin.from('circles').select('id', head).eq('is_demo', true),
    admin.from('events').select('id', head).eq('is_demo', true),
    admin.from('posts').select('id', head).eq('is_demo', true),
    admin.from('practices').select('id', head).eq('is_demo', true),
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

  return (
    <AdminPage
      title="Demo content"
      eyebrow="Platform"
      icon={FlaskConical}
      description="Seeded Beta content that makes the community look alive. Show or hide it everywhere with one switch, or purge it for good once real content has taken over."
      width="narrow"
    >
      <DemoControls enabled={enabled} counts={counts} total={total} />
    </AdminPage>
  )
}
