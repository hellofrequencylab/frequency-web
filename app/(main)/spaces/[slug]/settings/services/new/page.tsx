import { notFound } from 'next/navigation'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess, getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { spaceFunctionAccess } from '@/lib/spaces/functions'
import { isConsoleSpaceType } from '@/lib/spaces/types'
import { ServiceSpark } from './service-spark'

// Add a bookable service to a Space (ADR-596 · docs/STUDIO.md §0, ADR-986). The guided way in to the
// Shop console's catalog: the Service SPARK, whose fields all come from SERVICE_MANIFEST.
//
// THE GATE IS THE SHOP CONSOLE'S GATE, in the same order, because it is the same authority: manage
// access, a Business-account space type, and the `shop` function switched on for that role. A staff
// previewer is READ ONLY on the console, so they are denied here rather than shown a create form they
// cannot submit. `createSpaceProductAction` re-checks all three server-side regardless (server actions
// are addressable on their own), so this render gate is convenience, not the boundary.

export const metadata = { title: 'New service' }

export default async function NewSpaceServicePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null

  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) notFound()

  const { canManage } = await resolveSpaceManageAccess(space, viewerProfileId, caller?.webRole)
  if (!canManage) notFound()
  if (!isConsoleSpaceType(space.type)) notFound()
  const caps = await getSpaceCapabilities(space, viewerProfileId)
  if (!spaceFunctionAccess(space, 'shop', caps.role)) notFound()

  return <ServiceSpark slug={slug} spaceId={space.id} spaceName={space.brandName ?? space.name} />
}
