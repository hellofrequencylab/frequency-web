'use client'

import { useState, useTransition } from 'react'
import { SELECTABLE_SKINS, type SkinId, DEFAULT_SKIN } from '@/lib/theme/skins'
import { setThemeSkin } from './actions'

// The member-facing theme switcher: the UI half of the previously-disconnected `fxtheme` cookie
// (docs/THEME.md §6, BUILD-CATALOG §A.13 #1). Each axis writes the cookie through its server
// action, which repaints the in-app shell on the next request. Copy comes straight from the typed
// registries (skin.label/description, generation.label/vibe, occasion.label) so the names stay on
// the naming canon. Light/dark MODE is the separate localStorage ModeSwitcher; this surface owns
// the three server-resolved axes only. DAWN 2 screen pass: the PALETTE axis leads as swatch cards
// (each preview strip renders under its own [data-skin], so the token utilities paint the real
// palette); Feel + Seasonal accent stay quiet option lists below.

/** A palette swatch card: a preview strip painted under the skin's own [data-skin] scope,
 *  so canvas / surface / primary / signal show the real palette before it is chosen. */
function SkinCard({
  active,
  pending,
  skinId,
  label,
  description,
  onSelect,
}: {
  active: boolean
  pending: boolean
  skinId: SkinId
  label: string
  description: string
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={pending}
      aria-pressed={active}
      className={`press w-full overflow-hidden rounded-control border bg-surface text-left transition-colors disabled:opacity-60 ${
        active ? 'border-primary/40 lift-1' : 'border-border hover:border-border-strong'
      }`}
    >
      <span className="flex h-14" data-skin={skinId} aria-hidden>
        <span className="flex-[2] bg-canvas" />
        <span className="flex-1 bg-surface-elevated" />
        <span className="w-5 bg-primary" />
        <span className="w-5 bg-signal" />
      </span>
      <span className="block border-t border-border px-3.5 py-2.5">
        <span className="flex items-center gap-2">
          <span className="text-body-sm font-bold tracking-tight text-text">{label}</span>
          {active && (
            <span className="rounded-pill bg-primary-bg px-2 py-0.5 text-meta font-semibold text-primary-strong">
              On
            </span>
          )}
        </span>
        <span className="mt-0.5 block text-meta text-muted">{description}</span>
      </span>
    </button>
  )
}

export function ThemeSwitcher({
  initialSkin,
}: {
  /** The member's RESOLVED axes (cookie over Space over system default), so the picker opens on
   *  exactly what is rendering now. */
  initialSkin: SkinId
}) {
  const [skin, setSkin] = useState<SkinId>(initialSkin)
  const [isPending, startTransition] = useTransition()

  function chooseSkin(id: SkinId) {
    if (id === skin) return
    setSkin(id)
    startTransition(() => setThemeSkin(id))
  }

  // Only offer the Palette axis when there is a choice to make. With one selectable skin the
  // grid rendered a single card badged "On" and nothing to switch to -- a control that cannot
  // do anything, which reads as broken rather than as "there is one look". The second clause
  // is the escape hatch: if the member's CURRENT skin is not selectable (they were on it
  // before it was withdrawn), keep the picker up so they can move off it. Hiding it in that
  // case would strand them on a skin with no way out.
  const currentIsSelectable = SELECTABLE_SKINS.some((s) => s.id === skin)
  const showPalette = SELECTABLE_SKINS.length > 1 || !currentIsSelectable

  return (
    <section>
      {showPalette && (
        <div className="mb-6">
          <p className="text-meta font-medium text-muted uppercase tracking-wide mb-2">Palette</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {SELECTABLE_SKINS.map((s) => (
              <SkinCard
                key={s.id}
                active={skin === s.id}
                pending={isPending}
                skinId={s.id}
                label={s.label}
                description={s.id === DEFAULT_SKIN ? `${s.description} The standard look.` : s.description}
                onSelect={() => chooseSkin(s.id)}
              />
            ))}
          </div>
        </div>
      )}


      <p className="text-meta text-muted px-1">
        {isPending ? 'Saving your theme…' : 'Your theme follows you across Frequency on this browser.'}
      </p>
    </section>
  )
}
