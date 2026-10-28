import { isServiceListed, type SpaceProfileData } from '@/lib/spaces/profile-data'

// A kit's Services page is the Space's offerings under a short lead (lib/sites/kits/profile-variants.ts). The
// offerings block draws nothing when the Space lists no services, so the page would be a title over blank space.
// The page stays reachable; only its menu link is left out until the Space lists a service. PURE.

/** Whether `slug`'s page is the kit's Services page with nothing to show: slug `services`, an offerings block in
 *  its doc, and no listed service on the Space. Any other page, or a Services page the owner wrote, is never hidden. */
export function isEmptyServicesPage(slug: string, doc: unknown, profile: Pick<SpaceProfileData, 'offerings'>): boolean {
  if (slug !== 'services') return false
  const content = (doc as { content?: unknown } | null)?.content
  if (!Array.isArray(content) || !content.some((b) => (b as { type?: unknown } | null)?.type === 'SpaceOfferings')) return false
  return !(profile.offerings ?? []).some(isServiceListed)
}
