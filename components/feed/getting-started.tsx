import Link from 'next/link'
import { CheckCircle2, Circle, Sparkles } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'

type CheckItem = {
  key: string
  label: string
  description: string
  href: string
  done: boolean
}

export async function GettingStartedChecklist({ profileId }: { profileId: string }) {
  const admin = createAdminClient()

  // Fetch everything we need to evaluate completion in one go
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
    {
      key:         'avatar',
      label:       'Add a profile photo',
      description: 'Put a face to your name.',
      href:        '/settings/profile',
      done:        hasAvatar,
    },
    {
      key:         'bio',
      label:       'Write a short bio',
      description: 'Tell your community a bit about yourself.',
      href:        '/settings/profile',
      done:        hasBio,
    },
    {
      key:         'circle',
      label:       'Join a circle',
      description: 'Find your local group to see what\'s happening.',
      href:        '/circles',
      done:        hasCircle,
    },
    {
      key:         'post',
      label:       'Make your first post',
      description: 'Say hello — the community wants to hear from you.',
      href:        '/feed',
      done:        hasPosted,
    },
  ]

  const doneCount = items.filter(i => i.done).length

  // Hide once everything is complete
  if (doneCount === items.length) return null

  const pct = Math.round((doneCount / items.length) * 100)

  return (
    <div className="rounded-xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50/60 dark:bg-indigo-950/20 p-5 mb-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-indigo-500 shrink-0" />
          <div>
            <p className="text-sm font-bold text-gray-900 dark:text-gray-50">
              Getting started
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {doneCount} of {items.length} complete
            </p>
          </div>
        </div>
        <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 tabular-nums">
          {pct}%
        </span>
      </div>

      {/* Progress bar */}
      <div className="w-full h-1.5 rounded-full bg-indigo-100 dark:bg-indigo-900 mb-4 overflow-hidden">
        <div
          className="h-full rounded-full bg-indigo-500 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Items */}
      <ul className="space-y-2">
        {items.map(item => (
          <li key={item.key}>
            {item.done ? (
              <div className="flex items-center gap-2.5 px-2 py-1.5 opacity-50">
                <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                <span className="text-sm text-gray-500 dark:text-gray-400 line-through">{item.label}</span>
              </div>
            ) : (
              <Link
                href={item.href}
                className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-indigo-100/60 dark:hover:bg-indigo-900/30 transition-colors group"
              >
                <Circle className="w-4 h-4 text-indigo-300 dark:text-indigo-700 shrink-0 group-hover:text-indigo-400 transition-colors" />
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-gray-800 dark:text-gray-200 group-hover:text-indigo-700 dark:group-hover:text-indigo-300 transition-colors">
                    {item.label}
                  </span>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0">{item.description}</p>
                </div>
                <span className="text-xs text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">→</span>
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
