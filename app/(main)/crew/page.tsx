import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Star, CheckCircle, Zap, Trophy } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

// ── Tier definitions ──────────────────────────────────────────────────────────

const TIERS = [
  { role: 'member', label: 'Member', minPoints: 0,    color: 'bg-gray-400'    },
  { role: 'crew',   label: 'Crew',   minPoints: 100,  color: 'bg-indigo-500'  },
  { role: 'host',   label: 'Host',   minPoints: 500,  color: 'bg-green-500'   },
  { role: 'guide',  label: 'Guide',  minPoints: 1500, color: 'bg-purple-500'  },
  { role: 'mentor', label: 'Mentor', minPoints: 5000, color: 'bg-amber-500'   },
] as const

const TASK_TYPE_LABEL: Record<string, string> = {
  attendance:   'Attendance',
  hosting:      'Hosting',
  volunteering: 'Volunteering',
  content:      'Content',
  referral:     'Referral',
  other:        'Other',
}

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function CrewPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) notFound()

  const admin = createAdminClient()

  const { data: profile } = await admin
    .from('profiles')
    .select('id, display_name, handle, community_role, avatar_url')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (!profile) notFound()

  // Available tasks
  const { data: tasks } = await admin
    .from('crew_tasks')
    .select('id, name, task_type, points_value, is_repeatable, requires_verification')
    .order('points_value', { ascending: false })

  // My completions
  const { data: completions } = await admin
    .from('crew_completions')
    .select('id, task_id, points_earned, completed_at, verified_by')
    .eq('profile_id', profile.id)
    .order('completed_at', { ascending: false })

  const completionsByTask: Record<string, typeof completions> = {}
  ;(completions ?? []).forEach((c) => {
    if (!completionsByTask[c.task_id]) completionsByTask[c.task_id] = []
    completionsByTask[c.task_id]!.push(c)
  })

  const totalPoints = (completions ?? []).reduce(
    (sum, c) => sum + (c.points_earned ?? 0),
    0
  )
  const completedTaskCount = new Set((completions ?? []).map((c) => c.task_id)).size

  // Tier progress
  const currentTier =
    [...TIERS].reverse().find((t) => totalPoints >= t.minPoints) ?? TIERS[0]
  const nextTierIndex = TIERS.findIndex((t) => t.role === currentTier.role) + 1
  const nextTier = nextTierIndex < TIERS.length ? TIERS[nextTierIndex] : null
  const tierProgress = nextTier
    ? Math.min(
        100,
        Math.round(
          ((totalPoints - currentTier.minPoints) /
            (nextTier.minPoints - currentTier.minPoints)) *
            100
        )
      )
    : 100

  // My first active circle membership (for crew lead badge + leaderboard scope)
  const { data: membership } = await admin
    .from('memberships')
    .select(
      `circle_id, is_crew_lead,
       circle:circles!circle_id ( id, name, slug )`
    )
    .eq('profile_id', profile.id)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()

  // Circle leaderboard — top 5 in same circle
  let leaderboard: Array<{
    profileId: string
    displayName: string
    handle: string
    avatarUrl: string | null
    totalPoints: number
  }> = []

  if (membership?.circle_id) {
    const { data: circleMembers } = await admin
      .from('memberships')
      .select('profile_id')
      .eq('circle_id', membership.circle_id)
      .eq('status', 'active')

    const memberIds = (circleMembers ?? []).map((m) => m.profile_id as string)

    if (memberIds.length > 0) {
      const [{ data: allCompletions }, { data: profileData }] = await Promise.all([
        admin
          .from('crew_completions')
          .select('profile_id, points_earned')
          .in('profile_id', memberIds),
        admin
          .from('profiles')
          .select('id, display_name, handle, avatar_url')
          .in('id', memberIds),
      ])

      const pointsByProfile: Record<string, number> = {}
      ;(allCompletions ?? []).forEach((c) => {
        pointsByProfile[c.profile_id] =
          (pointsByProfile[c.profile_id] ?? 0) + (c.points_earned ?? 0)
      })

      leaderboard = (profileData ?? [])
        .map((p) => ({
          profileId:   p.id,
          displayName: p.display_name,
          handle:      p.handle,
          avatarUrl:   p.avatar_url,
          totalPoints: pointsByProfile[p.id] ?? 0,
        }))
        .sort((a, b) => b.totalPoints - a.totalPoints)
        .slice(0, 5)
    }
  }

  const circleName = (membership as any)?.circle?.name ?? null
  const isCrewLead = (membership as any)?.is_crew_lead ?? false

  return (
    <div className="px-6 py-8 max-w-2xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-50">Crew Dashboard</h1>
          {isCrewLead && (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 font-semibold">
              Crew Lead
            </span>
          )}
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Track your contributions and progress in the community.
          {circleName && (
            <> You&apos;re in <span className="font-medium text-gray-700 dark:text-gray-300">{circleName}</span>.</>
          )}
        </p>
      </div>

      {/* ── Stats ──────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <StatCard
          label="Points"
          value={totalPoints.toLocaleString()}
          Icon={Star}
          colorCls="text-amber-600 bg-amber-50 dark:bg-amber-950 dark:text-amber-400"
        />
        <StatCard
          label="Tasks Done"
          value={String(completedTaskCount)}
          Icon={CheckCircle}
          colorCls="text-green-600 bg-green-50 dark:bg-green-950 dark:text-green-400"
        />
        <StatCard
          label="Tier"
          value={currentTier.label}
          Icon={Zap}
          colorCls="text-indigo-600 bg-indigo-50 dark:bg-indigo-950 dark:text-indigo-400"
        />
      </div>

      {/* ── Tier progress ──────────────────────────── */}
      <div className="mb-8 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {nextTier ? `Progress to ${nextTier.label}` : 'Max tier reached'}
          </span>
          {nextTier && (
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {totalPoints.toLocaleString()} / {nextTier.minPoints.toLocaleString()} pts
            </span>
          )}
        </div>
        <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${currentTier.color}`}
            style={{ width: `${tierProgress}%` }}
          />
        </div>
        {/* Tier milestones */}
        <div className="flex justify-between mt-3">
          {TIERS.map((t) => (
            <div key={t.role} className="flex flex-col items-center gap-1">
              <div
                className={`w-2.5 h-2.5 rounded-full ${
                  totalPoints >= t.minPoints ? t.color : 'bg-gray-200 dark:bg-gray-700'
                }`}
              />
              <span className="text-[10px] text-gray-400 dark:text-gray-500 font-medium">
                {t.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Tasks ──────────────────────────────────── */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
          Tasks
          <span className="ml-2 text-xs font-normal text-gray-400">
            {(tasks ?? []).length} available
          </span>
        </h2>

        {(tasks ?? []).length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 dark:border-gray-700 p-10 text-center">
            <Star className="w-7 h-7 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
            <p className="text-sm text-gray-400 dark:text-gray-500">No tasks available yet.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {(tasks ?? []).map((task) => {
              const myCompletions = completionsByTask[task.id] ?? []
              const isDone = myCompletions.length > 0
              const lastCompletion = myCompletions[0]
              const isVerified = lastCompletion?.verified_by != null

              return (
                <div
                  key={task.id}
                  className={`rounded-xl border px-4 py-3 flex items-start gap-3 transition-colors ${
                    isDone
                      ? 'border-green-100 dark:border-green-900 bg-green-50/50 dark:bg-green-950/30'
                      : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900'
                  }`}
                >
                  <div
                    className={`flex items-center justify-center w-8 h-8 rounded-lg shrink-0 ${
                      isDone
                        ? 'bg-green-100 dark:bg-green-900'
                        : 'bg-gray-50 dark:bg-gray-800'
                    }`}
                  >
                    {isDone ? (
                      <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
                    ) : (
                      <Star className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`text-sm font-medium ${
                          isDone
                            ? 'text-green-800 dark:text-green-300'
                            : 'text-gray-900 dark:text-gray-50'
                        }`}
                      >
                        {task.name}
                      </span>
                      <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 font-medium">
                        {TASK_TYPE_LABEL[task.task_type] ?? task.task_type}
                      </span>
                      {task.is_repeatable && (
                        <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 font-medium">
                          Repeatable
                        </span>
                      )}
                      {task.requires_verification && (
                        <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-orange-50 dark:bg-orange-950 text-orange-600 dark:text-orange-400 font-medium">
                          Needs review
                        </span>
                      )}
                    </div>

                    {isDone && lastCompletion && (
                      <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">
                        Completed{' '}
                        {new Date(lastCompletion.completed_at).toLocaleDateString('en-US', {
                          month: 'short',
                          day:   'numeric',
                          year:  'numeric',
                        })}
                        {isVerified
                          ? ' · Verified'
                          : task.requires_verification
                          ? ' · Pending verification'
                          : ''}
                        {myCompletions.length > 1 ? ` · ${myCompletions.length}x` : ''}
                      </p>
                    )}
                  </div>

                  <span
                    className={`text-sm font-semibold shrink-0 ${
                      isDone ? 'text-green-700 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'
                    }`}
                  >
                    +{task.points_value}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* ── Leaderboard ────────────────────────────── */}
      {leaderboard.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-1.5">
            <Trophy className="w-4 h-4 text-amber-500" />
            Circle Leaderboard
            {circleName && (
              <span className="font-normal text-gray-400 dark:text-gray-500">— {circleName}</span>
            )}
          </h2>
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
            {leaderboard.map((member, i) => {
              const isSelf = member.profileId === profile.id
              const rankColor =
                i === 0
                  ? 'text-amber-500'
                  : i === 1
                  ? 'text-gray-400'
                  : i === 2
                  ? 'text-orange-400'
                  : 'text-gray-300 dark:text-gray-600'

              return (
                <div
                  key={member.profileId}
                  className={`flex items-center gap-3 px-4 py-3 ${
                    i < leaderboard.length - 1
                      ? 'border-b border-gray-100 dark:border-gray-800'
                      : ''
                  } ${isSelf ? 'bg-indigo-50/60 dark:bg-indigo-950/30' : ''}`}
                >
                  <span className={`text-sm font-bold w-5 shrink-0 ${rankColor}`}>{i + 1}</span>

                  {member.avatarUrl ? (
                    <img
                      src={member.avatarUrl}
                      alt={member.displayName}
                      className="w-7 h-7 rounded-full object-cover shrink-0"
                    />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-indigo-100 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-400 text-xs font-semibold flex items-center justify-center shrink-0 select-none">
                      {getInitials(member.displayName)}
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <Link
                      href={`/people/${member.handle}`}
                      className={`text-sm font-medium truncate hover:underline ${
                        isSelf
                          ? 'text-indigo-700 dark:text-indigo-300'
                          : 'text-gray-900 dark:text-gray-50'
                      }`}
                    >
                      {member.displayName}
                      {isSelf && (
                        <span className="ml-1 text-xs text-indigo-400 dark:text-indigo-500 font-normal">
                          (you)
                        </span>
                      )}
                    </Link>
                  </div>

                  <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 shrink-0">
                    {member.totalPoints.toLocaleString()} pts
                  </span>
                </div>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}

// ── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  Icon,
  colorCls,
}: {
  label:    string
  value:    string
  Icon:     React.ElementType
  colorCls: string
}) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${colorCls}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="text-xl font-bold text-gray-900 dark:text-gray-50 leading-none">{value}</div>
      <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{label}</div>
    </div>
  )
}
