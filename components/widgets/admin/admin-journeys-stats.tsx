import { Map, BookOpen, Users, Inbox } from 'lucide-react'
import { getAdminJourneysContext } from '@/lib/admin/journeys-context'
import { AdminSection } from '@/components/templates'
import { StatCard } from '@/components/ui/stat-card'

// Admin Journeys layout module (ADR-270/294): the four headline counts for the Journey library —
// total in the library, awaiting review, official, and active adoptions. Self-fetching RSC; reads
// the shared (request-cached) admin Journeys context.
export async function AdminJourneysStats() {
  const { journeys, pending, officialCount, adoptionCount } = await getAdminJourneysContext()

  return (
    <AdminSection>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="In the library" value={journeys.length} icon={BookOpen} />
        <StatCard label="Awaiting review" value={pending.length} icon={Inbox} />
        <StatCard label="Official" value={officialCount} icon={Map} />
        <StatCard label="Active adoptions" value={adoptionCount} icon={Users} />
      </div>
    </AdminSection>
  )
}
