// A small, neutral chip marking which of the 4 Pillars (Mind/Body/Spirit/
// Expression) a practice belongs to. Token-based (no hardcoded color) so it stays
// on-brand in light + dark.
export function PillarBadge({ name }: { name: string }) {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full bg-surface-elevated px-2 py-0.5 text-[11px] font-medium text-muted">
      {name}
    </span>
  )
}
