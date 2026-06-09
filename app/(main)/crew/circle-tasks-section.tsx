// Circle tasks — the member-facing surface for the assignment model
// (BUILD-LIST P4.7). Server Component: resolves the viewer's capabilities for
// the circle and renders affordances accordingly — Claim for paid active
// members (task.claim), Release for the claimer or the host
// (circle.assignTask), and the EXISTING CompleteButton for the claimer so
// completion stays on the crew_completions flow unchanged.

import Image from 'next/image'
import Link from 'next/link'
import { ClipboardList, Settings2 } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCircleCapabilities } from '@/lib/core/load-capabilities'
import { listCircleTasks } from '@/lib/crew/circle-tasks'
import { getInitials } from '@/lib/utils'
import { SectionHeader } from '@/components/ui/section-header'
import { CompleteButton } from './complete-button'
import { ClaimTaskButton, ReleaseTaskButton } from './circle-task-controls'

const TASK_TYPE_LABEL: Record<string, string> = {
  attendance:   'Attendance',
  hosting:      'Hosting',
  volunteering: 'Volunteering',
  content:      'Content',
  referral:     'Referral',
  other:        'Other',
}

export async function CircleTasksSection({
  circleId,
  circleName,
  viewerProfileId,
  isCrew,
}: {
  circleId: string
  circleName: string | null
  viewerProfileId: string
  isCrew: boolean
}) {
  const [tasks, caps] = await Promise.all([
    listCircleTasks(circleId),
    getCircleCapabilities(circleId),
  ])
  if (tasks.length === 0) return null

  const canClaim  = caps.has('task.claim')
  const canAssign = caps.has('circle.assignTask')

  // Which of MY claimed tasks here are already completed (drives the existing
  // CompleteButton's done state — completion itself is the unchanged flow).
  const myTaskIds = tasks.filter((t) => t.assignedTo === viewerProfileId).map((t) => t.id)
  const doneTaskIds = new Set<string>()
  if (myTaskIds.length > 0) {
    const admin = createAdminClient()
    const { data: myCompletions } = await admin
      .from('crew_completions')
      .select('task_id')
      .eq('profile_id', viewerProfileId)
      .in('task_id', myTaskIds)
    ;(myCompletions ?? []).forEach((c) => { if (c.task_id) doneTaskIds.add(c.task_id) })
  }

  return (
    <section>
      <SectionHeader
        title={circleName ? `Circle tasks · ${circleName}` : 'Circle tasks'}
        count={tasks.length}
        action={canAssign ? (
          <Link
            href="/admin/crew-tasks"
            className="inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-text transition-colors"
          >
            <Settings2 className="w-3.5 h-3.5" /> Manage
          </Link>
        ) : undefined}
      />

      <div className="space-y-1.5">
        {tasks.map((task) => {
          const mine    = task.assignedTo === viewerProfileId
          const claimed = task.assignedTo !== null
          const isDone  = doneTaskIds.has(task.id)

          return (
            <div
              key={task.id}
              className={`rounded-2xl px-4 py-3 flex items-start gap-3 ${
                mine ? 'bg-primary-bg/40 dark:bg-primary-bg/15' : 'bg-surface-elevated/60'
              }`}
            >
              <div className="flex items-center justify-center w-8 h-8 rounded-lg shrink-0 bg-surface-elevated">
                <ClipboardList className={`w-4 h-4 ${claimed ? 'text-primary' : 'text-subtle'}`} />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-text">{task.name}</span>
                  <span className="text-xs px-1.5 py-0.5 rounded-md bg-surface-elevated text-muted font-medium">
                    {TASK_TYPE_LABEL[task.taskType] ?? task.taskType}
                  </span>
                  {task.requiresVerification && (
                    <span className="text-xs px-1.5 py-0.5 rounded-md bg-warning-bg text-warning dark:text-primary font-medium">
                      Needs review
                    </span>
                  )}
                </div>

                {/* Assignment state */}
                {claimed ? (
                  <span className="mt-1 flex items-center gap-1.5">
                    {task.assignee?.avatarUrl ? (
                      <Image
                        src={task.assignee.avatarUrl}
                        alt={task.assignee.displayName}
                        width={16}
                        height={16}
                        className="w-4 h-4 rounded-full object-cover shrink-0"
                      />
                    ) : (
                      <span className="w-4 h-4 rounded-full bg-primary-bg text-primary-strong text-xs font-semibold flex items-center justify-center shrink-0 select-none">
                        {getInitials(task.assignee?.displayName ?? '?')}
                      </span>
                    )}
                    <span className="text-xs text-muted">
                      {mine ? 'Claimed by you' : `Claimed by ${task.assignee?.displayName ?? 'a member'}`}
                      {task.claimedAt && (
                        <> · {new Date(task.claimedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</>
                      )}
                    </span>
                  </span>
                ) : (
                  <p className="mt-1 text-xs text-subtle">
                    Open — {canClaim ? 'claim it to take this on for your circle.' : 'a Crew member can claim this.'}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <span className="text-sm font-semibold text-muted">+{task.zapsValue}</span>
                {!claimed && canClaim && <ClaimTaskButton taskId={task.id} />}
                {mine && (
                  <>
                    <CompleteButton
                      taskId={task.id}
                      isDone={isDone}
                      isRepeatable={task.isRepeatable}
                      requiresVerification={task.requiresVerification}
                      isCrew={isCrew}
                    />
                    {!isDone && <ReleaseTaskButton taskId={task.id} />}
                  </>
                )}
                {!mine && claimed && canAssign && <ReleaseTaskButton taskId={task.id} />}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
