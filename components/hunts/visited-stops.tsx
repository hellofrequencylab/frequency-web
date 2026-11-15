// The visited stops of a Trail as a list (FH-016S). Takes only what projectForPlayer already released:
// a stop appears here only once it is credited, so the place name is the player's to see. A map needs an
// authorized source of locations and is not drawn here.
type VisitedStop = { key: string; position: number; place?: string; state: string }

export function VisitedStops({ stops }: { stops: readonly VisitedStop[] }) {
  const visited = stops.filter((s) => s.state === 'credited' && s.place)
  if (visited.length === 0) return null
  return (
    <section aria-labelledby="visited-stops" className="space-y-2">
      <h2 id="visited-stops" className="text-body font-semibold text-text">Stops you visited</h2>
      <ul className="space-y-1 text-body-sm text-muted">
        {visited.map((s) => (
          <li key={s.key}>Stop {s.position}: {s.place}</li>
        ))}
      </ul>
    </section>
  )
}
