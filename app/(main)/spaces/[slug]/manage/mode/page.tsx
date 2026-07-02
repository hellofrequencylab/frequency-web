import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess } from '@/lib/spaces/entitlements'
import { isConsoleSpaceType } from '@/lib/spaces/types'
import { spaceFunctionDef } from '@/lib/spaces/functions'
import {
  resolveMode,
  listVariantsForType,
  modeHasFocusChoice,
  readModePreferences,
  effectiveNavEmphasis,
  effectiveLabel,
} from '@/lib/spaces/modes'
import { FocusTemplate } from '@/components/templates'
import { ModeSettings, type ModeView, type FocusChoice, type ModuleRow } from './mode-settings'

// SPACE MODE SETTINGS (Space Modes M3, ADR-461/464). The Focus surface in the unified console where an
// operator sees their current Mode + Focus, switches it (non-destructively), reads a plain "what this
// turns on" preview, and overrides preset facets. A Server Component, gated server-side exactly like the
// console page: it resolves the Space, gates on resolveSpaceManageAccess, and notFound()s otherwise so a
// non-manager cannot tell the route exists. Every write re-checks the owner/admin role in its server
// action (the actions are the authority; this render gate is UX).

export const metadata: Metadata = {
  title: 'Mode and focus',
  description: 'Pick how your space runs, see what the preset turns on, and adjust it.',
  robots: { index: false, follow: false },
}

export default async function SpaceModePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null

  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) notFound()

  const { canManage, staffViewing } = await resolveSpaceManageAccess(
    space,
    viewerProfileId,
    caller?.webRole,
  )
  if (!canManage && !staffViewing) notFound()
  if (!isConsoleSpaceType(space.type)) notFound()

  // Resolve the Mode + the operator's overrides ONCE (no N+1). A type with no Mode (root, already
  // excluded) resolves to null; the page then shows the generic message.
  const mode = resolveMode(space.type, space.modeVariant)
  if (!mode) notFound()
  const prefs = readModePreferences(space.preferences)

  // The Focus choices for the switcher (the type's variants, default first). Only shown when the Mode has
  // more than one Focus.
  const focusChoices: FocusChoice[] = modeHasFocusChoice(space.type)
    ? listVariantsForType(space.type).map((m) => ({
        variant: m.variant,
        label: m.focusLabel,
        tagline: m.tagline,
        active: m.variant === mode.variant,
      }))
    : []

  // The "what this turns on" preview: the effective module order after overrides, each with its
  // function label (operator override label wins) and whether the Mode suggests it ON by default. Mode
  // never gates, so this lists framing only (the capability stays gated elsewhere).
  const emphasis = effectiveNavEmphasis(mode, prefs)
  const modules: ModuleRow[] = emphasis.map((fn) => {
    const def = spaceFunctionDef(fn)
    const override = effectiveLabel(prefs, fn)
    return {
      fn,
      label: override ?? def?.label ?? fn,
      defaultLabel: def?.label ?? fn,
      overridden: override !== null,
      suggestedOn:
        (prefs.toggles?.[fn] ?? mode.defaultToggles.includes(fn)) === true,
    }
  })

  const view: ModeView = {
    modeLabel: mode.modeLabel,
    focusLabel: mode.focusLabel,
    tagline: mode.tagline,
    pipeline: mode.pipeline.map((s) => ({ name: s.name, kind: s.kind })),
    lexicon: mode.lexicon,
    recommendedAddons: mode.recommendedAddons.map((k) => k),
    nextBestActions: mode.nextBestActions.map((a) => ({ label: a.label })),
    modules,
    focusChoices,
    hasOverrides: Object.keys(prefs).length > 0,
  }

  return (
    <FocusTemplate
      eyebrow="Manage space"
      title="Mode and focus"
      description="Your Mode decides what leads on your console, the suggested pipeline, and the words for your people and offerings. Switching keeps all your data."
      width="wide"
    >
      <ModeSettings slug={slug} view={view} readOnly={staffViewing && !canManage} />
    </FocusTemplate>
  )
}
