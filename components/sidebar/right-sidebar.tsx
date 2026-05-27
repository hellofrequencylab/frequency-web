import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { getInitials } from '@/lib/utils'

export type CommunityRole = 'member' | 'crew' | 'host' | 'guide' | 'mentor'

interface RightSidebarProps {
  profileId: string
  role: CommunityRole
}

// ── Widget card shell ─────────────────────────────────────────────────────────

function WidgetCard({
  title,
  badge,
  children,
}: {
  title: string
  badge?: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
          {title}
        </h3>
        {badge && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 font-medium">
            {badge}
          </span>
        )}
      </div>
      {children}
    </div>
  )
}

// ── Active Members ────────────────────────────────────────────────────────────

async function ActiveMembersWidget({ profileId }: { profileId: string }) {
  const admin = createAdminClient()

  // Circles I belong to
  const { data: myMemberships } = await admin
    .from('memberships')
    .select('circle_id')
    .eq('profile_id', profileId)
    .eq('status', 'active')

  const circleIds = (myMemberships ?? []).map((m: any) => m.circle_id)
  if (circleIds.length === 0) return null

  // Recently joined members across those circles (over-fetch to dedupe)
  const { data: rawRows } = await admin
    .from('memberships')
    .select(
      'profile_id, joined_at, profile:profiles!profile_id(id, display_name, handle, avatar_url)'
    )
    .in('circle_id', circleIds)
    .eq('status', 'active')
    .neq('profile_id', profileId)
    .order('joined_at', { ascending: false })
    .limit(30)

  // Dedupe by profile_id, cap at 8
  const seen = new Set<string>()
  const members: any[] = []
  for (const row of rawRows ?? []) {
    if (!seen.has(row.profile_id)) {
      seen.add(row.profile_id)
      members.push(row)
      if (members.length >= 8) break
    }
  }

  if (members.length === 0) return null

  return (
    <WidgetCard title="Members">
      <div className="p-2">
        {members.map((m: any) => (
          <Link
            key={m.profile_id}
            href={`/people/${m.profile.handle}`}
            className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            {m.profile.avatar_url ? (
              <img
                src={m.profile.avatar_url}
                alt={m.profile.display_name}
                className="w-7 h-7 rounded-full object-cover shrink-0"
              />
            ) : (
              <div className="w-7 h-7 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-[10px] font-bold text-gray-500 dark:text-gray-400 shrink-0 select-none">
                {getInitials(m.profile.display_name ?? '')}
              </div>
            )}
            <span className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate flex-1">
              {m.profile.display_name}
            </span>
          </Link>
        ))}
      </div>
      <div className="px-4 py-2.5 border-t border-gray-100 dark:border-gray-800">
        <Link
          href="/people"
          className="text-[11px] font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
        >
          View directory →
        </Link>
      </div>
    </WidgetCard>
  )
}

// ── Leaderboard stub ──────────────────────────────────────────────────────────

function LeaderboardWidget() {
  return (
    <WidgetCard title="Leaderboard" badge="Soon">
      <div className="p-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center gap-2.5 px-2 py-1.5 opacity-30 pointer-events-none">
            <span className="text-xs font-bold text-gray-400 w-4 shrink-0 tabular-nums">{i}</span>
            <div className="w-6 h-6 rounded-full bg-gray-200 dark:bg-gray-700 shrink-0" />
            <div className="h-2 rounded-full bg-gray-200 dark:bg-gray-700 flex-1" />
            <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-800 w-8 shrink-0" />
          </div>
        ))}
      </div>
    </WidgetCard>
  )
}

// ── Announcements stub ────────────────────────────────────────────────────────

function AnnouncementsWidget() {
  return (
    <WidgetCard title="Announcements" badge="Soon">
      <div className="p-4 space-y-3">
        {[1, 2].map((i) => (
          <div key={i} className="space-y-1.5 opacity-30 pointer-events-none">
            <div className="h-2.5 rounded-full bg-gray-200 dark:bg-gray-700 w-3/4" />
            <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-800 w-full" />
            <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-800 w-5/6" />
          </div>
        ))}
      </div>
    </WidgetCard>
  )
}

// ── Right sidebar ─────────────────────────────────────────────────────────────
// Role-aware widget composition. Adding a new widget = new component + add here.
//
// member  → Members
// crew    → Members · Leaderboard
// host+   → Members · Leaderboard · Announcements

export default async function RightSidebar({ profileId, role }: RightSidebarProps) {
  const isCrew    = ['crew', 'host', 'guide', 'mentor'].includes(role)
  const isHost    = ['host', 'guide', 'mentor'].includes(role)

  return (
    <div className="px-4 py-6 space-y-4">
      <ActiveMembersWidget profileId={profileId} />
      {isCrew && <LeaderboardWidget />}
      {isHost && <AnnouncementsWidget />}
    </div>
  )
}
