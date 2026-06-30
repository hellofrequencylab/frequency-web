import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { SectionHeader } from '@/components/ui/section-header'
import { DangerDelete } from '@/components/admin/danger-delete'
import { deleteSpace } from '@/lib/spaces/provision'
import type { SpaceSurface } from '@/lib/admin/entities/registry'

// The render boundary for the Space owner console (ADR-441 EM1-3). The page (an RSC) resolves the
// Space + gates server-side and hands this the spine surfaces it should show; this layer binds each
// surface id to the EXISTING settings sub-page that already serves it. No feature is rebuilt: every
// section is a link into a working /spaces/[slug]/settings sub-page (or the CRM board), so this is a
// pure harmonization of navigation onto the unified spine. Mirrors the circle console's module-map
// pattern (the registry stays pure metadata; the binding lives here), except a Space's surfaces are
// gated by the per-Space function world, so the binding is a HREF, not a unified-Scope module.
//
// This is a Server Component (no client state needed): the sections are links, and the one
// interactive control (Danger's delete) is the existing client <DangerDelete> rendered with a bound
// server action, exactly as the legacy cockpit binds it.

/** Map a surface id to the sub-page it opens, given the Space slug. Danger has no href (it renders
 *  its delete control inline); an unmapped id is skipped (defensive, should not happen). */
function hrefForSurface(id: string, slug: string): string | null {
  const base = `/spaces/${slug}`
  switch (id) {
    case 'space.basics':
      return `${base}/settings`
    case 'space.place':
      return `${base}/settings/availability`
    case 'space.people':
      return `${base}/settings/members`
    case 'space.engage.crm':
      return `${base}/crm`
    case 'space.engage.donations':
      return `${base}/settings/donations`
    case 'space.engage.enroll':
      return `${base}/settings/enroll`
    case 'space.reach':
      return `${base}/settings/qr`
    case 'space.comms':
      return `${base}/settings/email`
    case 'space.insights':
      // Analytics live alongside the QR codes surface today (no standalone insights sub-page yet).
      return `${base}/settings/qr`
    case 'space.billing':
      return `${base}/settings/billing`
    case 'space.danger':
      return null
    default:
      return null
  }
}

/** One spine section as a tappable link card into its existing settings sub-page. */
function LinkSection({ surface, href }: { surface: SpaceSurface; href: string }) {
  return (
    <section>
      <SectionHeader title={surface.label} />
      <p className="-mt-2 mb-3 text-sm text-muted">{surface.desc}</p>
      <Link
        href={href}
        className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-5 shadow-sm transition-colors hover:border-border-strong hover:bg-surface-elevated"
      >
        <span className="min-w-0 flex-1 text-sm font-medium text-text">Open {surface.label.toLowerCase()}</span>
        <ChevronRight className="h-4 w-4 shrink-0 text-subtle" aria-hidden />
      </Link>
    </section>
  )
}

export function SpaceManageConsole({
  slug,
  surfaces,
  canDelete,
  spaceId,
}: {
  slug: string
  surfaces: SpaceSurface[]
  /** Whether the Danger section renders its delete control (owner / staff); else header-only. */
  canDelete: boolean
  spaceId: string
}) {
  return (
    <>
      {surfaces.map((surface) => {
        // Danger is the one non-link section: it shows the existing delete control for an owner /
        // staff viewer, and header-only otherwise (mirrors circle's Danger surface).
        if (surface.id === 'space.danger') {
          return (
            <section key={surface.id}>
              <SectionHeader title={surface.label} />
              <p className="-mt-2 mb-3 text-sm text-muted">{surface.desc}</p>
              {canDelete ? (
                <DangerDelete
                  entity="space"
                  warning="Permanently deletes this space and everything it owns: all its events (with their RSVPs and check-ins), members, circles, pages, and CRM. This cannot be undone."
                  onDelete={deleteSpace.bind(null, spaceId)}
                  redirectTo="/spaces"
                  confirmText="DELETE"
                />
              ) : null}
            </section>
          )
        }

        const href = hrefForSurface(surface.id, slug)
        if (!href) return null
        return <LinkSection key={surface.id} surface={surface} href={href} />
      })}
    </>
  )
}
