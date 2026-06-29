import { BookOpen, Inbox, Star, Globe, Activity } from 'lucide-react'
import { StatCard } from '@/components/ui/stat-card'
import { getAdminPracticesContext } from '@/lib/admin/practices-context'

// Admin practices layout module (ADR-270/294): the headline StatCard band for the curation
// workspace — library size, public, awaiting review, featured, and the never-logged gap. Was the
// DashboardTemplate `stats` slot; it's now a movable block so an operator can place it anywhere
// (the recipe prefers stats AS a module). Self-fetching RSC; reads the shared, request-cached
// admin practices context (lib/admin/practices-context.ts), so the stats + library share one read.
export async function PracticeAdminStats() {
  const { stats } = await getAdminPracticesContext()

  return (
    <div className="grid grid-cols-2 gap-3 @2xl:grid-cols-5">
      <StatCard label="In the library" value={stats.inLibrary} icon={BookOpen} href="/practices" />
      <StatCard label="Public" value={stats.publicCount} icon={Globe} />
      <StatCard label="Awaiting review" value={stats.pendingCount} icon={Inbox} />
      <StatCard label="Featured" value={stats.featuredCount} icon={Star} />
      <StatCard label="Never logged" value={stats.neverLogged} icon={Activity} detail="a gap to fix" />
    </div>
  )
}
