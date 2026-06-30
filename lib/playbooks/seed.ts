// Code-first playbook SEED (Resonance Engine · ADR-382 · docs/NEXT-GEN-CRM.md "prediction -> playbook
// -> action"). Mirrors the CODE registry (lib/playbooks/registry.ts, the source of truth for shape +
// the suggest-by-default autonomy law) into the durable `playbooks` table, so the runtime catalog is
// populated from one declaration and the table is no longer empty. The code registry stays the
// authority; this is a projection of it for the per-Space override + dashboard reads.
//
// IDEMPOTENT: upserts on the (platform-scope, slug) key the migration declared unique, so re-running
// it is a no-op that keeps the table in sync with the code (a renamed sequence or a flipped tier
// re-stamps cleanly, never duplicates). PLATFORM SCOPE ONLY: every seeded row has space_id NULL (the
// platform-default playbook). A Space override is a separate, owner-driven row (the autonomy slider),
// never seeded here.
//
// FAIL-SAFE: any error returns { ok: false } and never throws (the table is service-role only and is
// not in the generated DB types until they regenerate, ADR-246, so this reaches it through the untyped
// admin client). The seed is a maintenance/setup convenience, never on a request hot path; a failure
// degrades to "the code registry still drives everything", which is already the live behavior.
//
// authz-delegated: this is a SYSTEM seed (service-role). The only caller is a staff-gated setup path;
// there is no per-caller scope to enforce here.

import { createAdminClient } from '@/lib/supabase/admin'
import { PLAYBOOK_REGISTRY, type Playbook } from './registry'

/** The platform (NULL space_id) scope sentinel the unique index folds NULL to. Mirrors the migration's
 *  COALESCE fold so a conflict target is well-defined for the upsert. */
const PLATFORM_SCOPE = '00000000-0000-0000-0000-000000000000'

/** The trigger column value for a playbook (the prediction signal that selects it). A next_best_action
 *  value or a churn_risk tier or the literal 'failed_payment'. PURE. */
export function triggerSignal(p: Playbook): string {
  switch (p.trigger.kind) {
    case 'next_best_action':
      return p.trigger.value
    case 'churn_risk':
      return `churn_${p.trigger.value}`
    case 'failed_payment':
      return 'failed_payment'
  }
}

/** One row shaped for the `playbooks` table from a registry entry. PURE. The action_sequence is the
 *  same descriptor shape the code registry carries (tool + surface + label), persisted as jsonb. */
export interface PlaybookSeedRow {
  slug: string
  trigger_signal: string
  action_sequence: { tool: string; surface: string; label: string }[]
  autonomy_tier: string
  space_id: null
}

/** Project the whole code registry to its seed rows (platform scope). PURE, so the projection is
 *  unit-testable without touching the DB. */
export function buildSeedRows(): PlaybookSeedRow[] {
  return PLAYBOOK_REGISTRY.map((p) => ({
    slug: p.id,
    trigger_signal: triggerSignal(p),
    action_sequence: p.actions.map((a) => ({ tool: a.tool, surface: a.surface, label: a.label })),
    autonomy_tier: p.autonomyTier,
    space_id: null,
  }))
}

export interface SeedResult {
  ok: boolean
  /** How many platform playbook rows were upserted (0 on a failed/absent table). */
  upserted: number
  error?: string
}

/**
 * Seed the code registry into the platform `playbooks` rows. IDEMPOTENT + FAIL-SAFE. Reads the existing
 * platform slugs first, then INSERTs the missing rows and UPDATEs any whose shape drifted (trigger /
 * sequence / tier), so a re-run keeps the table in sync with the code and never duplicates. Done as a
 * read-then-write rather than an ON CONFLICT upsert because the table's uniqueness is a COALESCE
 * EXPRESSION index (over a nullable space_id), which a plain onConflict column list cannot target; this
 * keeps the seed fully migration-free. Returns the count written, or { ok: false } when the table is
 * absent / a write fails. The caller (a staff-gated setup action) is the authority.
 */
export async function seedPlaybooks(): Promise<SeedResult> {
  const rows = buildSeedRows()
  try {
    const db = createAdminClient() as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          is: (col: string, val: null) => Promise<{ data: ExistingRow[] | null; error: unknown }>
        }
        insert: (rows: Record<string, unknown>[]) => Promise<{ error: unknown }>
        update: (patch: Record<string, unknown>) => { eq: (col: string, val: string) => Promise<{ error: unknown }> }
      }
    }

    // The platform rows already present (space_id IS NULL): map slug -> the stored shape, so we only
    // write what actually changed.
    const { data: existingData, error: readErr } = await db
      .from('playbooks')
      .select('id, slug, trigger_signal, action_sequence, autonomy_tier')
      .is('space_id', null)
    if (readErr) return { ok: false, upserted: 0, error: 'Could not read the playbooks table.' }
    const existing = new Map<string, ExistingRow>()
    for (const r of existingData ?? []) if (typeof r.slug === 'string') existing.set(r.slug, r)

    const toInsert: PlaybookSeedRow[] = []
    const toUpdate: { id: string; row: PlaybookSeedRow }[] = []
    for (const row of rows) {
      const prior = existing.get(row.slug)
      if (!prior) {
        toInsert.push(row)
      } else if (rowDrifted(prior, row)) {
        toUpdate.push({ id: prior.id, row })
      }
    }

    let written = 0
    if (toInsert.length > 0) {
      const { error } = await db.from('playbooks').insert(toInsert as unknown as Record<string, unknown>[])
      if (error) return { ok: false, upserted: 0, error: 'Could not seed the new playbooks.' }
      written += toInsert.length
    }
    for (const u of toUpdate) {
      const { error } = await db
        .from('playbooks')
        .update({
          trigger_signal: u.row.trigger_signal,
          action_sequence: u.row.action_sequence,
          autonomy_tier: u.row.autonomy_tier,
          updated_at: new Date().toISOString(),
        })
        .eq('id', u.id)
      if (error) return { ok: false, upserted: written, error: 'Could not update a drifted playbook.' }
      written += 1
    }

    return { ok: true, upserted: written }
  } catch {
    return { ok: false, upserted: 0, error: 'The playbooks table is not reachable.' }
  }
}

type ExistingRow = {
  id: string
  slug: string
  trigger_signal: string | null
  action_sequence: unknown
  autonomy_tier: string | null
}

/** True when a stored platform row's shape differs from the code registry's projection (so a re-seed
 *  re-stamps it). PURE. Compares the trigger, the autonomy tier, and the action sequence by value. */
export function rowDrifted(prior: ExistingRow, next: PlaybookSeedRow): boolean {
  if (prior.trigger_signal !== next.trigger_signal) return true
  if (prior.autonomy_tier !== next.autonomy_tier) return true
  return JSON.stringify(prior.action_sequence ?? []) !== JSON.stringify(next.action_sequence)
}

export { PLATFORM_SCOPE }
