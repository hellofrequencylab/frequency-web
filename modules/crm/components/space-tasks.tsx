import { getSpaceTasks, partitionTasks, getDeals, getContacts } from '@/lib/crm/pipeline'
import { SpaceTasksPanel } from './space-tasks-panel'

// PER-SPACE TASKS (server wrapper, CRM-STRATEGY §6/§7). A self-fetching server component that reads
// THIS Space's tasks (crm_activities kind='task', scoped by space_id), splits them into open (due-soon
// first) + done with the pure partitionTasks helper, and hands them to the client panel for create /
// edit / complete / reopen / delete. It also passes the Space's deals + contacts as the optional link
// targets the create form offers. All reads are space-scoped + fail-safe (lib/crm/pipeline.ts). The
// writes the panel calls are owner-gated + space-scoped server-side (lib/crm/space-tasks.ts), so the
// panel is convenience, not the gate. readOnly suppresses every write affordance (staff preview).

export async function SpaceTasks({
  spaceId,
  slug,
  readOnly = false,
}: {
  spaceId: string
  slug: string
  readOnly?: boolean
}) {
  const [tasks, deals, contacts] = await Promise.all([
    getSpaceTasks(spaceId),
    getDeals(spaceId),
    getContacts(spaceId),
  ])
  const { open, done } = partitionTasks(tasks)

  return (
    <SpaceTasksPanel
      spaceId={spaceId}
      slug={slug}
      open={open}
      done={done}
      dealOptions={deals.map((d) => ({ id: d.id, label: d.title }))}
      contactOptions={contacts.map((c) => ({
        id: c.id,
        label: c.display_name || c.email || 'Unnamed contact',
      }))}
      readOnly={readOnly}
    />
  )
}
