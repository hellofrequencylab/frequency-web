import { notFound } from 'next/navigation'
import { DashboardTemplate } from '@/components/templates'
import { CrewPreviewBanner } from '@/components/crew/crew-preview-banner'
import { PageModules } from '@/components/widgets/page-modules'
import { getCrewContext } from '@/lib/quest/crew-context'
import { getPageHeaderImage } from '@/lib/page-settings/store'

// My Quest (/crew) — the member's season home. Module-driven (ADR-270/294): the page composes the
// shared header grammar, then renders <PageModules>, which lays out the /crew blocks (the Season
// Map hero, Your Journeys, Tasks, Explore, the circle Leaderboard, the finish celebration) in the
// operator-chosen template + order. Staff arrange it from the on-page Settings → Layout panel
// (the route is registered in lib/widgets/module-routes.ts so the panel appears here); each block
// is a self-fetching RSC in components/widgets/quest/*. The header still needs the viewer's
// crew-lead badge + circle name, so the page reads the shared getCrewContext (request-cached, so
// the modules reuse it). notFound() when there is no signed-in member.

export default async function CrewPage() {
  const ctx = await getCrewContext()
  if (!ctx) notFound()

  // Operator-set wide header image — set from Settings → SEO & meta → Header image.
  const headerImage = await getPageHeaderImage('/crew')

  return (
    <>
      {!ctx.isCrew && <CrewPreviewBanner />}
      <DashboardTemplate
        banner={
          headerImage && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={headerImage}
              alt=""
              className="mb-6 h-44 w-full rounded-2xl border border-border object-cover sm:h-56"
            />
          )
        }
        title={
          <span className="inline-flex flex-wrap items-center gap-2">
            My Quest
            {ctx.isCrewLead && (
              <span className="rounded-md bg-warning-bg px-2 py-0.5 text-xs font-semibold text-warning">
                Crew Lead
              </span>
            )}
          </span>
        }
        description={
          <>
            Three Journeys this season, each touching all four Pillars: Mind, Body, Spirit, and
            Expression. Finish each to climb from Ghost to Master.
            {ctx.membership?.circleName && (
              <>
                {' '}
                You&apos;re in <span className="font-medium text-text">{ctx.membership.circleName}</span>.
              </>
            )}
          </>
        }
      >
        <PageModules route="/crew" />
      </DashboardTemplate>
    </>
  )
}
