import { notFound } from 'next/navigation'
import Link from 'next/link'
import { FlaskConical } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { DemoControls } from './demo-controls'

// Janitor-only: the operator controls for the Beta demo content layer
// (docs/DEMO-SYSTEM.md) — the global show/hide switch and the permanent purge.
export default async function AdminDemoPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('community_role')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (!profile || profile.community_role !== 'janitor') notFound()

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
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="flex items-center gap-2 text-2xl font-bold text-text">
        <FlaskConical className="h-5 w-5 text-primary-strong" />
        Demo content
      </h1>
      <p className="mb-6 mt-1 text-sm text-muted">
        Seeded Beta content that makes the community look alive. Show or hide it everywhere with one
        switch, or purge it for good once real content has taken over.{' '}
        <Link href="/admin" className="text-primary-strong hover:underline">Back to admin</Link>.
      </p>
      <DemoControls enabled={enabled} counts={counts} total={total} />
    </div>
  )
}
