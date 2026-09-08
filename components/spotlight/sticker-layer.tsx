import type { SpotlightStickers } from '@/lib/spotlight/blocks/schema'
import { spotlightStickerById } from '@/lib/spotlight/stickers'

// THE STICKER LAYER (PROG-SPOT increment 2, ADR-1275): page chrome that floats a member's placed
// stickers over their Spotlight column. Absolute inside the shell's <main> (which is `relative`), so
// each sticker's x/y are percentages of the column, stable across viewports. Decorative only:
// pointer-events none (nothing underneath loses a click), aria-hidden (a screen reader hears no
// glyph soup), select-none. Server Component; ships no client runtime.
//
// The data arrives VALIDATED (validateSpotlightStickers runs on read in lib/spotlight/data.ts), and
// each id is resolved against the closed allowlist AGAIN here, so an id that is somehow unknown at
// render draws nothing rather than a fallback. With NO stickers the layer renders null, so an
// existing page's markup and visual baseline do not move by a single node.

export function SpotlightStickerLayer({ stickers }: { stickers: SpotlightStickers }) {
  const placed = stickers.items
    .map((s) => ({ def: spotlightStickerById(s.id), x: s.x, y: s.y }))
    .filter((s): s is { def: NonNullable<typeof s.def>; x: number; y: number } => s.def !== null)
  if (placed.length === 0) return null

  return (
    <div className="pointer-events-none absolute inset-0 z-20 select-none overflow-hidden" aria-hidden data-testid="spotlight-stickers">
      {placed.map((s, i) => (
        <span
          key={`${s.def.id}-${i}`}
          className="absolute text-display-h3 leading-none"
          style={{ left: `${s.x}%`, top: `${s.y}%`, transform: 'translate(-50%, -50%)' }}
        >
          {s.def.glyph}
        </span>
      ))}
    </div>
  )
}
