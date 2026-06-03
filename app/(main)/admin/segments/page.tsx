import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Users } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { listSegmentsDetailed, describeSegment } from '@/lib/traits/segments'

// Staff-only: saved audiences over tags + computed traits (MEMBER-DATA-PLATFORM.md
// Phase 3). Live member counts + a sample of who's in each — the lists you act on
// for marketing, win-back, and early access.
export const dynamic = 'force-dynamic'

export default async function SegmentsPage() {
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

  const segments = await listSegmentsDetailed()

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="flex items-center gap-2 text-2xl font-bold text-text">
        <Users className="h-5 w-5 text-primary-strong" />
        Segments
      </h1>
      <p className="mb-6 mt-1 text-sm text-muted">
        Saved audiences over member tags + computed traits, with live counts.{' '}
        <Link href="/admin" className="text-primary-strong hover:underline">Back to admin</Link>.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        {segments.map((s) => (
          <div key={s.id} className="rounded-2xl border border-border bg-surface p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-bold text-text">{s.name}</p>
                <p className="mt-0.5 font-mono text-xs text-subtle">{describeSegment(s.definition)}</p>
              </div>
              <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-sm font-bold text-primary-strong">
                {s.count}
              </span>
            </div>
            {s.description && <p className="mt-2 text-sm text-muted">{s.description}</p>}
            {s.sample.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {s.sample.map((m) => (
                  <span key={m.handle || m.displayName} className="rounded-md bg-surface-elevated px-2 py-0.5 text-xs text-muted">
                    {m.handle ? `@${m.handle}` : m.displayName}
                  </span>
                ))}
                {s.count > s.sample.length && (
                  <span className="px-1 py-0.5 text-xs text-subtle">+{s.count - s.sample.length} more</span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {segments.length === 0 && <p className="text-sm text-muted">No segments defined yet.</p>}
    </div>
  )
}
