import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess } from '@/lib/spaces/entitlements'
import { SectionHeader } from '@/components/ui/section-header'
import { CaptureBox } from '@/components/feed/capture-box'

// THE SPACE'S POST BOX (LIVE-295, owner ruling 2026-09-10). The Space owner announces to their
// members from the SAME box a member posts from, at the top of the console Home, instead of opening a
// separate Message center nobody opened. One `dispatches` row at audience_scope 'space' lands on
// every member's Dispatch rail (lib/dispatches.ts) and in the weekly digest (lib/digest.ts).
//
// SELF-GATING, like OwnerSpaceLayoutPreview: it resolves the caller, the Space and
// resolveSpaceManageAccess itself and renders NOTHING for anyone else, so no gate has to be plumbed
// through a prop and a future mount cannot forget one. A staff janitor's read-only preview is not
// canManage, so it sees no send box. The send action re-runs the same gate server-side regardless
// (app/(main)/spaces/[slug]/dispatch-actions.ts): this render gate is UX, that one is the authority.
//
// 🔴 THE SCOPE COMES FROM THIS MOUNT. The box is handed the resolved Space id, slug and name; there
// is no default and no fallback anywhere on the path. lib/events/dispatch.ts writes audience_scope
// 'global', which is the whole platform, so a space Dispatch that fell back to a default would be a
// mass-notification incident. A Space that does not resolve here renders nothing at all.
//
// Copy: plain, no em dashes (CONTENT-VOICE §10). "Dispatch" is the noun (NAMING.md).
export async function SpaceDispatchBand({ slug }: { slug: string }) {
  const caller = await getCallerProfile()
  if (!caller) return null

  const space = await getVisibleSpaceBySlug(slug, caller.id)
  if (!space) return null

  const { canManage } = await resolveSpaceManageAccess(space, caller.id, caller.webRole)
  if (!canManage) return null

  const spaceName = space.brandName ?? space.name

  return (
    <section>
      <SectionHeader title="Say something" />
      <p className="mb-3 mt-0.5 text-meta leading-relaxed text-muted">
        A Dispatch reaches every member of {spaceName}, on their rail and in their weekly digest.
      </p>
      <CaptureBox
        // The member's own wall is still the fallback scope for any non-Dispatch mode the box grows
        // later; today a space mount renders Dispatch only, so nothing writes through it.
        scopeId={caller.id}
        // THE ROW'S OTHER HALF: on a space mount `canAnnounce` comes from the SPACE's manage gate,
        // not the community role (host / guide / mentor / janitor) that app/(main)/feed/page.tsx
        // reads. Passed from the resolved gate rather than as a literal so the derivation is legible
        // here, and so the box's own fail-closed check stays live rather than trivially true.
        canAnnounce={canManage}
        spaceScope={{ spaceId: space.id, slug: space.slug, name: spaceName }}
      />
    </section>
  )
}
