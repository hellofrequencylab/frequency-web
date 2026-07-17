// Resonance CRM — Tasks (ADR-628). The operator follow-up board: a KPI band (open / overdue / snoozed)
// over a filterable list with create / complete / snooze. Staff-gated like its CRM siblings; the list
// + counts are computed server-side (the pure filter/summarize core, lib/crm/tasks.ts) and handed to a
// thin client workspace. Uses AdminTemplate (the /admin dashboard shell) like every other CRM leaf.

import { CheckSquare, Clock, ListTodo, AlarmClock } from 'lucide-react'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { StatCard } from '@/components/ui/stat-card'
import { requireAdmin } from '@/lib/admin/guard'
import { loadRootSpaceId } from '@/lib/spaces/store'
import { listTasks, summarizeTasks } from '@/lib/crm/tasks'
import { TasksWorkspace } from '@/components/admin/crm/tasks-workspace'

export const dynamic = 'force-dynamic'

export default async function CrmTasksPage() {
  const { profileId } = await requireAdmin('janitor', { staff: 'marketing' })
  const spaceId = (await loadRootSpaceId()) ?? undefined
  const tasks = await listTasks({ spaceId, limit: 500 })
  const counts = summarizeTasks(tasks)

  return (
    <AdminTemplate
      eyebrow="CRM"
      title="Tasks"
      icon={ListTodo}
      width="wide"
      description="Your follow-up list. Queue a call-back, mark it done, or snooze it for later."
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Open" value={counts.open} icon={CheckSquare} bordered />
        <StatCard label="Overdue" value={counts.overdue} icon={AlarmClock} bordered />
        <StatCard label="Snoozed" value={counts.snoozed} icon={Clock} bordered />
        <StatCard label="Done" value={counts.done} icon={CheckSquare} bordered />
      </div>

      <AdminSection>
        <TasksWorkspace tasks={tasks} viewerId={profileId} />
      </AdminSection>
    </AdminTemplate>
  )
}
