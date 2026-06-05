// Entry-point A/B testing (ADR-136, Phase 3). Destination variants under one entry
// point: the /q resolver splits scan traffic by weight (pickVariant), records the
// served variant per scan, and a fq_var cookie carries it to signup so conversions
// attribute per variant (recordEntryPointConversion). pickVariant is pure + tested;
// the rest is I/O. Server-only (except the pure helpers).

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'

export interface EntryVariant {
  id: string
  key: string
  label: string
  targetUrl: string
  weight: number
  active: boolean
}

interface VariantRow {
  id: string; variant_key: string; label: string; target_url: string; weight: number; active: boolean
}
function toVariant(r: VariantRow): EntryVariant {
  return { id: r.id, key: r.variant_key, label: r.label, targetUrl: r.target_url, weight: r.weight, active: r.active }
}

function db(): SupabaseClient {
  return createAdminClient() as unknown as SupabaseClient
}

/**
 * Weighted pick over the ACTIVE variants. Pure (rand defaults to Math.random for the
 * resolver; tests pass a fixed value). Returns null when there's no active variant —
 * the caller then keeps the entry point's default destination (the control).
 */
export function pickVariant(variants: EntryVariant[], rand: number = Math.random()): EntryVariant | null {
  const active = variants.filter((v) => v.active && v.weight > 0)
  if (active.length === 0) return null
  const total = active.reduce((s, v) => s + v.weight, 0)
  const clamped = rand < 0 ? 0 : rand >= 1 ? 0.999999999 : rand
  let r = clamped * total
  for (const v of active) {
    r -= v.weight
    if (r < 0) return v
  }
  return active[active.length - 1]
}

/** All variants for an entry point, by key. */
export async function listVariants(codeId: string): Promise<EntryVariant[]> {
  const { data } = await db()
    .from('entry_point_variants')
    .select('id, variant_key, label, target_url, weight, active')
    .eq('qr_code_id', codeId)
    .order('variant_key', { ascending: true })
  return ((data as VariantRow[] | null) ?? []).map(toVariant)
}

/** Active variants only — the set the resolver splits over. */
export async function listActiveVariants(codeId: string): Promise<EntryVariant[]> {
  return (await listVariants(codeId)).filter((v) => v.active)
}

export interface VariantResult extends EntryVariant {
  scans: number
  conversions: number
  /** Conversions / scans, 0 when no scans. */
  rate: number
}

/** Per-variant scans + conversions + rate for the results view. */
export async function variantResults(codeId: string): Promise<VariantResult[]> {
  const [variants, { data: scanRows }, { data: convRows }] = await Promise.all([
    listVariants(codeId),
    db().from('qr_scans').select('variant_key').eq('qr_code_id', codeId).not('variant_key', 'is', null),
    db().from('entry_point_conversions').select('variant_key').eq('qr_code_id', codeId),
  ])

  const scans = new Map<string, number>()
  for (const s of (scanRows as { variant_key: string | null }[] | null) ?? []) {
    if (s.variant_key) scans.set(s.variant_key, (scans.get(s.variant_key) ?? 0) + 1)
  }
  const convs = new Map<string, number>()
  for (const c of (convRows as { variant_key: string }[] | null) ?? []) {
    convs.set(c.variant_key, (convs.get(c.variant_key) ?? 0) + 1)
  }

  return variants.map((v) => {
    const s = scans.get(v.key) ?? 0
    const c = convs.get(v.key) ?? 0
    return { ...v, scans: s, conversions: c, rate: s > 0 ? c / s : 0 }
  })
}

/** Record a signup as a conversion of (codeId, variantKey). One per person per entry
 *  point (unique constraint); best-effort. */
export async function recordEntryPointConversion(codeId: string, variantKey: string, profileId: string): Promise<void> {
  try {
    await db()
      .from('entry_point_conversions')
      .upsert(
        { qr_code_id: codeId, variant_key: variantKey, profile_id: profileId },
        { onConflict: 'qr_code_id,profile_id', ignoreDuplicates: true },
      )
  } catch {
    // attribution is a bonus, never a blocker on signup
  }
}
