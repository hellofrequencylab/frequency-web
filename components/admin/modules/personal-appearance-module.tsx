'use client'

import { useEffect, useState } from 'react'
import { moduleById } from '@/lib/admin/modules/registry'
import { ThemeSwitcher } from '@/app/(main)/settings/appearance/theme-switcher'
import { resolveSkin, type SkinId } from '@/lib/theme/skins'
import { resolveGeneration, type GenerationId } from '@/lib/theme/generations'
import { isOccasionId, DEFAULT_OCCASION, type OccasionId } from '@/lib/theme/occasions'

// Personal "You" module (ADMIN-RAIL.md Phase 4): Appearance, mounted inside the standardized admin
// bar for any signed-in viewer. A THIN wrapper over the EXISTING settings form — it renders the same
// `ThemeSwitcher` the /settings/appearance page renders and reuses that form's own server actions to
// persist each axis. Nothing is rewritten here.
//
// The switcher wants the member's RESOLVED axes (so the picker opens on what is actually rendering).
// The /settings page fetches those server-side; in the drawer we read them client-side from the shell
// root, which already carries them as [data-skin] / [data-generation] / [data-occasion] (app-shell).
// SSR-safe: we render a fixed-size skeleton until mounted (no hydration mismatch, no CLS), then swap
// in the switcher — the same loading discipline the other admin-bar modules use.

/** The resolved theme axes applied to the shell root, read from the nearest ancestor that carries
 *  each attribute (a Space skin override may sit on a nested element). Falls back to the system
 *  defaults when an axis is absent, so the picker always opens on a valid, real value. */
function readResolvedAxes(): { skin: SkinId; generation: GenerationId; occasion: OccasionId } {
  const attr = (name: string) => document.querySelector(`[data-${name}]`)?.getAttribute(`data-${name}`) ?? null
  const occ = attr('occasion')
  return {
    skin: resolveSkin(attr('skin')),
    generation: resolveGeneration(attr('generation')),
    // [data-occasion] is omitted when 'none' (app-shell), so an absent attribute means no accent.
    occasion: occ && isOccasionId(occ) ? occ : DEFAULT_OCCASION,
  }
}

export function PersonalAppearanceModule() {
  const [axes, setAxes] = useState<ReturnType<typeof readResolvedAxes> | null>(null)

  // Read the shell's resolved axes once, on mount — a one-shot sync from an external system (the DOM),
  // exactly the case the rule's guidance carves out. SSR-safe: the skeleton renders until this lands.
  useEffect(() => {
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    setAxes(readResolvedAxes())
  }, [])

  const mod = moduleById('account.appearance')
  const Icon = mod?.Icon

  return (
    <section className="min-w-0">
      <header className="mb-4 space-y-1">
        <h3 className="flex items-center gap-2 text-sm font-bold text-text">
          {Icon && <Icon className="h-4 w-4 shrink-0 text-primary-strong" aria-hidden />}
          {mod?.label ?? 'Appearance'}
        </h3>
        {mod?.desc && <p className="text-sm text-muted">{mod.desc}</p>}
      </header>

      {axes ? (
        <ThemeSwitcher
          initialSkin={axes.skin}
          initialGeneration={axes.generation}
          initialOccasion={axes.occasion}
        />
      ) : (
        <div className="h-64 animate-pulse rounded-2xl border border-border bg-surface-elevated/50" />
      )}
    </section>
  )
}
