import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  getCircleCapabilities,
  getHubCapabilities,
  getNexusCapabilities,
} from '@/lib/core/load-capabilities'

// LEADER CRM ACCESS (CRM Everywhere plan Phase 4 / ADR-827). The ONE slug -> entity -> capability
// resolver behind every Message Circle / hub / nexus CRM surface, so the page and its colocated
// server actions gate through the SAME code path (never two hand-copied gates that can drift).
// Mirrors the manage pages exactly: resolve by slug with the admin client (circle excludes
// archived, same as /circles/[slug]/manage), then the one capability resolver
// (getCircleCapabilities / getHubCapabilities / getNexusCapabilities).
//
// Gates per scope: circle.moderate (host, the hub's guide / nexus's mentor above it, staff);
// hub.manage (guide, parent mentor, janitor); nexus.manage (mentor, janitor) — the same
// capabilities the manage consoles run on.
//
// FAIL-CLOSED: returns null on a missing row OR a missing capability; the page maps null to
// notFound() (never reveal the route) and the actions map it to a thrown Error. The admin client
// bypasses RLS, so this gate — not RLS — is the authority; every caller re-runs it per request.

/** The resolved, capability-checked scope a leader CRM surface operates on. */
export interface LeaderCrmScope {
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

/** Resolve a hub CRM scope: slug -> hub -> `hub.manage` gate (guide, parent mentor, janitor —
 *  the same gate as /hubs/[slug]/manage). Null on any miss. */
export async function resolveHubCrm(slug: string): Promise<LeaderCrmScope | null> {
  if (!slug) return null
  const admin = createAdminClient()
  const { data: hub } = await admin
    .from('hubs')
    .select('id, name, slug')
    .eq('slug', slug)
    .maybeSingle()
  if (!hub) return null
  const caps = await getHubCapabilities(hub.id)
  if (!caps.has('hub.manage')) return null
  return { id: hub.id, slug: hub.slug, name: hub.name }
}

/** Resolve a nexus CRM scope: slug -> nexus -> `nexus.manage` gate (mentor, janitor — the same
 *  gate as /nexuses/[slug]/manage). Null on any miss. */
export async function resolveNexusCrm(slug: string): Promise<LeaderCrmScope | null> {
  if (!slug) return null
  const admin = createAdminClient()
  const { data: nexus } = await admin
    .from('nexuses')
    .select('id, name, slug')
    .eq('slug', slug)
    .maybeSingle()
  if (!nexus) return null
  const caps = await getNexusCapabilities(nexus.id)
  if (!caps.has('nexus.manage')) return null
  return { id: nexus.id, slug: nexus.slug, name: nexus.name }
}
