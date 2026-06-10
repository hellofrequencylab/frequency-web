// Server section: the Posted events oversight area of /admin/events. Stat row
// (posted / unclaimed / claimed / removed) over the management table, with a calm
// empty state before the first poster is ever scanned. Rendered behind its own
// <Suspense> on the page so the posted-events read never blocks the shell.

import { CalendarDays, Link2, ScanLine, Trash2, UserCheck } from 'lucide-react'
import { StatCard } from '@/components/ui/stat-card'
import { EmptyState } from '@/components/ui/empty-state'
import { getPostedAdminData } from './load-posted'
import { PostedEventsTable } from './posted-events-table'

export async function PostedEventsSection({ canManage }: { canManage: boolean }) {
  const { rows, stats } = await getPostedAdminData()

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard bordered label="Posted" value={stats.posted} icon={ScanLine} detail="published from posters" />
        <StatCard bordered label="Unclaimed" value={stats.unclaimed} icon={Link2} detail="claim invite outstanding" />
        <StatCard bordered label="Claimed" value={stats.claimed} icon={UserCheck} detail="organizer took over" />
        <StatCard bordered label="Removed" value={stats.removed} icon={Trash2} detail="pulled by staff" />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="No posted events yet"
          description="When a member scans a town poster and publishes it, the event and its claim link land here."
        />
      ) : (
        <PostedEventsTable rows={rows} canManage={canManage} />
      )}
    </div>
  )
}
