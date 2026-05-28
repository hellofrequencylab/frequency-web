import Link from 'next/link'
import { CheckCircle2, Circle, Sparkles } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'

type CheckItem = {
  key: string
  label: string
  href: string
  done: boolean
}

export async function GettingStartedChecklist({ profileId }: { profileId: string }) {
  const admin = createAdminClient()

  const [profileRes, membershipRes, postRes] = await Promise.all([
    admin
      .from('profiles')
      .select('avatar_url, bio')
      .eq('id', profileId)
      .maybeSingle(),
    admin
      .from('memberships')
      .select('id')
      .eq('profile_id', profileId)
      .eq('status', 'active')
      .limit(1),
    admin
      .from('posts')
      .select('id')
      .eq('author_id', profileId)
      .limit(1),
  ])

  const profile    = profileRes.data
  const hasCircle  = (membershipRes.data ?? []).length > 0
  const hasPosted  = (postRes.data ?? []).length > 0
  const hasAvatar  = !!profile?.avatar_url
  const hasBio     = !!profile?.bio?.trim()

  const items: CheckItem[] = [
    { key: 'avatar',  label: 'Add a profile photo',  href: '/settings/profile', done: hasAvatar },
    { key: 'bio',     label: 'Write a short bio',     href: '/settings/profile', done: hasBio },
    { key: 'circle',  label: 'Join a circle',          href: '/circles',          done: hasCircle },
    { key: 'post',    label: 'Make your first post',  href: '/feed',             done: hasPosted },
  ]

  const doneCount = items.filter(i => i.done).length

  // Auto-hide once complete
  if (doneCount === items.length) return null

  const pct = Math.round((doneCount / items.length) * 100)

  return (
    <div className="rounded-2xl border border-primary-bg dark:border-primary bg-surface shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-primary-bg flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-primary-strong shrink-0" />
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-primary-strong">
            Getting Started
          </h3>
        </div>
        <span className="text-[10px] font-bold text-primary-strong tabular-nums">
          {pct}%
        </span>
      </div>

      {/* Progress bar */}
      <div className="w-full h-1 bg-primary-bg overflow-hidden">
        <div
          className="h-full bg-primary transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Items */}
      <div className="p-2">
        {items.map(item => (
          <div key={item.key}>
            {item.done ? (
              <div className="flex items-center gap-2 px-2 py-1.5 opacity-40">
                <CheckCircle2 className="w-3.5 h-3.5 text-success shrink-0" />
                <span className="text-xs text-muted line-through">{item.label}</span>
              </div>
            ) : (
              <Link
                href={item.href}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-primary-bg dark:hover:bg-primary-bg transition-colors group"
              >
                <Circle className="w-3.5 h-3.5 text-primary-strong dark:text-primary-strong shrink-0" />
                <span className="text-xs font-medium text-text dark:text-subtle/60 group-hover:text-primary-strong dark:group-hover:text-primary-strong transition-colors flex-1">
                  {item.label}
                </span>
                <span className="text-[10px] text-primary-strong opacity-0 group-hover:opacity-100 transition-opacity shrink-0">→</span>
              </Link>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
