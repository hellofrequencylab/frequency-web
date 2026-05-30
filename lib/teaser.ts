import { type CommunityRole, atLeastRole } from '@/lib/core/roles'

// Master switch for the membership teaser gate.
//
// While the beta is a free-for-all (everyone can join/engage), leave this OFF so
// members keep full access — the gate is wired in but dormant. Flip to `true`
// when paid tiers go live and you actually want to tease premium surfaces.
export const TEASER_GATE_ENABLED = false

// The tier a viewer must reach to get full (un-teased) access. "Crew" is the
// paid membership; everyone at crew or above sees everything.
export const TEASER_MIN_ROLE: CommunityRole = 'crew'

// Seconds of preview before the content blurs and the upgrade prompt appears.
export const TEASER_PREVIEW_SECONDS = 30

// Whether a viewer may fully access a tier-gated surface.
// `hasAccess` grants access for non-tier reasons (already a circle member, the
// event host, etc.) so we only ever tease people who genuinely lack access.
export function teaserAllowed(opts: {
  role: CommunityRole | null | undefined
  hasAccess?: boolean
}): boolean {
  if (!TEASER_GATE_ENABLED) return true
  if (opts.hasAccess) return true
  return atLeastRole(opts.role, TEASER_MIN_ROLE)
}
