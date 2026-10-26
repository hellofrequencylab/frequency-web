import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'

// Shared badge primitive The audit found five hand-rolled status pills —
// Demo, Featured, Starter, Unclaimed, Supporter — each re-deriving its own padding, radius,
// size and colour from scratch, and already drifting (Supporter sat on px-2 while its four
// siblings sat on px-1.5). One scale here (tone × size); `className` still merges for a
// genuine one-off (a `mt-0.5` nudge on a grid card).
//
// TONE VOCABULARY is the semantic palette, not a colour picker:
//   primary   — brand amber. The ONE chrome accent. Ownership / brand marks.
//   signal    — the rare secondary TEAL. Curation and endorsement, used sparingly.
//   broadcast — azure. COMMS ONLY (dispatches, announcements). Never decorative.
//   success   — the brand teal, never a green.
//   warning / danger — states, not decoration.
//   neutral   — the default: no accent spent, a bordered surface chip.
// One accent per row: if a card already carries a primary badge, the next marker is neutral.

export type BadgeTone = 'neutral' | 'primary' | 'signal' | 'broadcast' | 'success' | 'warning' | 'danger'

/** `md` is the body pill (meta type, sentence case). `sm` is the micro card marker the
 *  browse-card badges use: 3xs, uppercase, tight tracking — small enough to sit beside a title. */
export type BadgeSize = 'sm' | 'md'

// The members kit's `.tag` (ADR-1737; a 24px glass pill), toned by meaning in
// app/themes/frequency/members-ui.css (`mu-primary` violet act, `mu-broadcast` magenta live,
// `mu-signal` aqua presence, the three states), `mu-solid` the louder fill, `mu-sm` the card marker.

/** The exact badge token string for a tone × size — so a surface that cannot render a `<Badge>`
 *  (a `<Link>` pill, a slot that wants the classes only) shares the SAME tokens without a
 *  hand-rolled `bg-*-bg…` class string. */
export function badgeClasses(
  tone: BadgeTone = 'neutral',
  size: BadgeSize = 'md',
  options: { solid?: boolean; className?: string } = {},
): string {
  const { solid = false, className } = options
  return cn('tag', tone !== 'neutral' && `mu-${tone}`, solid && 'mu-solid', size === 'sm' && 'mu-sm', className)
}

export type BadgeProps = Omit<HTMLAttributes<HTMLSpanElement>, 'children'> & {
  children?: ReactNode
  /** Semantic tone. `success` is the brand teal, never green; `broadcast` is comms only. */
  tone?: BadgeTone
  /** `md` = the meta pill · `sm` = the uppercase micro marker on browse cards. */
  size?: BadgeSize
  /** Fill with the tone itself for a louder marker. */
  solid?: boolean
  /** Optional leading glyph. The badge sizes it; pass only how it is painted. */
  icon?: ReactNode
}

export function Badge({
  children,
  tone = 'neutral',
  size = 'md',
  solid = false,
  icon,
  className,
  ...props
}: BadgeProps) {
  return (
    <span className={badgeClasses(tone, size, { solid, className })} {...props}>
      {icon}
      {children}
    </span>
  )
}
