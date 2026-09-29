// The RELATIONSHIP READ/WRITE LAYER — the IO half of the Resonance CRM restructure (ADR-625).
//
// The VOCABULARY (the registry, its types, and the four pure lookups over it) lives in
// lib/crm/relationship-kinds.ts and is re-exported at the bottom of this file, so every existing
// server caller and every `import type` is unchanged. CLIENT code must import from there.
//
// What is left here reaches public.contact_relationships through the service-role admin client,
// UNTYPED until lib/database.types.ts regenerates (ADR-246), and is FAIL-SAFE (any error degrades to
// an empty read / a no-op write, never a throw). The caller is the read/write authority: these are
// RLS-bypassing writes, so a staff / owner gate must run first.
//
// ── 🔴 `import 'server-only'` IS THE POINT OF THE LINE BELOW, NOT DECORATION (LIVE-037) ──────────
// The old header said the registry was "PURE (no Supabase/Next imports) so it is importable
// anywhere", and that was true of the registry and false of the file: because the two shared a
// module, `contacts-roster-client.tsx` ('use client') importing `assignableKinds` pulled the
// service-role admin client, @supabase/supabase-js and a crypto-browserify polyfill graph into the
// contacts roster's browser bundle. The directive turns the intent into a BUILD FAILURE: any client
// module that reaches this file now breaks the build, by name, instead of quietly shipping the
// database to a phone.
import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAssignableKind } from '@/lib/crm/relationship-kinds'

// The vocabulary, re-exported so no existing importer changes (ADR-1074's rule: extract the leaf,
// re-export it from the old home, then make the comment a directive).
export {
  RELATIONSHIP_KINDS,
  isRelationshipKind,
  isAssignableKind,
  relationshipKind,
  relationshipLabel,
  assignableKinds,
  derivedKinds,
} from '@/lib/crm/relationship-kinds'
export type {
  RelationshipCategory,
  RelationshipTone,
  RelationshipKindDef,
  RelationshipKind,
  ContactRelationship,
} from '@/lib/crm/relationship-kinds'

// ── IO reads ────────────────────────────────────────────────────────────────────

// There is no reader here. The classifier reads public.contact_relationships itself
// (lib/crm/classification.ts) and folds the rows into `relationshipKinds`; the batch reader that
// used to sit here had no caller and left with the SCAN-502 sweep (ADR-1583).

// ── IO writes (fail-safe, service-role; validate against the registry) ───────────

/**
 * Confer an ASSIGNABLE relationship on a contact. Validates `kind` against the registry: an unknown
 * or DERIVED kind is REJECTED (returns false, no write) — derived kinds are computed, never stored.
 * Idempotent-ish: if an active row for (contact, kind) already exists this is a no-op success.
 * FAIL-SAFE: any error returns false rather than throwing. The caller is the write authority.
 */
export async function addRelationship(
  contactId: string,
  kind: string,
  opts: { spaceId?: string | null; since?: string | null; meta?: Record<string, unknown> } = {},
): Promise<boolean> {
  if (!contactId || !isAssignableKind(kind)) return false
  try {
    const admin = createAdminClient()
    const table = (admin as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (col: string, val: string) => {
            eq: (col: string, val: string) => {
              eq: (col: string, val: string) => {
                limit: (n: number) => Promise<{ data: { id: string }[] | null; error: unknown }>
              }
            }
          }
        }
        insert: (row: Record<string, unknown>) => Promise<{ error: unknown }>
      }
    }).from('contact_relationships')

    // Skip a duplicate active row for the same (contact, kind).
    const { data: existing } = await table
      .select('id')
      .eq('contact_id', contactId)
      .eq('kind', kind)
      .eq('status', 'active')
      .limit(1)
    if (existing && existing.length > 0) return true

    const { error } = await table.insert({
      contact_id: contactId,
      space_id: opts.spaceId ?? null,
      kind,
      status: 'active',
      since: opts.since ?? null,
      meta: opts.meta ?? {},
    })
    return !error
  } catch {
    return false
  }
}

/**
 * End an ASSIGNABLE relationship (soft close: set status to 'ended', stamp updated_at). Pass a row
 * id, or a (contactId, kind) pair to end whichever active row matches. FAIL-SAFE: returns false on
 * any error or an unknown kind, never throws. The caller is the write authority.
 */
export async function endRelationship(
  target: { id: string } | { contactId: string; kind: string },
): Promise<boolean> {
  try {
    const admin = createAdminClient()
    const patch = { status: 'ended', updated_at: new Date().toISOString() }
    if ('id' in target) {
      if (!target.id) return false
      const { error } = await (admin as unknown as {
        from: (t: string) => {
          update: (v: Record<string, unknown>) => {
            eq: (col: string, val: string) => Promise<{ error: unknown }>
          }
        }
      })
        .from('contact_relationships')
        .update(patch)
        .eq('id', target.id)
      return !error
    }
    if (!target.contactId || !isAssignableKind(target.kind)) return false
    const { error } = await (admin as unknown as {
      from: (t: string) => {
        update: (v: Record<string, unknown>) => {
          eq: (col: string, val: string) => {
            eq: (col: string, val: string) => {
              eq: (col: string, val: string) => Promise<{ error: unknown }>
            }
          }
        }
      }
    })
      .from('contact_relationships')
      .update(patch)
      .eq('contact_id', target.contactId)
      .eq('kind', target.kind)
      .eq('status', 'active')
    return !error
  } catch {
    return false
  }
}
