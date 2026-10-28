// THE SOURCE SHELF, STORE (VLS-12). Reads and writes the person's own sources and facts under their session (RLS:
// the owner of the launch, so this file holds no authorization beyond the launch id it is given). The rules are
// lib/launch/sources.ts and facts.ts. Sources and facts never go to a pixel or a log. Server-only.

import { createClient } from '@/lib/supabase/server'
import { checkFact, type FactInput, type FactState, type ShelfFact } from './facts'
import { checkSource, expiryFor, type SourceInput, type SourceKind } from './sources'

interface ShelfSource {
  id: string
  kind: SourceKind
  label: string
  sizeBytes: number
  charCount: number
  expiresAt: string | null
}

export async function addSource(launchId: string, input: SourceInput): Promise<ShelfSource | null> {
  const checked = checkSource(input)
  if (!checked.ok) return null
  const s = checked.source
  const db = await createClient()
  const { data, error } = await db
    .from('launch_sources')
    .insert({ launch_id: launchId, kind: s.kind, label: s.label, size_bytes: s.sizeBytes, char_count: s.charCount })
    .select('id, kind, label, size_bytes, char_count, expires_at')
    .single()
  if (error || !data) return null
  return { id: data.id, kind: data.kind as SourceKind, label: data.label, sizeBytes: data.size_bytes, charCount: data.char_count, expiresAt: data.expires_at }
}

export async function listSources(launchId: string): Promise<ShelfSource[]> {
  const db = await createClient()
  const { data } = await db.from('launch_sources').select('id, kind, label, size_bytes, char_count, expires_at').eq('launch_id', launchId).order('created_at')
  return (data ?? []).map((r) => ({ id: r.id, kind: r.kind as SourceKind, label: r.label, sizeBytes: r.size_bytes, charCount: r.char_count, expiresAt: r.expires_at }))
}

/** Remove a source; the table deletes its facts with it (on delete cascade). */
export async function removeSource(launchId: string, sourceId: string): Promise<boolean> {
  const db = await createClient()
  const { error } = await db.from('launch_sources').delete().eq('launch_id', launchId).eq('id', sourceId)
  return !error
}

/** Add the facts read from one source. A fact the rules refuse is skipped, not stored; `sourceText` makes the check
 *  that each snippet is the person's own words. Returns how many were kept. */
export async function addFacts(launchId: string, sourceId: string, facts: readonly FactInput[], sourceText?: string): Promise<number> {
  const rows = facts.flatMap((f) => {
    const c = checkFact(f, sourceText)
    return c.ok ? [{ launch_id: launchId, source_id: sourceId, ...c.fact }] : []
  })
  if (rows.length === 0) return 0
  const db = await createClient()
  const { error } = await db.from('launch_facts').insert(rows)
  return error ? 0 : rows.length
}

export async function listFacts(launchId: string): Promise<ShelfFact[]> {
  const db = await createClient()
  const { data } = await db.from('launch_facts').select('id, slot, value, snippet, origin, state').eq('launch_id', launchId).order('created_at')
  return (data ?? []) as ShelfFact[]
}

export async function setFactState(launchId: string, factId: string, state: FactState): Promise<boolean> {
  const db = await createClient()
  const { error } = await db.from('launch_facts').update({ state }).eq('launch_id', launchId).eq('id', factId)
  return !error
}

/** A cancel starts the clock: the launch's sources are kept thirty days from now, then swept. */
export async function expireSources(launchId: string, cancelledAt: Date): Promise<boolean> {
  const db = await createClient()
  const { error } = await db.from('launch_sources').update({ expires_at: expiryFor(cancelledAt).toISOString() }).eq('launch_id', launchId)
  return !error
}
