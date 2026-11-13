'use client'

// The look, as two tight rows in the hero (Daniel, 2026-11-13): one row of theme buttons, one row of accent buttons,
// above the headline and beside the preview they restyle. Nothing here is a step and nothing blocks the Next button:
// New World and its first accent are already picked, so the rows only ever change a choice. The remembering is
// lib/create-space/last-kit.ts (a first-party cookie), written by the studio, not here.
import type { MegaThemeId } from '@/lib/theme/mega-theme'

interface LookRowsProps {
  kits: readonly { id: MegaThemeId; label: string }[]
  kit: MegaThemeId
  accents: readonly { name: string; fill: string }[]
  accentAt: number
  onKit: (id: MegaThemeId) => void
  onAccent: (at: number) => void
}

export function LookRows({ kits, kit, accents, accentAt, onKit, onAccent }: LookRowsProps) {
  return (
    <div className="cs-look">
      <div role="radiogroup" aria-label="Theme" className="cs-themes">
        {kits.map((k) => (
          <button key={k.id} type="button" role="radio" aria-checked={k.id === kit} className="cs-theme" onClick={() => onKit(k.id)}>{k.label}</button>
        ))}
      </div>
      <div role="radiogroup" aria-label="Accent" className="cs-swatches">
        {accents.map((a, i) => (
          <button key={a.name} type="button" role="radio" aria-checked={i === accentAt} aria-label={a.name} title={a.name} className="cs-swatch" onClick={() => onAccent(i)}>
            <i style={{ background: a.fill }} />
          </button>
        ))}
      </div>
    </div>
  )
}
