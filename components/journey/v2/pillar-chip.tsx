// A small, pillar-tinted chip for a practice slot in the Journey editor (build item §11.1, J4b).
// Marks which of the four Pillars (Mind/Body/Spirit/Expression) a practice block belongs to, in a
// tasteful tint keyed by the Pillar's slug. Token-based only (no hardcoded color) so it stays
// on-brand in light + dark. Falls back to a neutral "Practice" chip when there's no Pillar.

import { pillarTint } from '@/lib/pillars-style'

/** The pillar badge for a practice slot. Pass the Pillar's `slug` (for the tint) and `name` (the
 *  label). With no Pillar, renders a neutral "Practice" chip so the row still reads as a practice. */
export function PillarChip({ slug, name }: { slug: string | null; name: string | null }) {
  const tint = pillarTint(slug)
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-md px-1.5 py-1 text-xs font-medium ${tint}`}
      title={name ? `${name} practice` : 'A library practice'}
    >
      {name ?? 'Practice'}
    </span>
  )
}
