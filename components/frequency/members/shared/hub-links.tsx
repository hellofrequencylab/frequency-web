import Link from 'next/link'
import '@/app/themes/active/kit-members'
import '@/app/themes/active/members-c'
import { getCachedViewerProfile } from '@/lib/auth'
import { applyViewAs, viewingAsVisitor } from '@/lib/view-as'
import { getStaffMember } from '@/lib/staff'
import { getViewerHats } from '@/lib/core/viewer-hats'
import { accessTo, type Hats, type Surface } from '@/lib/core/access-matrix'
import { meetsAccess, NAV_AREAS } from '@/lib/nav-areas'
import { AREA_NAV_KEY, MARKET_AREAS, browsableAreas } from '@/lib/marketplace/visibility'
import { hasOperatedSpaces } from '@/lib/spaces/operated'
import type { CommunityRole } from '@/lib/core/roles'
import type { FqHubLink, FqMenuViewer } from '@/components/frequency/members/shell/nav'

// THE HUB'S "MORE IN" ROW (navigation framework, owner-approved 2026-10-14). Menus stay short and the
// long tail of each area is one click from its hub page: this row, drawn by the hub's Frequency body,
// names the hub's other places as kit chips.
//
// ONE LIST. The children are the shell's HUB_LINKS (components/frequency/members/shell/nav.ts), read
// through `hubLinks(hub, viewer)` at each call site, so nav.ts stays the single source and the nav
// coverage guard sees every hub page draw its own. This file only resolves the viewer and draws.
//
// GATED LIKE THE MENUS. The viewer is rebuilt the way app/(main)/layout.tsx builds the shell's: each
// NAV_AREAS key's access from the matrix on the view-as hats (a visitor preview gates as a visitor),
// the marketplace areas this viewer may not browse switched off, and `host` on the view-as role. A
// Space's per-vertical nav hides are the one layout input not repeated (no hub child is a vertical's
// area). Every href is a live route; nothing here carries a count.

/** A viewer for a page that must not read the request (a statically generated page): no navAccess,
 *  so only ungated children show. */
export const STATIC_HUB_VIEWER: FqMenuViewer = { operatesSpaces: false, host: false }

function navAccessFor(hats: Hats): Record<string, string> {
  return Object.fromEntries(NAV_AREAS.map((a) => [a.key, a.surface ? accessTo(a.surface as Surface, hats) : 'full']))
}

/** The shell's viewer, rebuilt for a hub body (request-cached reads the layout already made). */
export async function hubViewer(): Promise<FqMenuViewer> {
  const profile = await getCachedViewerProfile()
  if (!profile) return { navAccess: navAccessFor({ loggedIn: false }), operatesSpaces: false, host: false }
  const realRole = (profile.community_role ?? 'member') as CommunityRole
  const [effectiveRole, previewVisitor, realHats, staffMember, operatesRaw, areas] = await Promise.all([
    applyViewAs(realRole),
    viewingAsVisitor(realRole),
    getViewerHats(),
    getStaffMember().catch(() => null),
    hasOperatedSpaces(profile.id),
    browsableAreas(),
  ])
  const previewingDown = previewVisitor || effectiveRole !== realRole
  const navAccess = navAccessFor(
    previewVisitor
      ? { loggedIn: false }
      : {
          loggedIn: true,
          role: effectiveRole,
          tier: realHats.tier,
          personas: previewingDown ? [] : realHats.personas,
          staff: previewingDown ? null : (staffMember?.role ?? null),
        },
  )
  for (const area of MARKET_AREAS) if (!areas.includes(area)) navAccess[AREA_NAV_KEY[area]] = 'none'
  return {
    navAccess,
    operatesSpaces: previewingDown ? false : operatesRaw,
    host: meetsAccess('host', previewVisitor ? null : effectiveRole),
  }
}

/** The row itself: plain data in, chips out. Nothing when the viewer has no children to see. */
export function HubLinkRow({ title, links, boxed = false }: { title: string; links: readonly FqHubLink[]; boxed?: boolean }) {
  if (links.length === 0) return null
  const label = `More in ${title}`
  return (
    <nav data-kit="members" className={boxed ? 'panel stack mc-gap-12' : 'sec stack mc-gap-12'} aria-label={label}>
      <span className="k">{label}</span>
      <div className="chips">
        {links.map((l) => (
          <Link key={l.href} className="chip" href={l.href}>
            {l.label}
          </Link>
        ))}
      </div>
    </nav>
  )
}

/**
 * A hub body's row. `links` is the call site's `(v) => hubLinks('<hub>', v)`, so each hub page names
 * its own hub (and may drop a child for a page-level reason it already reads, a flag that is off, say).
 */
export async function HubLinks({
  title,
  links,
  boxed,
}: {
  title: string
  links: (viewer: FqMenuViewer) => FqHubLink[]
  /** In a side column: a panel instead of a section. */
  boxed?: boolean
}) {
  return <HubLinkRow title={title} links={links(await hubViewer())} boxed={boxed} />
}
