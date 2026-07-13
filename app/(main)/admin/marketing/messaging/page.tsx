// The unified Messaging console (EMAIL-CAMPAIGNS-FUNNELS-PLAN P1, ask #1/#4). ONE home
// for the two things an operator creates: a Campaign (one email, sent now or scheduled)
// and a Funnel (a triggered journey of emails). It folds the scattered listing surfaces
// (the campaigns list + the funnels list) under one roof with a shared status legend,
// KPI counts, and quick actions. It does NOT replace the working editors: every row
// links out to the composer / the flow view. Composes the kit (AdminTemplate + StatCard
// + AdminSection). Gate: a staff web_role OR the marketing capability, re-checked here
// and in every action.

import Link from 'next/link'
import { Send, Megaphone, Activity, Rocket, FileEdit, Clock } from 'lucide-react'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { StatCard } from '@/components/ui/stat-card'
import { buttonClasses } from '@/components/ui/button'
import { requireAdmin } from '@/lib/admin/guard'
import { getMessagingConsole } from '@/lib/messaging/console'
import { MessagingConsole, MessagingQuickLinks } from '@/components/admin/messaging/messaging-console'

export const dynamic = 'force-dynamic'

export default async function MessagingPage() {
  await requireAdmin('admin', { staff: 'marketing' })
  const { campaigns, funnels, counts } = await getMessagingConsole()

  return (
    <AdminTemplate
      eyebrow="Marketing"
      title="Messaging"
      icon={Send}
      width="wide"
      description="Two things live here: a Campaign is one email you send now or schedule, and a Funnel is a series of emails that fires from a trigger. Start from a best-practice template, let Vera draft it, or build it by hand."
      actions={
        <Link href="/admin/marketing/messaging/new" className={buttonClasses('primary', 'sm')}>
          New message
        </Link>
      }
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Campaigns" value={counts.campaigns} icon={Megaphone} />
        <StatCard label="Funnels" value={counts.funnels} icon={Activity} />
        <StatCard label="Live" value={counts.live} icon={Rocket} />
        <StatCard label="Scheduled" value={counts.scheduled} icon={Clock} />
        <StatCard label="Drafts" value={counts.drafts} icon={FileEdit} />
      </div>

      <AdminSection
        title="Everything you send"
        description="Campaigns and funnels in one place, colored by status."
        actions={<MessagingQuickLinks />}
      >
        <MessagingConsole campaigns={campaigns} funnels={funnels} />
      </AdminSection>
    </AdminTemplate>
  )
}
