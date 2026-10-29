// THE FREE HUMAN MOON (design: MoonPhase, the Calendar hero's Moon and the closing band). A disc with its lit part drawn for one
// of the eight phases (0 new, 1 waxing crescent, 2 first quarter, 3 waxing gibbous, 4 full, 5 waning gibbous, 6 last quarter,
// 7 waning crescent). Colours are the theme's tokens through currentColor and CSS variables. A Server Component.

/** The lit shape on a 24 unit disc (centre 12,12, radius 9): the lit limb from the top to the bottom, then the terminator back as an
 *  ellipse arc. Waxing lights the right, waning the left; a gibbous terminator bows out past the centre, a crescent's stays inside. */
function litPath(phase: number): string | null {
  if (phase === 0) return null
  if (phase === 4) return 'M12 3a9 9 0 1 1 0 18a9 9 0 1 1 0-18z'
  const waxing = phase < 4
  const gibbous = phase === 3 || phase === 5
  const quarter = phase === 2 || phase === 6
  const sweep = waxing === gibbous ? 1 : 0
  return `M12 3A9 9 0 0 ${waxing ? 1 : 0} 12 21${quarter ? 'z' : `A6.4 9 0 0 ${sweep} 12 3z`}`
}

export function FreeHumanMoon({ phase, size = 22, title }: { phase: number; size?: number; title?: string }) {
  const lit = litPath(((phase % 8) + 8) % 8)
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className="fh-moon" role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true} focusable="false">
      <circle cx="12" cy="12" r="9" className="fh-moon-disc" />
      {lit && <path d={lit} className="fh-moon-lit" />}
    </svg>
  )
}
