import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCircleCapabilities } from '@/lib/core/load-capabilities'

// LEADER CRM ACCESS (CRM Everywhere plan Phase 4 / ADR-827). The ONE slug -> entity -> capability
// resolver behind the Message Circle CRM surface, so the page and its colocated server actions gate
// through the SAME code path (never two hand-copied gates that can drift). Mirrors the manage page
// exactly: resolve by slug with the admin client (archived excluded, same as
// /circles/[slug]/manage), then the one capability resolver (getCircleCapabilities).
//
// Gate: circle.moderate (host, the hub's guide / nexus's mentor above it, staff), the same
// capability the manage console runs on. The hub and nexus resolvers were never wired to a surface
// and left with the SCAN-502 sweep (ADR-1583); a hub/nexus CRM adds its resolver back here.
//
// FAIL-CLOSED: returns null on a missing row OR a missing capability; the page maps null to
// notFound() (never reveal the route) and the actions map it to a thrown Error. The admin client
// bypasses RLS, so this gate — not RLS — is the authority; every caller re-runs it per request.

/** The resolved, capability-checked scope a leader CRM surface operates on. */
interface LeaderCrmScope {
  id: string
  slug: string
  name: string
}

/** Resolve a circle CRM scope: slug -> circle (archived excluded, same as the manage console) ->
 *  `circle.moderate` gate. Null when the circle is missing or the viewer cannot moderate it. */
export async function resolveCircleCrm(
  slug: string,
): Promise<(LeaderCrmScope & { memberCount: number; memberCap: number }) | null> {
  if (!slug) return null
  const admin = createAdminClient()
  const { data: circle } = await admin
    .from('circles')
    .select('id, name, slug, member_count, member_cap, status')
    .eq('slug', slug)
    .neq('status', 'archived')
    .maybeSingle()
  if (!circle) return null
  const caps = await getCircleCapabilities(circle.id)
  if (!caps.has('circle.moderate')) return null
  return {
    id: circle.id,
    slug: circle.slug,
    name: circle.name,
    memberCount: circle.member_count ?? 0,
    memberCap: circle.member_cap ?? 0,
  }
}
