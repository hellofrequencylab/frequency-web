import { notFound } from 'next/navigation'
import { getCrewContext } from '@/lib/quest/crew-context'
import { getPageHeaderImage } from '@/lib/page-settings/store'
import { CrewBody } from '@/components/frequency/members/crew/crew-body'

// My Quest (/crew) — the member's season home. Module-driven (ADR-270/294): the page composes the
// shared header grammar, then renders <PageModules>, which lays out the /crew blocks (the Season
// Map hero, Your Journeys, Tasks, Explore, the circle Leaderboard, the finish celebration) in the
// operator-chosen template + order. Staff arrange it from the on-page Settings → Layout panel
// (the route is registered in lib/widgets/module-routes.ts so the panel appears here); each block
// is a self-fetching RSC in components/widgets/quest/. The header still needs the viewer's
// crew-lead badge + circle name, so the page reads the shared getCrewContext (request-cached, so
// the modules reuse it). notFound() when there is no signed-in member.

export default async function CrewPage() {
  const ctx = await getCrewContext()
  if (!ctx) notFound()

  // Operator-set wide header image — set from Settings → SEO & meta → Header image.
  const headerImage = await getPageHeaderImage('/crew')
  return <CrewBody ctx={ctx} headerImage={headerImage} />
}
