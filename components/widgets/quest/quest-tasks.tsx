import { Star, CheckCircle, Zap } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCrewContext } from '@/lib/quest/crew-context'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import { CompleteButton } from '@/app/(main)/crew/complete-button'
import { CircleTasksSection } from '@/app/(main)/crew/circle-tasks-section'

// My Quest layout module (ADR-270/294): earn Zaps by showing up. The viewer's circle tasks
// (host-assigned, claimable) on top, then the global task catalogue with this member's completion
// state. Self-fetching RSC keyed to the signed-in member; the circle block renders nothing when
// the viewer's circle has none.

const TASK_TYPE_LABEL: Record<string, string> = {
  attendance: 'Attendance',
  hosting: 'Hosting',
  volunteering: 'Volunteering',
  content: 'Content',
  referral: 'Referral',
  other: 'Other',
}

interface TaskRow {
  id: string
  name: string
  task_type: string
  zaps_value: number
  is_repeatable: boolean | null
  requires_verification: boolean | null
}

export async function QuestTasks() {
  const ctx = await getCrewContext()
  if (!ctx) return null
  const { profileId, isCrew, membership } = ctx
  const admin = createAdminClient()

  // Available GLOBAL catalogue tasks (circle_id IS NULL). Circle-scoped tasks render in their own
  // claim-aware section above. Untyped handle: circle_id isn't in database.types yet.
  const { data: tasksData } = await admin
    .from('crew_tasks')
    .select('id, name, task_type, zaps_value, is_repeatable, requires_verification')
    .is('circle_id', null)
    .order('zaps_value', { ascending: false })
  const tasks = (tasksData ?? []) as TaskRow[]

  // My completions (all-time, for task state).
  const { data: completions } = await admin
    .from('crew_completions')
    .select('id, task_id, zaps_earned, completed_at, verified_by')
    .eq('profile_id', profileId)
    .order('completed_at', { ascending: false })

  const completionsByTask: Record<string, NonNullable<typeof completions>> = {}
  ;(completions ?? []).forEach((c) => {
    if (!c.task_id) return
    if (!completionsByTask[c.task_id]) completionsByTask[c.task_id] = []
    completionsByTask[c.task_id]!.push(c)
  })

  return (
    <div className="space-y-6">
      {/* Circle tasks — host-assigned, claimable (renders nothing when the viewer's circle has none). */}
      {membership?.circleId && (
        <CircleTasksSection
          circleId={membership.circleId}
          circleName={membership.circleName}
          viewerProfileId={profileId}
          isCrew={isCrew}
        />
      )}

      <section>
        <SectionHeader title="Tasks" count={tasks.length} />

        {tasks.length === 0 ? (
          <EmptyState icon={Star} title="No tasks available yet." />
        ) : (
          <div className="space-y-1.5">
            {tasks.map((task) => {
              const myCompletions = completionsByTask[task.id] ?? []
              const isDone = myCompletions.length > 0
              const lastCompletion = myCompletions[0]
              const isVerified = lastCompletion?.verified_by != null

              return (
                <div
                  key={task.id}
                  className={`flex items-start gap-3 rounded-2xl px-4 py-3 transition-colors ${
                    isDone ? 'bg-success-bg/40' : 'bg-surface-elevated/60'
                  }`}
                >
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                      isDone ? 'bg-success-bg' : 'bg-surface-elevated'
                    }`}
                  >
                    {isDone ? (
                      <CheckCircle className="h-4 w-4 text-success" />
                    ) : (
                      <Star className="h-4 w-4 text-subtle" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`text-sm font-medium ${isDone ? 'text-success' : 'text-text'}`}>
                        {task.name}
                      </span>
                      <span className="rounded-md bg-surface-elevated px-1.5 py-0.5 text-xs font-medium text-muted">
                        {TASK_TYPE_LABEL[task.task_type] ?? task.task_type}
                      </span>
                      {task.is_repeatable && (
                        <span className="rounded-md bg-signal-bg px-1.5 py-0.5 text-xs font-medium text-signal-strong">
                          Repeatable
                        </span>
                      )}
                      {task.requires_verification && (
                        <span className="rounded-md bg-warning-bg px-1.5 py-0.5 text-xs font-medium text-warning dark:text-primary">
                          Needs review
                        </span>
                      )}
                    </div>

                    {isDone && lastCompletion?.completed_at && (
                      <p className="mt-0.5 text-xs text-success">
                        Completed{' '}
                        {new Date(lastCompletion.completed_at).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
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

                  <div className="flex shrink-0 items-center gap-2">
                    <div className="flex items-center gap-0.5">
                      <Zap className={`h-3.5 w-3.5 ${isDone ? 'text-success' : 'text-primary'}`} />
                      <span className={`text-sm font-semibold ${isDone ? 'text-success' : 'text-muted'}`}>
                        +{task.zaps_value}
                      </span>
                    </div>
                    <CompleteButton
                      taskId={task.id}
                      isDone={isDone}
                      isRepeatable={task.is_repeatable ?? false}
                      requiresVerification={task.requires_verification ?? false}
                      isCrew={isCrew}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
