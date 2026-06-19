import { notFound } from 'next/navigation'
import { getMyProfileId } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { setActiveSpace } from '@/lib/spaces/active-space'
import { blueprintForType, tabForSegment, type EntityTabId } from '@/lib/spaces/blueprints'
import { PageModules } from '@/components/widgets/page-modules'

// The shared BODY of one entity-profile tab (ENTITY-SPACES-BUILD §B.1). Every tab page
// (page.tsx + offerings/practices/community/book) delegates here so the resolve + render is one
// composed path, never re-authored per tab.
//
// It re-resolves the Space (cheap: getVisibleSpaceBySlug → getSpaceBySlug is request-cached) and
// re-stamps the active-space context — so a module reads THIS tenant's rows even though Next renders
// the page and the layout as separate units. Then it renders the tab's blueprint module set via
// space-scoped <PageModules>: `route` carries the section scope ('/spaces/*'), `moduleIds` narrows
// to this tab's blocks, and `spaceId` resolves the layout for THIS Space (the §B.4 space layer).
// `role="member"` skips the community-role lookup — entity modules gate on the Space, not the
// community trust ladder, so the per-module role gate stays at its default (everyone).
export async function ProfileTabBody({ slug, tabId }: { slug: string; tabId: EntityTabId }) {
  const viewerProfileId = await getMyProfileId()
  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) notFound()
  setActiveSpace(space)

  const blueprint = blueprintForType(space.type)
  // Fail closed: an unknown type (no blueprint) shows About only (a single safe module).
  const tab = blueprint ? tabForSegment(blueprint, tabId) : { id: 'about' as const, label: 'About', modules: ['entity-about'] }
  // The section route carries the family scope; the tab id distinguishes the layout-store row a
  // future per-tab override saves under (the operator Layout editor, Epic 1.7).
  const route = tab.id === 'about' ? `/spaces/${space.slug}` : `/spaces/${space.slug}/${tab.id}`

  return (
    <PageModules
      route={route}
      role="member"
      moduleIds={tab.modules}
      spaceId={space.id}
    />
  )
}
