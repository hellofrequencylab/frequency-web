import { Building2, Sparkles, UserRound, Users } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { StatCard } from '@/components/ui/stat-card'
import { EmptyState } from '@/components/ui/empty-state'
import { loadContactsRoster, CONTACT_SORT_OPTIONS } from '@/lib/crm/contacts-roster'
import { ContactsRosterClient } from './contacts-roster-client'

// THE CRM CONTACTS TAB (Resonance CRM · ADR-625): the whole roster in one place. Members,
// subscribers, and imported leads, each read through the classifier (status / community role /
// business standing / activity / Spaces / relationship kinds) with plenty of sorting + faceting, plus
// the R5 "ready for a Business Space" upgrade segment. This is a browse Index: a server shell that
// batch-loads + classifies the cohort (no N+1 across members + leads), a StatCard row for the
// headline read, and a thin client island for the live search / sort / facets.
//
// STAFF-GATED: requireAdmin('janitor', { staff: 'marketing' }), matching the sibling CRM tabs. The
// /admin/* group mounts its own info rail (page-chrome 'none'), so no rail registration is needed.
export const dynamic = 'force-dynamic'

export default async function CrmContactsPage() {
  await requireAdmin('janitor', { staff: 'marketing' })

  const { rows, facets, stats } = await loadContactsRoster({ limit: 500 })

  return (
    <AdminTemplate
      eyebrow="CRM"
      title="Contacts"
      icon={UserRound}
      description="Everyone we know: members, subscribers, and imported leads. Sort and filter by status, role, Space, relationship, and business standing, and spot members ready for a Business Space."
      width="wide"
    >
      <AdminSection>
        {rows.length === 0 ? (
          <EmptyState
            variant="first-use"
            icon={Users}
            title="No contacts yet"
            description="As people join, subscribe, or get imported, they will show up here."
          />
        ) : (
          <div className="flex flex-col gap-5">
            {/* The headline read: the shape of the roster at a glance. */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard label="All contacts" value={stats.total.toLocaleString()} icon={Users} />
              <StatCard
                label="Members"
                value={stats.members.toLocaleString()}
                icon={UserRound}
                detail={`${stats.subscribers.toLocaleString()} subscribers · ${stats.leads.toLocaleString()} leads`}
              />
              <StatCard label="Businesses" value={stats.businesses.toLocaleString()} icon={Building2} />
              <StatCard
                label="Ready for Business"
                value={stats.upgradeCandidates.toLocaleString()}
                icon={Sparkles}
                detail="Members who behave like a business in the making"
              />
            </div>

            <ContactsRosterClient rows={rows} facets={facets} sortOptions={CONTACT_SORT_OPTIONS} />
          </div>
        )}
      </AdminSection>
    </AdminTemplate>
  )
}
