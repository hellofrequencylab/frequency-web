// ─────────────────────────────────────────────────────────────────────────────
// THE SHARED SPACE-BIRTH STEPS (docs/STUDIO.md; the seeders analysis, 2026-10-21).
//
// `createSpace` (the member's create) and `provisionSpace` (the Business Seeder's materializer)
// each used to insert a Space row by hand, and the seeder's copy drifted: it never applied the
// operator's per-type tool defaults, the setup preset, the starter CRM stages, the Focus or the
// directory kind. These two helpers are the part of a birth both roads share, so a Space born by
// either road stands up the same shape. Not a 'use server' file: the callers are the actions.
//
//   • `spaceBirthConfig`  runs BEFORE the insert and returns the columns it should carry.
//   • `finishSpaceBirth`  runs AFTER the insert and seat: applies the preset and seeds the stages.
//
// Both are best-effort and logged, never throwing, exactly as createSpace always treated them.
// ─────────────────────────────────────────────────────────────────────────────

import { isSpaceType, seedSpaceConfigFromDefaults } from '@/lib/spaces/functions'
import { listTypeDefaultsForType } from '@/lib/spaces/type-defaults'
import { resolveMode, isModeVariant, kindForMode } from '@/lib/spaces/modes'
import { withProfileData } from '@/lib/spaces/profile-data'
import { resolveSetupPreset, setupPresetForMode } from '@/lib/pricing/bundles'
import { setSpaceBundle } from '@/lib/pricing/space-bundle'
import { ensureSpaceStages } from '@/lib/crm/pipeline'

export interface SpaceBirthConfig {
  /** The Focus to store, or null for the type's default Focus. */
  modeVariant: string | null
  entitlements: Record<string, boolean>
  featureRoles: Record<string, string>
  /** The preset to apply once the row exists (id), or null for none. */
  presetId: string | null
  /** `preferences` seed (directory kind), merged by the caller with its own keys. */
  preferences: Record<string, unknown>
}

/** Validate the Focus against the registry and the type; unknown or mismatched = null. */
function resolveFocus(type: string, requested: string | null | undefined): string | null {
  const want = (requested ?? '').trim()
  const resolved = want && isSpaceType(type) ? resolveMode(type, want) : null
  return want && isModeVariant(want) && resolved?.variant === want ? want : null
}

/** Everything a new Space's row should carry besides its identity. FAIL-SAFE (reads degrade to []). */
export async function spaceBirthConfig(
  type: string,
  opts: { modeVariant?: string | null; preset?: string | null } = {},
): Promise<SpaceBirthConfig> {
  const modeVariant = resolveFocus(type, opts.modeVariant)
  const seedType = isSpaceType(type) ? type : null
  const typeDefaults = seedType ? await listTypeDefaultsForType(seedType) : []
  const seeded = seedSpaceConfigFromDefaults(seedType, typeDefaults)
  const preset = resolveSetupPreset(opts.preset) ?? (seedType ? setupPresetForMode(seedType, modeVariant) : null)
  const kind = seedType ? kindForMode(seedType, modeVariant) : null
  return {
    modeVariant,
    entitlements: seeded.entitlements as Record<string, boolean>,
    featureRoles: seeded.featureRoles as Record<string, string>,
    presetId: preset?.id ?? null,
    preferences: kind ? withProfileData(null, { kind }) : {},
  }
}

/** Apply the preset and seed the starter pipeline for a Space that now exists. Never throws. */
export async function finishSpaceBirth(
  spaceId: string,
  type: string,
  config: Pick<SpaceBirthConfig, 'modeVariant' | 'presetId'>,
): Promise<void> {
  if (config.presetId) {
    try {
      const applied = await setSpaceBundle(spaceId, config.presetId)
      if (!applied.ok) {
        console.error(`[spaces/provision] setup preset "${config.presetId}" not applied to ${spaceId}: ${applied.reason}`)
      }
    } catch (err) {
      console.error(`[spaces/provision] setup preset "${config.presetId}" threw for ${spaceId}:`, err)
    }
  }
  if (isSpaceType(type)) await ensureSpaceStages(spaceId, type, config.modeVariant)
}
