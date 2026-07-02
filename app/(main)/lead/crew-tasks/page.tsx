import { requireLeadFloor } from '@/lib/admin/guard'
import { DashboardTemplate } from '@/components/templates'
import { EmptyState } from '@/components/ui/empty-state'
import { getLedCircles } from '../load-led-circles'
import { listCircleTasksByCircle } from '@/lib/crew/circle-tasks'
import { CircleTasksPanel, type HostedCircleTasks } from '@/app/(main)/admin/crew-tasks/circle-tasks-panel'

// Crew tasks under Leadership (ADR-266): the leader-facing surface for the internal
// volunteer tasks that support a leader's circles. /admin/crew-tasks is STAFF-ONLY (it
// also carries the global catalogue + verification queue), so community leaders manage
// their circles' tasks here instead. Reuses the host-side CircleTasksPanel; every write
// re-checks circle.assignTask in the server action (the panel is affordance only).
//
// Scope: circles the caller HOSTS (host_id = me) — crew tasks are circle-internal and
// managed by that circle's host, so we read the hosted set regardless of global rung.
export const metadata = {
  title: 'Crew tasks',
  description: 'Internal volunteer tasks that support the circles you host.',
}

export default async function LeadershipCrewTasksPage() {
  const { profileId } = await requireLeadFloor()

  const hosted = await getLedCircles(profileId)
  // PERF-3: one batched read for every hosted circle, not one query per circle.
  const tasksByCircle = await listCircleTasksByCircle(hosted.map((c) => c.id))
  const circles: HostedCircleTasks[] = hosted.map((c) => ({
    id: c.id,
    name: c.name,
    tasks: tasksByCircle.get(c.id) ?? [],
  }))

  return (
    <DashboardTemplate
      eyebrow="Leadership"
      title="Crew tasks"
      description="Internal volunteer tasks that support your circles. Create a task, see who claimed it, or release a stalled claim. One Crew member claims a task at a time and completes it on their dashboard."
      width="default"
    >
      {circles.length === 0 ? (
        <EmptyState
          title="No circles to assign tasks for yet"
          description="Crew tasks are scoped to a circle you host. When you host a circle, you can create tasks here for its Crew to claim and earn Zaps."
        />
      ) : (
        <CircleTasksPanel circles={circles} />
      )}
    </DashboardTemplate>
  )
}
