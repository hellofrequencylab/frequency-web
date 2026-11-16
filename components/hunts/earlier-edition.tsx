import { loadEarlierRun, readOldGrants } from '@/lib/hunts/edition-store'

// A PLAYER'S EARLIER EDITIONS (FH-044S, ADR-1972): on the Trail's player page, the member's latest run on
// an earlier edition, read against that edition's own rules (loadRunRecord), and the rewards they earned
// before the current edition or on the legacy hunt this Trail was imported from (readOldGrants). Both
// reads are scoped to the signed-in member and answer nothing while HUNTS_ENABLED is off. Only credited
// stops are named, the same rule as the visited list: a stop the player found is theirs to see.

const day = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

export async function EarlierEdition({ huntId, profileId }: { huntId: string; profileId: string }) {
  const [record, grants] = await Promise.all([loadEarlierRun(profileId, huntId), readOldGrants(profileId, huntId)])
  if (!record && grants.length === 0) return null
  const found = record ? new Set(record.credits.map((c) => c.mission_key)) : new Set<string>()
  const visited = record ? record.content.filter((s) => found.has(s.mission_key)) : []
  const edition = record ? record.editionLabel ?? `Edition ${record.editionNo}` : ''

  return (
    <section aria-labelledby="earlier-edition" className="space-y-3 rounded-card border border-border bg-surface p-4">
      <h2 id="earlier-edition" className="text-body font-semibold text-text">Your earlier editions</h2>
      {record && (
        <div className="space-y-1 text-body-sm">
          <p className="text-text">
            {edition}: {visited.length} of {record.content.length} stops.
          </p>
          <p className="text-muted">
            {record.standing === 'finishing' && record.finishUntil
              ? `You can keep checking in on ${edition} until ${day(record.finishUntil)}. Scan a code at one of its stops and it counts there.`
              : `${edition} has closed. Your run stays on your record as it was.`}
          </p>
          {visited.length > 0 && (
            <ul className="space-y-0.5 text-muted">
              {visited.map((s) => <li key={s.mission_key}>{s.title}</li>)}
            </ul>
          )}
        </div>
      )}
      {grants.length > 0 && (
        <div className="space-y-1 text-body-sm">
          <p className="font-semibold text-text">Rewards you earned before</p>
          <ul className="space-y-0.5 text-muted">
            {grants.map((g) => (
              <li key={`${g.source}-${g.title}-${g.earnedAt}`}>
                {g.title}, {g.editionNo !== null ? `edition ${g.editionNo}` : 'from the old hunt'}, {day(g.earnedAt)}. {g.state === 'held' ? 'Still yours to use.' : 'Used.'}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
