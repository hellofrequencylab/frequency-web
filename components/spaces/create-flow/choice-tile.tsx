'use client'

import { FqIcon, type FqIconName } from '@/components/frequency/icon'

/** One selectable choice in a create flow: a title, its one-line hint, an optional tag and icon. The one tile
 *  every step of the flow wears (Goals, Setup, who can find it, Look). */
export function ChoiceTile({
  on,
  title,
  hint,
  tag,
  icon,
  onSelect,
}: {
  on: boolean
  title: string
  hint?: string
  tag?: string
  icon?: FqIconName
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      className={`flex items-start gap-3 rounded-card border p-3.5 text-left transition-colors ${
        on ? 'border-ink bg-[image:var(--fq-pa-soft)] ring-1 ring-ink' : 'border-border bg-surface-elevated/50 hover:bg-surface-elevated'
      }`}
      onClick={onSelect}
    >
      {icon && (
        <span aria-hidden className="grid h-9 w-9 flex-none place-items-center rounded-control bg-[image:var(--fq-pa-soft)]">
          <FqIcon name={icon} size={18} />
        </span>
      )}
      <span className="min-w-0">
        <span className="block text-body-sm font-semibold text-text">
          {title}
          {tag && <span className="ml-2 rounded-pill bg-[image:var(--fq-pa-soft)] px-2 py-0.5 align-middle text-eyebrow font-semibold text-text">{tag}</span>}
        </span>
        {hint && <span className="block text-meta text-muted">{hint}</span>}
      </span>
    </button>
  )
}
