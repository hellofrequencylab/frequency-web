// ─────────────────────────────────────────────────────────────────────────────
// THE EVENT SEEDER — the operator console landing (ADR-989). The events counterpart to the
// Business Seeder: everything a chat export or a flyer scan staged, waiting to be reviewed
// and seeded.
//
// SERVER COMPONENT (PAGE-FRAMEWORK §5): gates entry, reads the operator's staged events, and
// composes the kit — AdminTemplate / AdminSection / StatCard / EntityCard / EmptyState. No
// hand-rolled layout, semantic tokens only.
// ─────────────────────────────────────────────────────────────────────────────

import Link from 'next/link'
import { CalendarDays } from 'lucide-react'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { StatCard } from '@/components/ui/stat-card'
import { buttonClasses } from '@/components/ui/button'
import { requireAdmin } from '@/lib/admin/guard'
import { listStagedEvents } from './actions'
import { IntakeList } from './intake-list'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Event Seeder' }

export default async function EventSeederPage() {
  // The same union the actions re-check: platform staff, or a community staff role that writes.
  await requireAdmin('admin', { staff: 'community', staffLevel: 'write' })

  const items = await listStagedEvents()
  const counts = {
    review: items.filter((i) => i.status === 'review').length,
    applied: items.filter((i) => i.status === 'applied').length,
    aside: items.filter((i) => i.status === 'failed').length,
  }

  return (
    <AdminTemplate
      title="Event Seeder"
      eyebrow="Community"
      icon={CalendarDays}
      description="Events a chat export or a flyer scan found, waiting on you. Check each field against the message it came from, fix what the read got wrong, then seed it. A seeded event is an unlisted draft until you publish it."
      width="wide"
      actions={
        <Link href="/admin/import" className={buttonClasses('secondary', 'sm')}>
          Import from chat
        </Link>
      }
    >
      <AdminSection title="At a glance" description="Where your staged events stand.">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatCard bordered label="⚠️ Needs review" value={counts.review} detail="waiting on you" href="#staged" />
          <StatCard bordered label="✅ Seeded" value={counts.applied} detail="unlisted drafts" />
          <StatCard bordered label="🔴 Set aside" value={counts.aside} detail="not seeded" />
        </div>
      </AdminSection>

      <div id="staged" className="scroll-mt-24">
        <AdminSection
          title="Staged events"
          description="Newest first. Open one to check its facts and seed it."
        >
          <IntakeList items={items} />
        </AdminSection>
      </div>
    </AdminTemplate>
  )
}
