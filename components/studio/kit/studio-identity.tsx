'use client'

import { Smile } from 'lucide-react'
import { STUDIO_ACCENTS, accentColor, accentTint } from '@/lib/studio/accents'

// Identity atoms (kit): the "give it a face" pieces every builder shares — an
// emoji tile tinted by the accent, the accent dot row, and the emoji grid. Used by
// the journey builder + launcher today; circle/practice next. docs/STUDIO.md §2.

export const EMOJI_CHOICES = [
  '🧭','🌱','🔥','🧘','🏃','💪','📓','📖','🌊','☀️','🌙','✨',
  '🎯','🫀','🧠','🎨','🎸','🛠️','🤝','🕊️','💧','🏔️','🌀','💫',
]

/** The emoji tile, tinted by accent. Pass `onClick` to make it a picker trigger. */
export function EmojiAccentFace({
  emoji,
  accent,
  size = 'lg',
  onClick,
}: {
  emoji: string | null | undefined
  accent: string | null | undefined
  size?: 'lg' | 'md'
  onClick?: () => void
}) {
  const dim = size === 'lg' ? 'h-16 w-16 text-3xl' : 'h-11 w-11 text-xl'
  const fallback = <Smile className={size === 'lg' ? 'h-7 w-7' : 'h-5 w-5'} />
  const style = { backgroundColor: accentTint(accent, 16), color: accentColor(accent) }
  const cls = `flex ${dim} shrink-0 items-center justify-center rounded-2xl`
  if (onClick) {
    return (
      <button type="button" onClick={onClick} aria-label="Choose an emoji" className={`${cls} transition-transform hover:scale-105`} style={style}>
        {emoji || fallback}
      </button>
    )
  }
  return <div className={cls} style={style}>{emoji || fallback}</div>
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
  const dim = size === 'lg' ? 'h-6 w-6' : 'h-3.5 w-3.5'
  return (
    <div className="flex gap-1.5">
      {STUDIO_ACCENTS.map((a) => (
        <button
          key={a.key}
          type="button"
          aria-label={a.label}
          onClick={() => onChange(a.key)}
          className={`${dim} rounded-full ring-offset-2 ring-offset-canvas transition-transform hover:scale-110 ${accent === a.key ? 'ring-2' : ''}`}
          style={{ backgroundColor: accentColor(a.key), ['--tw-ring-color' as string]: accentColor(a.key) }}
        />
      ))}
    </div>
  )
}

/** A grid of emoji choices (the picker body). `sm` fits a popover; `md` a panel. */
export function EmojiGrid({
  value,
  onPick,
  size = 'md',
}: {
  value?: string | null
  onPick: (emoji: string) => void
  size?: 'sm' | 'md'
}) {
  const cell = size === 'sm' ? 'h-7 w-7 text-lg' : 'h-9 w-9 text-xl'
  return (
    <div className="grid grid-cols-8 gap-1">
      {EMOJI_CHOICES.map((e) => (
        <button
          key={e}
          type="button"
          onClick={() => onPick(e)}
          className={`flex ${cell} items-center justify-center rounded-xl transition-transform hover:scale-110 ${value === e ? 'ring-2 ring-primary' : 'hover:bg-surface-elevated'}`}
        >
          {e}
        </button>
      ))}
    </div>
  )
}
