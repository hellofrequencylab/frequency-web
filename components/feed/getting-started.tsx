import Link from 'next/link'
import { CheckCircle2, Circle, Sparkles } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMemberPractices } from '@/lib/practices'

type CheckItem = {
  key: string
  label: string
  href: string
  done: boolean
}

export async function GettingStartedChecklist({ profileId }: { profileId: string }) {
  const admin = createAdminClient()

  // The activation funnel ends at the North-Star moment: a verified practice.
  const [profileRes, membershipRes, practiceRes, myPractices] = await Promise.all([
    admin
      .from('profiles')
      .select('avatar_url')
      .eq('id', profileId)
      .maybeSingle(),
    admin
      .from('memberships')
      .select('id')
      .eq('profile_id', profileId)
      .eq('status', 'active')
      .limit(1),
    admin
      .from('engagement_events')
      .select('id', { count: 'exact', head: true })
      .eq('actor_profile_id', profileId)
      .eq('event_type', 'practice.verified'),
    getMemberPractices(profileId),
  ])

  const hasAvatar           = !!profileRes.data?.avatar_url
  const hasCircle           = (membershipRes.data ?? []).length > 0
  const hasAdoptedPractice  = myPractices.length > 0
  const hasPracticed        = (practiceRes.count ?? 0) > 0

  const items: CheckItem[] = [
    { key: 'avatar',   label: 'Add a profile photo',     href: '/settings/profile', done: hasAvatar },
    { key: 'circle',   label: 'Join or start a circle',  href: '/circles',          done: hasCircle },
    { key: 'practice', label: 'Adopt a practice',        href: '/practices',        done: hasAdoptedPractice },
    { key: 'log',      label: 'Log your first practice', href: '/practices',        done: hasPracticed },
  ]

  const doneCount = items.filter(i => i.done).length

  // Auto-hide once complete
  if (doneCount === items.length) return null

  const pct = Math.round((doneCount / items.length) * 100)

  return (
    <div className="rounded-2xl bg-primary-bg/50 dark:bg-primary-bg/30 p-3">
      {/* Header */}
      <div className="px-1 flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-1.5">
          <Sparkles className="w-4 h-4 text-primary-strong shrink-0" />
          <h3 className="text-sm font-bold tracking-tight text-primary-strong">
            Getting started
          </h3>
        </div>
        <span className="text-xs font-bold text-primary-strong tabular-nums">
          {pct}%
        </span>
      </div>

      {/* Progress bar */}
      <div className="mx-1 mb-2 h-1.5 rounded-full bg-primary-bg overflow-hidden">
        <div
          className="h-full rounded-full bg-primary transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Items */}
      <div className="space-y-0.5">
        {items.map(item => (
          <div key={item.key}>
            {item.done ? (
              <div className="flex items-center gap-2.5 px-1 py-1.5 opacity-40">
                <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
                <span className="text-sm text-muted line-through">{item.label}</span>
              </div>
            ) : (
              <Link
                href={item.href}
                className="flex items-center gap-2.5 rounded-lg px-1 py-1.5 hover:bg-primary-bg dark:hover:bg-primary-bg transition-colors group"
              >
                <Circle className="w-4 h-4 text-primary-strong dark:text-primary-strong shrink-0" />
                <span className="text-sm font-medium text-text dark:text-subtle/60 group-hover:text-primary-strong dark:group-hover:text-primary-strong transition-colors flex-1">
                  {item.label}
                </span>
                <span className="text-xs text-primary-strong opacity-0 group-hover:opacity-100 transition-opacity shrink-0">→</span>
              </Link>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
