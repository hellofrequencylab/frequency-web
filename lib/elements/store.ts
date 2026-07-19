// Embeddable elements — the element_settings IO (docs/EMBEDDABLE-ELEMENTS.md §3). Reads the platform
// MASTER row + an optional per-space OVERRIDE and resolves them over the registry defaults; writes a
// row. Service-role (admin client) behind app-layer authz (callers gate). FAIL-SAFE: any error or a
// missing table/row resolves to the registry defaults, so the app is correct before the migration
// applies. element_settings isn't in the generated types yet (ADR-246), so it is reached untyped.

import { createAdminClient } from '@/lib/supabase/admin'
import { elementDef, type ElementKey } from './registry'
import {
  normalizeElementConfig,
  resolveElementConfig,
  type StoredElementConfig,
  type ResolvedElement,
} from './config'

/** The known feature keys for an element (the allowlist normalizeElementConfig writes by). */
function featureKeysFor(elementKey: string): string[] {
  return elementDef(elementKey)?.features.map((f) => f.key) ?? []
}

type ConfigRow = { id?: string; config?: unknown }

// A tiny untyped query surface for element_settings (not in the generated DB types yet).
interface Chain {
  select: (cols: string) => Chain
  eq: (col: string, val: string) => Chain
  is: (col: string, val: null) => Chain
  maybeSingle: () => Promise<{ data: ConfigRow | null; error: unknown }>
  update: (patch: Record<string, unknown>) => Chain
  insert: (row: Record<string, unknown>) => Promise<{ error: unknown }>
}
function table(): Chain {
  return (createAdminClient() as unknown as { from: (t: string) => Chain }).from('element_settings')
}

/** The stored master + per-space layers for an element (each normalized; fail-safe to empty). */
export async function readElementLayers(
  elementKey: string,
  spaceId?: string | null,
): Promise<{ platform: StoredElementConfig; space: StoredElementConfig | null }> {
  try {
    const keys = featureKeysFor(elementKey)
    const { data: master } = await table().select('config').eq('element_key', elementKey).is('space_id', null).maybeSingle()
    let space: StoredElementConfig | null = null
    if (spaceId) {
      const { data: spaceRow } = await table().select('config').eq('element_key', elementKey).eq('space_id', spaceId).maybeSingle()
      space = spaceRow ? normalizeElementConfig(spaceRow.config, keys) : null
    }
    return { platform: master ? normalizeElementConfig(master.config, keys) : {}, space }
  } catch {
    return { platform: {}, space: null }
  }
}

/** Resolve an element to its effective settings + roles (defaults <- master <- space). Null for an
 *  unknown element key. */
export async function resolveElement(
  elementKey: ElementKey,
  spaceId?: string | null,
): Promise<ResolvedElement | null> {
  const def = elementDef(elementKey)
  if (!def) return null
  const layers = await readElementLayers(elementKey, spaceId)
  return resolveElementConfig(def, layers.platform, layers.space)
}

/** Upsert one element_settings row (the master when spaceId is null, else a per-space override).
 *  Read-then-update-or-insert (the nullable-space unique keys are partial indexes, so a plain upsert
 *  can't target them). Caller enforces authz. */
export async function writeElementSettings(
  elementKey: string,
  spaceId: string | null,
  config: StoredElementConfig,
  updatedBy: string,
): Promise<{ error?: string }> {
  try {
    const existing = spaceId
      ? await table().select('id').eq('element_key', elementKey).eq('space_id', spaceId).maybeSingle()
      : await table().select('id').eq('element_key', elementKey).is('space_id', null).maybeSingle()
    const patch = { config: normalizeElementConfig(config, featureKeysFor(elementKey)), updated_by: updatedBy, updated_at: new Date().toISOString() }
    if (existing.data?.id) {
      const { error } = await table().update(patch).eq('id', existing.data.id).maybeSingle()
      if (error) return { error: String((error as { message?: string })?.message ?? 'Could not save.') }
      return {}
    }
    const { error } = await table().insert({ element_key: elementKey, space_id: spaceId, ...patch })
    if (error) return { error: String((error as { message?: string })?.message ?? 'Could not save.') }
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not save.' }
  }
}
