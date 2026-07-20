import Link from 'next/link'
import { ArrowLeft, ArrowUpRight, Users, Megaphone, ShoppingBag, GraduationCap, SlidersHorizontal, CircleDollarSign, Send, ListChecks, type LucideIcon } from 'lucide-react'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess } from '@/lib/spaces/entitlements'
import { getDeals, getContacts, countOpenTasks, computeMetrics, formatMoney } from '@/lib/crm/pipeline'
import { getSpaceEmailStats } from '@/lib/spaces/email-analytics'
import { SPACE_HUB_SECTIONS, type SpaceHubSection } from '@/lib/admin/modules/space-hub'
import { StatCard } from '@/components/ui/stat-card'
import { SpaceManageBoard } from './manage-board'

// THE MANAGE DASHBOARD (the `?panel=manage` body). The Space "Manage" menu item soft-navigates here, so
// this swaps ONLY the profile body while the hero + menu stay put (no reload). Two modes:
//   • no `area`  → the LANDING: a quick-stats row (community · money · email · activity) + link cards to
//                  the five management areas (Community / Marketing / Offerings & Money / Content &
//                  Programs / Profile & Settings). Each card soft-navigates to `?panel=manage&area=<key>`.
//   • an `area`  → that area, rendered by the SHARED console board (SpaceManageBoard section=<key>) so the
//                  Community area IS the full CRM, Marketing IS the marketing dashboard, etc. One catalog,
//                  one gate, no duplicate surface (the retired /crm page's functions live here).
//
// Chrome-free + self-gating like every other panel body (space-body-panel.tsx): it re-resolves the Space
// and gates RENDER on resolveSpaceManageAccess, rendering nothing for a non-manager. Every stat read is
// fail-safe (returns zero/empty on error), so the dashboard never breaks. DAWN tokens, no em dashes.

const SECTION_ICON: Record<SpaceHubSection, LucideIcon> = {
  resonance: Users,
  marketing: Megaphone,
  offerings: ShoppingBag,
  programs: GraduationCap,
  settings: SlidersHorizontal,
}

export async function ManageDashboard({ slug, area }: { slug: string; area?: string }) {
  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null

  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) return null
  const { canManage, staffViewing } = await resolveSpaceManageAccess(space, viewerProfileId, caller?.webRole)
  if (!canManage && !staffViewing) return null

  // AREA view: hand off to the shared console board for that section. The Community (resonance) section
  // embeds the full space CRM, Marketing the marketing dashboard, the rest their gated module cards.
  const section = SPACE_HUB_SECTIONS.find((s) => s.key === area)
  if (section) {
    return (
      <div className="space-y-4">
        <Link
          href={`/spaces/${slug}?panel=manage`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-text"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden /> All areas
        </Link>
        <SpaceManageBoard slug={slug} section={section.key} />
      </div>
    )
  }

  // LANDING: the quick-stats row + the five area cards. All four reads are fail-safe.
  const [deals, contacts, tasksDue, email] = await Promise.all([
    getDeals(space.id),
    getContacts(space.id),
    countOpenTasks(space.id),
    getSpaceEmailStats(space.id),
  ])
  const metrics = computeMetrics(deals, tasksDue)
  const stats: { label: string; value: string | number; icon: LucideIcon }[] = [
    { label: 'Contacts', value: contacts.length, icon: Users },
    { label: 'Open value', value: formatMoney(metrics.openValue), icon: CircleDollarSign },
    { label: 'Emails sent', value: email.sent, icon: Send },
    { label: 'Tasks due', value: metrics.tasksDue, icon: ListChecks },
  ]

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s) => (
          <StatCard key={s.label} label={s.label} value={s.value} icon={s.icon} />
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {SPACE_HUB_SECTIONS.map((s) => {
          const Icon = SECTION_ICON[s.key]
          return (
            <Link
              key={s.key}
              href={`/spaces/${slug}?panel=manage&area=${s.key}`}
              className="group flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4 shadow-sm transition-colors hover:border-primary"
            >
              <span className="flex items-center justify-between">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-bg text-primary-strong">
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <ArrowUpRight className="h-4 w-4 text-subtle transition-colors group-hover:text-primary-strong" aria-hidden />
              </span>
              <span className="text-base font-semibold text-text">{s.label}</span>
              <span className="text-sm leading-relaxed text-muted">{s.blurb}</span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
