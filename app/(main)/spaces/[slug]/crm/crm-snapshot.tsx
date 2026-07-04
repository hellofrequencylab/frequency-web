import Link from 'next/link'
import { ArrowRight, Briefcase, CircleDollarSign, ListChecks, Lock } from 'lucide-react'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { getSpaceCapabilities, spaceHasEntitlement } from '@/lib/spaces/entitlements'
import { spaceFunctionAccessLive } from '@/lib/spaces/function-access'
import { getDeals, getContacts, countOpenTasks, computeMetrics, formatMoney } from '@/lib/crm/pipeline'
import { StatCard } from '@/components/ui/stat-card'
import { FeatureTierUpsell } from '@/components/pricing/feature-tier-upsell'

// COMPACT CRM SNAPSHOT for the profile fold-out (ADR-361 P3, CRM-STRATEGY §6/§7). A deliberately
// SMALL read-only peek at a Space's CRM, meant to sit inside a cramped inline fold-out on the profile.
// The small size is the point: it shows just enough (a tight stat row + a few contacts) to nudge the
// operator to open the full workspace or upgrade, never the whole board.
//
// It reuses the FULL board's gate exactly (app/(main)/spaces/[slug]/crm/page.tsx):
//   getCallerProfile -> getVisibleSpaceBySlug -> getSpaceCapabilities -> spaceFunctionAccessLive('crm').
// This surface is an OPTIONAL inline peek, not a destination, so it fails QUIET rather than 404-ing:
//   • missing / not-visible space           -> render nothing (null)
//   • viewer role too low (not owner/admin)  -> render nothing (null)
//   • space plan lacks the CRM entitlement   -> a small calm upsell card (billing link), not a wall
// Every read is fail-safe (lib/crm/pipeline.ts returns [] on error). Semantic DAWN tokens only, no
// hardcoded hex, sentence-case copy, no em or en dashes (CONTENT-VOICE §10).

const MAX_CONTACTS = 4

export async function SpaceCrmSnapshot({ slug }: { slug: string }) {
  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null

  // Resolve the space. A missing / not-visible space renders nothing (no existence leak, and this is
  // only an optional inline peek so there is no page to 404).
  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) return null

  const caps = await getSpaceCapabilities(space, viewerProfileId)
  // Same live gate as the board: folds the plan entitlement, the per-Space min-role, and the plan
  // ladder. When the viewer's role is too low we render nothing (the profile just omits the peek).
  const canUseCrm = await spaceFunctionAccessLive(space, 'crm', caps.role, space.plan)
  if (!canUseCrm) {
    // Split the reason the same way the board does: an owner/admin whose plan lacks the entitlement
    // sees the upsell; anyone whose role is simply too low sees nothing at all here.
    const hasCrm = spaceHasEntitlement(space, 'crm')
    if (!hasCrm) return <CrmUpsell slug={space.slug} plan={space.plan} canManage={caps.canManageMembers} />
    return null
  }

  // Owner/admin on a plan with CRM: the compact snapshot. All reads are fail-safe ([] on error).
  const [deals, contacts, tasksDue] = await Promise.all([
    getDeals(space.id),
    getContacts(space.id, MAX_CONTACTS),
    countOpenTasks(space.id),
  ])
  const metrics = computeMetrics(deals, tasksDue)
  const boardHref = `/spaces/${space.slug}/crm`

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-surface p-4 shadow-sm">
      {/* A tight stat row: just the three numbers that read at a glance. */}
      <div className="grid grid-cols-3 gap-2">
        <StatCard size="sm" label="Open deals" value={metrics.openCount} icon={Briefcase} />
        <StatCard size="sm" label="Open value" value={formatMoney(metrics.openValue)} icon={CircleDollarSign} />
        <StatCard size="sm" label="Tasks due" value={metrics.tasksDue} icon={ListChecks} />
      </div>

      {/* A short list of the most recent contacts (name + one line). Not the full roster. */}
      {contacts.length > 0 && (
        <ul className="divide-y divide-border rounded-xl bg-surface-elevated/40">
          {contacts.map((c) => (
            <li key={c.id} className="px-3 py-2">
              <p className="truncate text-sm font-medium text-text">
                {c.display_name || c.email || 'Unnamed contact'}
              </p>
              {c.display_name && c.email && <p className="truncate text-xs text-muted">{c.email}</p>}
            </li>
          ))}
        </ul>
      )}

      {/* The prominent way out to the real thing. */}
      <Link
        href={boardHref}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:text-primary-hover"
      >
        Open the full CRM workspace
        <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
    </section>
  )
}

// The small calm upsell shown to an owner/admin whose plan does not include CRM. Same tone as the
// board's locked state, trimmed to fit the fold-out, with a link to this space's billing. For a manager
// it also shows the reusable tier range + placeholder price points (ADR-518 Phase G); the CTA never
// charges.
function CrmUpsell({ slug, plan, canManage }: { slug: string; plan?: string | null; canManage?: boolean }) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 rounded-lg bg-surface-elevated p-2 text-muted">
          <Lock className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-semibold text-text">Unlock a CRM for this space</p>
          <p className="text-xs text-muted">
            Turn the people you meet into a pipeline you can work: stages, deals, and contacts you bring
            over from My Contacts. It is part of a paid plan for this space.
          </p>
          <Link
            href={`/spaces/${slug}/settings/billing`}
            className="inline-flex items-center gap-1.5 pt-1 text-sm font-semibold text-primary hover:text-primary-hover"
          >
            See plans
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </div>
      {canManage && (
        <FeatureTierUpsell featureKey="space_crm" currentTier={plan} upgradeHref={`/spaces/${slug}/settings/billing`} />
      )}
    </section>
  )
}
