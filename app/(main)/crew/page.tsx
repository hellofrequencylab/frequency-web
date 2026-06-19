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
            // Intrinsic sizing (w-full h-auto, no fixed height / object-cover): the WHOLE
            // banner scales to the screen width and is never cropped, so a wide header reads
            // fully on a phone as well as desktop. Recommended upload ~1600×500 (16:5).
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={headerImage}
              alt=""
              className="mb-6 h-auto w-full rounded-2xl border border-border"
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
        {/* The season's intention — the operator-set theme, surfaced as the orienting line
            for the member's season home (replaces the retired Tasks block). Their own words;
            renders only when a theme is set. */}
        {ctx.season?.theme && (
          <div className="mb-6 rounded-2xl border border-primary-bg bg-primary-bg/30 px-5 py-4 dark:bg-primary-bg/10">
            <p className="text-2xs font-semibold uppercase tracking-widest text-primary-strong">
              {ctx.season.name ? `${ctx.season.name} · the intention` : 'This season'}
            </p>
            <p className="mt-1 text-lg font-semibold leading-snug text-text">{ctx.season.theme}</p>
          </div>
        )}
        <PageModules route="/crew" />
      </DashboardTemplate>
    </>
  )
}
