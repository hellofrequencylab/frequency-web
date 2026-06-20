// CLIENT NOTES — per-Space PERSONAL DATA on a CRM contact (ENTITY-SPACES-BUILD §C Phase 2). A Space
// owner's private notes about one of their contacts, scoped to the Space. This is the read + write
// library behind the per-space CRM notes surface, the CRM analog of lib/spaces/memberships.ts.
//
// GDPR/CCPA: a note is PERSONAL DATA (a third party's information held by the Space), so this module
// is FAIL-CLOSED by construction:
//   • client_notes has RLS enabled with ZERO policies (20260713010000): the ONLY access path is here,
//     through the service-role admin client behind these gated actions.
//   • Every read AND write is gated on the SPACE OWNER (getSpaceCapabilities canEditProfile). A note
//     is NEVER exposed cross-space: every query filters space_id, and a contact is confirmed to
//     belong to the Space before its notes are read or written.
//   • READS fail-safe (return [] / null on any miss or error). WRITES fail-closed (return an error
//     and write nothing on a permission miss).
//
// SHAPE (mirrors memberships.ts): the PURE helper (body normalization) has no Supabase/Next imports,
// so it is unit-testable. The IO + action implementations are plain async functions here. This module
// has NO 'use server' directive (so it can ALSO export the pure helper + the types the surfaces
// import). The thin 'use server' wrappers the CLIENT components call live in
// lib/crm/client-notes-actions.ts. SERVER components import the read action straight from here.

import { createAdminClient } from '@/lib/supabase/admin'
import { getMyProfileId } from '@/lib/auth'
import { getSpaceById } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { getContact } from '@/lib/crm/pipeline'
import { type ActionResult, ok, fail } from '@/lib/action-result'

// ── Types ─────────────────────────────────────────────────────────────────────────────────────

/** One client note as the app consumes it (camelCased). `authorName` is resolved from the author
 *  profile for display; `body` is the (personal-data) note text. */
export interface ClientNote {
  id: string
  spaceId: string
  contactId: string | null
  authorProfileId: string | null
  authorName: string | null
  body: string
  createdAt: string
}

// A generous cap so a hostile write can never store an unbounded blob; trims on write.
const MAX_BODY_LEN = 4000

// ── PURE: body normalization (no IO, fully testable) ────────────────────────────────────────────

/** Trim + length-cap a raw note body to a clean string. Anything non-string collapses to ''. An
 *  empty result is the caller's signal to REJECT the write (a note must have a body). Pure. */
export function normalizeNoteBody(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  return raw.trim().slice(0, MAX_BODY_LEN)
}

// ── IO: the untyped admin-client seam (client_notes is not in generated types yet, ADR-246) ─────

type NoteRow = {
  id: string
  space_id: string
  contact_id: string | null
  author_profile_id: string | null
  body: string
  created_at: string
}

const NOTE_COLS = 'id, space_id, contact_id, author_profile_id, body, created_at'

/** The client_notes table via an untyped admin client (the table is not in the generated DB types
 *  yet, ADR-246). Loosely typed, mirroring lib/spaces/memberships.ts. */
function notesTable(): {
  select: (cols: string) => {
    eq: (col: string, val: string) => {
      eq: (col: string, val: string) => {
        order: (col: string, opts: { ascending: boolean }) => Promise<{ data: NoteRow[] | null; error: unknown }>
      }
    }
  }
  insert: (rows: Record<string, unknown>[]) => {
    select: (cols: string) => { maybeSingle: () => Promise<{ data: NoteRow | null; error: unknown }> }
  }
  delete: () => { eq: (col: string, val: string) => { eq: (col: string, val: string) => Promise<{ error: unknown }> } }
} {
  const db = createAdminClient() as unknown as { from: (t: string) => never }
  return db.from('client_notes')
}

/** Batch-read display names for a set of profile ids (service-role; FAIL-SAFE to an empty map). */
async function readAuthorNames(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const unique = [...new Set(ids.filter(Boolean))]
  if (unique.length === 0) return out
  try {
    const db = createAdminClient() as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          in: (col: string, vals: string[]) => Promise<{ data: { id: string; display_name: string | null }[] | null }>
        }
      }
    }
    const { data } = await db.from('profiles').select('id, display_name').in('id', unique)
    for (const p of data ?? []) out.set(p.id, p.display_name?.trim() || 'A teammate')
  } catch {
    // fall through to the empty map (callers default to null/'A teammate')
  }
  return out
}

// ── Authorization seam: the owner gate, returning the resolved profile id when allowed ──────────

/** Resolve the caller and confirm they may edit this Space (owner / admin / editor). Returns the
 *  caller's profile id when allowed, or null otherwise. Personal data is owner-gated end to end:
 *  reads AND writes both require this. */
async function requireSpaceEditor(spaceId: string): Promise<string | null> {
  const profileId = await getMyProfileId()
  if (!profileId) return null
  const space = await getSpaceById(spaceId)
  if (!space) return null
  const caps = await getSpaceCapabilities(space, profileId)
  return caps.canEditProfile ? profileId : null
}

// ── PUBLIC SERVER ACTIONS (all owner-gated + space-scoped) ──────────────────────────────────────

/**
 * The notes a Space holds on one contact, newest first. Gated on canEditProfile (owner / admin /
 * editor) and double-scoped: the contact must belong to THIS Space (getContact(contactId, spaceId)),
 * and every note row is filtered by space_id. FAIL-SAFE: an anonymous / non-editor caller, a contact
 * that is not in this Space, or any error all yield []. This is the read the owner notes surface
 * calls; it never exposes another Space's notes.
 */
export async function listClientNotes(spaceId: string, contactId: string): Promise<ClientNote[]> {
  const editorId = await requireSpaceEditor(spaceId)
  if (!editorId) return []

  // The contact must be a contact of THIS Space (no cross-space contact ids).
  const contact = await getContact(contactId, spaceId)
  if (!contact) return []

  try {
    const { data, error } = await notesTable()
      .select(NOTE_COLS)
      .eq('space_id', spaceId)
      .eq('contact_id', contactId)
      .order('created_at', { ascending: false })
    if (error || !data) return []

    const names = await readAuthorNames(data.map((r) => r.author_profile_id ?? '').filter(Boolean))
    return data.map((r) => ({
      id: r.id,
      spaceId: r.space_id,
      contactId: r.contact_id,
      authorProfileId: r.author_profile_id,
      authorName: r.author_profile_id ? names.get(r.author_profile_id) ?? null : null,
      body: r.body ?? '',
      createdAt: r.created_at,
    }))
  } catch {
    return []
  }
}

/**
 * Add a note about a contact. Gated on canEditProfile and space-scoped: the contact must belong to
 * THIS Space, the body must be non-empty (normalized + length-capped), and the row is stamped with
 * space_id + the author's profile id. Fail-closed: a permission miss / missing contact / empty body
 * writes nothing and returns an error. Returns the new note id.
 */
export async function addClientNote(
  spaceId: string,
  contactId: string,
  body: string,
): Promise<ActionResult<{ id: string }>> {
  const editorId = await requireSpaceEditor(spaceId)
  if (!editorId) return fail('You do not have permission to add notes for this space.')

  const clean = normalizeNoteBody(body)
  if (!clean) return fail('Write a note first.')

  // The contact must be a contact of THIS Space (no cross-space note attach).
  const contact = await getContact(contactId, spaceId)
  if (!contact) return fail('That contact is not in this space.')

  try {
    const { data, error } = await notesTable()
      .insert([
        {
          space_id: spaceId,
          contact_id: contactId,
          author_profile_id: editorId,
          body: clean,
        },
      ])
      .select(NOTE_COLS)
      .maybeSingle()
    if (error || !data) return fail('Could not save your note. Try again.')
    return ok({ id: data.id })
  } catch {
    return fail('Could not save your note. Try again.')
  }
}

/**
 * Delete a note. Gated on canEditProfile for the note's OWN Space, and space-scoped (the delete
 * filters BOTH id AND space_id, so a note id from another Space can never be deleted through a
 * different Space's context). The caller must pass the spaceId they are operating in; the delete
 * only touches a row whose space_id matches. Fail-closed on permission.
 */
export async function deleteClientNote(spaceId: string, noteId: string): Promise<ActionResult> {
  const editorId = await requireSpaceEditor(spaceId)
  if (!editorId) return fail('You do not have permission to delete notes for this space.')

  try {
    // Scope the delete by (id AND space_id): the row is only removed when it belongs to this Space,
    // so a cross-space note id is a no-op rather than a leak.
    const { error } = await notesTable().delete().eq('id', noteId).eq('space_id', spaceId)
    if (error) return fail('Could not delete the note. Try again.')
  } catch {
    return fail('Could not delete the note. Try again.')
  }
  return ok()
}
