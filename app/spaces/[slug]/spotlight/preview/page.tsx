import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess } from '@/lib/spaces/entitlements'
import { setActiveSpace } from '@/lib/spaces/active-space'
import { readTagline } from '@/lib/spaces/tagline'
import { markSpotlightPreview } from '@/lib/spaces/spotlight-site'
import { SpaceSpotlight } from '@/components/spotlight/space-spotlight'
import { SpotlightPreviewBridge } from '@/components/spotlight/spotlight-preview-bridge'
import { FocusTemplate } from '@/components/templates'

// THE SPOTLIGHT EDITOR'S PREVIEW FRAME (LIVE-2452). The Spotlight editor (/spaces/<slug>/manage/spotlight) shows
// this page in an iframe, so the preview is the very page a visitor gets: same route group (outside (main), so
// no member or console styles reach it), same component (SpaceSpotlight), same theme. Drawn inside the console,
// the member kit's glass cards and type painted over the Space's own theme (the grey boxes the owner saw), and a
// themed Spotlight only drew its last saved copy. The editor saves as it goes, so the frame reloads after each
// save and always shows what is live.
//
// Managers only (a staff previewer too, read-only), whether or not the Spotlight is published. Never cached,
// never indexed. The bridge turns link presses into nothing, so a press in the preview never leaves the editor
// and never counts as a visitor's click. FocusTemplate with no heading is a bare column wider than the phone frame,
// so it changes nothing the owner sees and keeps the page on a kit shell.

export const metadata: Metadata = {
  title: 'Spotlight preview',
  robots: { index: false, follow: false },
}

export default async function SpaceSpotlightPreview({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const caller = await getCallerProfile()
  const space = await getVisibleSpaceBySlug(slug, caller?.id ?? null)
  if (!space) notFound()
  const { canManage, staffViewing } = await resolveSpaceManageAccess(space, caller?.id ?? null, caller?.webRole)
  if (!canManage && !staffViewing) notFound()

  markSpotlightPreview()
  setActiveSpace(space)
  return (
    <FocusTemplate width="xl">
      <SpaceSpotlight space={space} tagline={await readTagline(space.id)} />
      <SpotlightPreviewBridge />
    </FocusTemplate>
  )
}
