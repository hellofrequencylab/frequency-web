import 'server-only'
import { cache } from 'react'
import { getPlatformSetting, setPlatformSetting } from '@/lib/platform-flags'
import type { CommunityRole } from '@/lib/core/roles'
import {
  TRAINING,
  TRAINING_TIERS,
  applyCurriculumOverrides,
  normalizeCurriculumEdit,
  parseCurriculumOverrides,
  type CurriculumOverrides,
  type TrainingDef,
} from './training-curriculum'

// THE EDITED CURRICULUM (LIVE-690). Operator edits to a tier's path live as one JSON row in the
// existing platform_settings key/text store (no migration), laid over the code registry by
// applyCurriculumOverrides. NO SEED ROW: an absent or unreadable row means the registry exactly,
// so a code change to the default path is never silently beaten by a stale row. Resetting a tier
// removes its key from the JSON; it never deletes the row.

export const CURRICULUM_KEY = 'training_curriculum'

const loadOverrides = cache(async (): Promise<CurriculumOverrides> => {
  try {
    return parseCurriculumOverrides(await getPlatformSetting(CURRICULUM_KEY, ''))
  } catch {
    return {}
  }
})

/** The curriculum every reader uses: the registry with the operator's edits. Cached per request. */
export const loadCurriculum = cache(async (): Promise<{ defs: Partial<Record<CommunityRole, TrainingDef>>; edited: CommunityRole[] }> => {
  const overrides = await loadOverrides()
  return {
    defs: applyCurriculumOverrides(TRAINING, overrides),
    edited: TRAINING_TIERS.filter((r) => overrides[r]),
  }
})

async function writeOverrides(next: CurriculumOverrides, by: string | null): Promise<void> {
  await setPlatformSetting(CURRICULUM_KEY, JSON.stringify(next), by)
}

/** Save one tier's edit (staff-gated callers only). */
export async function saveTierCurriculum(
  role: CommunityRole,
  input: unknown,
  by: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!TRAINING_TIERS.includes(role) || !TRAINING[role]) return { ok: false, error: 'That rung has no training path.' }
  const r = normalizeCurriculumEdit(input)
  if (!r.ok) return r
  const overrides = parseCurriculumOverrides(await getPlatformSetting(CURRICULUM_KEY, ''))
  await writeOverrides({ ...overrides, [role]: r.edit }, by)
  return { ok: true }
}

/** Put one tier back to the code default (staff-gated callers only). */
export async function resetTierCurriculum(role: CommunityRole, by: string | null): Promise<void> {
  const overrides = parseCurriculumOverrides(await getPlatformSetting(CURRICULUM_KEY, ''))
  if (!overrides[role]) return
  const next = { ...overrides }
  delete next[role]
  await writeOverrides(next, by)
}
