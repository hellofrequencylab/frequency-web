'use client'

import { STUDIO_ACCENTS, accentColor, accentTint } from '@/lib/studio/accents'
import { JOURNEY_ICONS, JOURNEY_ICON_MAP, DefaultJourneyIcon } from '@/lib/studio/journey-icons'

// Identity atoms (kit): the "give it a face" pieces every builder shares — an icon
// tile tinted by the accent, the accent dot row, and the icon grid. The face is a
// representative lucide icon (not an emoji) so every entity stays on the design
// system. Used by the journey builder + launcher today; circle/practice next.
// docs/STUDIO.md §2.

/** The icon tile, tinted by accent. Pass `onClick` to make it a picker trigger.
 *  `icon` is a journey-icon key (or a legacy emoji), resolved to its lucide glyph. */
export function IconAccentFace({
  icon,
  accent,
  size = 'lg',
  onClick,
}: {
  icon: string | null | undefined
  accent: string | null | undefined
  size?: 'lg' | 'md'
  onClick?: () => void
}) {
  const Icon = JOURNEY_ICON_MAP[icon ?? ''] ?? DefaultJourneyIcon
  const dim = size === 'lg' ? 'h-16 w-16' : 'h-11 w-11'
  const glyph = size === 'lg' ? 'h-7 w-7' : 'h-5 w-5'
  const style = { backgroundColor: accentTint(accent, 16), color: accentColor(accent) }
  const cls = `flex ${dim} shrink-0 items-center justify-center rounded-2xl`
  if (onClick) {
    return (
      <button type="button" onClick={onClick} aria-label="Choose an icon" className={`${cls} transition-transform hover:scale-105`} style={style}>
        <Icon className={glyph} />
      </button>
    )
  }
  return (
    <div className={cls} style={style}>
      <Icon className={glyph} />
    </div>
  )
}

/** The accent dot row. */
export function AccentPicker({
  accent,
  onChange,
  size = 'sm',
}: {
  accent: string | null | undefined
  onChange: (key: string) => void
  size?: 'sm' | 'lg'
}) {
  const dim = size === 'lg' ? 'h-7 w-7' : 'h-5 w-5'
  return (
    <div className="flex flex-wrap gap-2">
      {STUDIO_ACCENTS.map((a) => {
        const selected = accent === a.key
        return (
          <button
            key={a.key}
            type="button"
            aria-label={a.label}
            aria-pressed={selected}
            title={a.label}
            onClick={() => onChange(a.key)}
            className={`${dim} rounded-full ring-offset-2 ring-offset-canvas transition-transform hover:scale-110 ${selected ? 'scale-110 ring-2' : ''}`}
            style={{ backgroundColor: accentColor(a.key), ['--tw-ring-color' as string]: 'var(--brand-mark)' }}
          />
        )
      })}
    </div>
  )
}

/** A grid of icon choices (the picker body). `sm` fits a popover; `md` a panel.
 *  Each cell stores its icon key. */
export function IconGrid({
  value,
  onPick,
  size = 'md',
}: {
  value?: string | null
  onPick: (key: string) => void
  size?: 'sm' | 'md'
}) {
  const cell = size === 'sm' ? 'h-7 w-7' : 'h-9 w-9'
  const glyph = size === 'sm' ? 'h-4 w-4' : 'h-5 w-5'
  return (
    <div className="grid grid-cols-8 gap-1">
      {JOURNEY_ICONS.map(({ key, label, Icon }) => (
        <button
          key={key}
          type="button"
          onClick={() => onPick(key)}
          aria-label={label}
          title={label}
          className={`flex ${cell} items-center justify-center rounded-xl transition-transform hover:scale-110 ${value === key ? 'text-primary-strong ring-2 ring-primary' : 'text-muted hover:bg-surface-elevated hover:text-text'}`}
        >
          <Icon className={glyph} />
        </button>
      ))}
    </div>
  )
}
