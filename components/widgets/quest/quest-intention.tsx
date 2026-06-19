import { getCrewContext } from '@/lib/quest/crew-context'

// My Quest layout module (ADR-270/294): the season's INTENTION — the operator-set season
// theme, in their own words, as the orienting line for the member's season home. Self-fetching
// RSC keyed to the signed-in member via getCrewContext (request-cached, shared with the season
// map). Renders nothing when there's no viewer or no theme set, so an empty theme just drops
// the block. Arrange / hide it from Settings → Layout like any other My Quest block.
export async function QuestIntention() {
  const ctx = await getCrewContext()
  const season = ctx?.season
  if (!season?.theme) return null

  return (
    <div className="rounded-2xl border border-primary-bg bg-primary-bg/30 px-5 py-4 dark:bg-primary-bg/10">
      <p className="text-2xs font-semibold uppercase tracking-widest text-primary-strong">
        {season.name ? `${season.name} · the intention` : 'This season'}
      </p>
      <p className="mt-1 text-lg font-semibold leading-snug text-text">{season.theme}</p>
    </div>
  )
}
