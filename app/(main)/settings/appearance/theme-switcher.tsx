'use client'

import { useState, useTransition } from 'react'
import { Check } from 'lucide-react'
import { SKINS, type SkinId, DEFAULT_SKIN } from '@/lib/theme/skins'
import { GENERATIONS, type GenerationId, DEFAULT_GENERATION } from '@/lib/theme/generations'
import { OCCASIONS, type OccasionId } from '@/lib/theme/occasions'
import { SectionHeader } from '@/components/ui/section-header'
import { setThemeSkin, setThemeGeneration, setThemeOccasion } from './actions'

// The member-facing theme switcher: the UI half of the previously-disconnected `fxtheme` cookie
// (docs/THEME.md §6, BUILD-CATALOG §A.13 #1). Each axis writes the cookie through its server
// action, which repaints the in-app shell on the next request. Copy comes straight from the typed
// registries (skin.label/description, generation.label/vibe, occasion.label) so the names stay on
// the naming canon. Light/dark MODE is the separate localStorage toggle on the Settings home; this
// surface owns the three server-resolved axes only.

/** One option row in an axis picker. Mirrors the Settings-home appearance button styling. */
function OptionButton({
  active,
  pending,
  label,
  description,
  onSelect,
}: {
  active: boolean
  pending: boolean
  label: string
  description?: string
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={pending}
      aria-pressed={active}
      className={`w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors disabled:opacity-60 ${
        active ? 'bg-primary-bg/60 dark:bg-primary-bg/40' : 'hover:bg-surface-elevated'
      }`}
    >
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${active ? 'text-primary-strong' : 'text-text'}`}>
          {label}
        </p>
        {description && <p className="text-xs text-muted mt-0.5">{description}</p>}
      </div>
      {active && <Check className="w-4 h-4 text-primary-strong shrink-0" />}
    </button>
  )
}

/** A titled card wrapping one axis's option list. */
function AxisCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <p className="text-xs font-medium text-muted uppercase tracking-wide mb-2">{label}</p>
      <div className="rounded-2xl border border-border bg-surface shadow-sm divide-y divide-border/80 dark:divide-border/50 overflow-hidden">
        {children}
      </div>
    </div>
  )
}

export function ThemeSwitcher({
  initialSkin,
  initialGeneration,
  initialOccasion,
}: {
  /** The member's RESOLVED axes (cookie over Space over system default), so the picker opens on
   *  exactly what is rendering now. */
  initialSkin: SkinId
  initialGeneration: GenerationId
  initialOccasion: OccasionId
}) {
  const [skin, setSkin] = useState<SkinId>(initialSkin)
  const [generation, setGeneration] = useState<GenerationId>(initialGeneration)
  const [occasion, setOccasion] = useState<OccasionId>(initialOccasion)
  const [isPending, startTransition] = useTransition()

  function chooseSkin(id: SkinId) {
    if (id === skin) return
    setSkin(id)
    startTransition(() => setThemeSkin(id))
  }
  function chooseGeneration(id: GenerationId) {
    if (id === generation) return
    setGeneration(id)
    startTransition(() => setThemeGeneration(id))
  }
  function chooseOccasion(id: OccasionId) {
    if (id === occasion) return
    setOccasion(id)
    startTransition(() => setThemeOccasion(id))
  }

  return (
    <section>
      <SectionHeader title="Theme" />

      <AxisCard label="Palette">
        {SKINS.map((s) => (
          <OptionButton
            key={s.id}
            active={skin === s.id}
            pending={isPending}
            label={s.label}
            description={s.id === DEFAULT_SKIN ? `${s.description} The standard look.` : s.description}
            onSelect={() => chooseSkin(s.id)}
          />
        ))}
      </AxisCard>

      <AxisCard label="Feel">
        {GENERATIONS.map((g) => (
          <OptionButton
            key={g.id}
            active={generation === g.id}
            pending={isPending}
            label={g.id === DEFAULT_GENERATION ? `${g.label} (default)` : g.label}
            description={g.vibe}
            onSelect={() => chooseGeneration(g.id)}
          />
        ))}
      </AxisCard>

      <AxisCard label="Seasonal accent">
        {OCCASIONS.map((o) => (
          <OptionButton
            key={o.id}
            active={occasion === o.id}
            pending={isPending}
            label={o.id === 'none' ? 'Off' : o.label}
            description={
              o.id === 'none'
                ? 'No seasonal touch, whatever the date.'
                : 'A light seasonal accent, pinned on regardless of the calendar.'
            }
            onSelect={() => chooseOccasion(o.id)}
          />
        ))}
      </AxisCard>

      <p className="text-xs text-muted px-1">
        {isPending ? 'Saving your theme…' : 'Your theme follows you across Frequency on this browser.'}
      </p>
    </section>
  )
}
