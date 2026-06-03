import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Lightbulb } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getEngagementRead, type Severity } from '@/lib/analytics/engagement-read'

// Janitor-only: the Engagement Read (ENGAGEMENT-MARKETING-ENGINE.md Phase D). Reads
// the live signal and names what's working, what's jamming, and what to do — the
// product/retention twin of the Market Read. Synthesis is deterministic + grounded.
export const dynamic = 'force-dynamic'

const SEVERITY: Record<Severity, { label: string; cls: string; dot: string }> = {
  risk: { label: 'Risk', cls: 'text-danger', dot: '🔴' },
  watch: { label: 'Watch', cls: 'text-warning', dot: '⚠️' },
  good: { label: 'Good', cls: 'text-success', dot: '✅' },
}

export default async function InsightsPage() {
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

  const read = await getEngagementRead()

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="flex items-center gap-2 text-2xl font-bold text-text">
        <Lightbulb className="h-5 w-5 text-primary-strong" />
        Engagement Read
      </h1>
      <p className="mb-5 mt-1 text-sm text-muted">
        What&rsquo;s working, what&rsquo;s jamming, and what to do — read off the live signal.{' '}
        <Link href="/admin" className="text-primary-strong hover:underline">Back to admin</Link>.
      </p>

      <div className="mb-6 rounded-2xl border border-border bg-surface p-4">
        <p className="text-sm font-semibold text-text">{read.summary}</p>
      </div>

      {read.insights.length === 0 ? (
        <p className="text-sm text-muted">No signal to read yet — check back once members are active.</p>
      ) : (
        <div className="space-y-3">
          {read.insights.map((i) => {
            const s = SEVERITY[i.severity]
            return (
              <div key={i.id} className="rounded-2xl border border-border bg-surface p-4">
                <p className="flex items-center gap-2 font-bold text-text">
                  <span aria-hidden>{s.dot}</span>
                  {i.title}
                  <span className={`text-xs font-semibold uppercase tracking-wide ${s.cls}`}>{s.label}</span>
                </p>
                <p className="mt-1 text-sm text-muted">{i.finding}</p>
                <p className="mt-2 text-sm text-text">
                  <span className="font-semibold text-primary-strong">Do:</span> {i.recommendation}
                </p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
