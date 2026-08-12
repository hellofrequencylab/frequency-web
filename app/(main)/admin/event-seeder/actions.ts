'use server'

// ─────────────────────────────────────────────────────────────────────────────
// THE EVENT SEEDER — the operator console actions (ADR-989).
//
//   listStagedEvents      — the console list, newest first.
//   getStagedEventReview  — the field-by-field review model for one staged event.
//   updateStagedEventField— the operator's per-field EDIT / CONFIRM / DROP.
//   approveStagedEvent    — APPROVE -> apply, which writes an UNLISTED event draft.
//   setAsideStagedEvent   — this one is not worth seeding; take it off the board.
//
// THE MODEL COMES FROM THE MANIFEST. `getStagedEventReview` calls
// buildFieldModel(EVENT_MANIFEST, draft, ledger) — the Studio kernel (ADR-597/986) — and then
// narrows it to the paths this door carries (seededFieldsOnly). There is no hand-written field
// walker anywhere in this console: add a field to lib/studio/entities/event.ts and it appears
// here, labelled and grouped, with no edit to this file.
//
// AUTHZ: every action gates on requireAdmin('admin', { staff: 'community', staffLevel:
// 'write' }) — the same union the page uses, so whoever can SEE the console can work it.
// Reads are gated too: a staged row can hold third-party contact details lifted from a private
// group chat.
//
// ROW OWNERSHIP: the console gate answers "may you use this console", not "may you act on THAT
// row", and those are different questions. The list binds to the operator (created_by), so every
// PER-ROW action binds the same way through readOwnedIntake below: your own row, or any row when
// you are a platform admin (web_role admin / janitor), who already holds the deliberate
// re-seed-anything power. Anyone else holding a stranger's row id gets the honest empty state.
//
// FAIL-SAFE: a missing or degraded row returns a plain result, never throws to the page.
// ─────────────────────────────────────────────────────────────────────────────

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin/guard'
import { buildFieldModel, type FieldModel } from '@/lib/studio/kernel/review-kernel'
import type { ProvenanceLedger } from '@/lib/studio/kernel/ledger'
import { EVENT_MANIFEST } from '@/lib/studio/entities/event'
import { posterSignedUrl } from '@/lib/events/poster-media'
import { applyEventIntake } from '@/lib/events/seed/apply'
import {
  confirmEventLedger,
  readDraftValue,
  seededFieldsOnly,
  setDraftValue,
} from '@/lib/events/seed/draft'
import type { EventIntakeRow, EventIntakeSource, EventSeedDraft, IntakeStatus } from '@/lib/events/seed/intake'
import {
  getEventIntake,
  getEventIntakeForOperator,
  listEventIntakes,
  saveEventDraft,
  setEventIntakeStatus,
} from '@/lib/events/seed/store'

/** The operator rung for the whole console: platform staff, or a community staff role that
 *  can write. Returns the operator's profile id plus whether they are a PLATFORM admin
 *  (web_role admin / janitor), which is the row-ownership exception below. Redirects (never
 *  returns) on denial. */
async function gate(): Promise<{ operatorId: string; isPlatformAdmin: boolean }> {
  const { profileId, webRole } = await requireAdmin('admin', { staff: 'community', staffLevel: 'write' })
  return { operatorId: profileId, isPlatformAdmin: webRole === 'admin' || webRole === 'janitor' }
}

/**
 * Gate the console, then read ONE staged row the caller is allowed to act on:
 *
 *   • the caller's own row (created_by), which is exactly what the list shows them, OR
 *   • any row, when the caller is a platform admin (web_role admin / janitor).
 *
 * Every per-row action goes through here, so an authorized operator who holds another
 * operator's row id can no longer open, edit, or seed it. A refusal returns null, which each
 * caller already renders as "not found" — the same answer as a row that never existed, so the
 * console never confirms a stranger's row to someone who may not touch it.
 *
 * Returns the row WITH the caller's own profile id, so an action that also needs the operator
 * (the seed's owner) gates once rather than twice.
 */
async function readOwnedIntake(
  intakeId: string,
): Promise<{ row: EventIntakeRow; operatorId: string } | null> {
  const { operatorId, isPlatformAdmin } = await gate()
  const own = await getEventIntakeForOperator(intakeId, operatorId)
  if (own) return { row: own, operatorId }
  if (!isPlatformAdmin) return null
  const any = await getEventIntake(intakeId)
  return any ? { row: any, operatorId } : null
}

/** A best-effort display name for a staged row. */
function titleOf(row: EventIntakeRow): string {
  const draft = row.draft as Partial<EventSeedDraft>
  return (typeof draft.title === 'string' && draft.title.trim()) || 'Untitled event'
}

// ── The console list ──────────────────────────────────────────────────────────────

export interface StagedEventListItem {
  id: string
  status: IntakeStatus
  title: string
  /** Where it came from, as a phrase ("WhatsApp export, messages 412, 413"). */
  source: string
  door: EventIntakeSource
  /** The start, as the draft holds it (ISO or ''), for the card's when line. */
  startsAt: string
  isDemo: boolean
  targetEventId: string | null
  updatedAt: string
  error: string | null
}

/** List the operator's staged events, most-recently-touched first. Fail-safe: [] on error. */
export async function listStagedEvents(): Promise<StagedEventListItem[]> {
  const { operatorId } = await gate()
  const rows = await listEventIntakes(operatorId)
  return rows.map((row) => {
    const draft = row.draft as Partial<EventSeedDraft>
    return {
      id: row.id,
      status: row.status,
      title: titleOf(row),
      source: row.inputs.sourceLabel ?? 'Staged by hand',
      door: row.inputs.source ?? 'paste',
      startsAt: typeof draft.startsAt === 'string' ? draft.startsAt : '',
      isDemo: row.inputs.consent?.isDemo ?? true,
      targetEventId: row.targetEventId,
      updatedAt: row.updatedAt,
      error: row.error,
    }
  })
}

// ── One staged event, field by field ──────────────────────────────────────────────

export interface StagedEventReview {
  id: string
  status: IntakeStatus
  title: string
  source: string
  /** Which front door staged this, so the board can show the RIGHT receipt: a chat event cites
   *  the message it was read from, a flyer scan shows the poster. */
  door: EventIntakeSource
  /** The classifier's one-line reason, when it left one. */
  note: string
  /** The exact source text the draft was read from, so the operator can check it. */
  sourceText: string
  /** Filenames of the photos posted with it in the chat. NAMES ONLY, on purpose (ADR-997): no
   *  chat photo is carried across, and the board says so rather than implying otherwise. */
  imageNames: string[]
  /** A short-lived signed URL for the scanned flyer, when this came through the scan door.
   *  The photo IS the receipt for a scan, so the operator checks the read against it. */
  posterUrl: string | null
  isDemo: boolean
  targetEventId: string | null
  error: string | null
  model: FieldModel
  createdAtISO: string
  updatedAtISO: string
}

/** Load the field-by-field review for one staged event. Null when it is absent or unreadable
 *  (the page then shows a clear empty state). */
export async function getStagedEventReview(intakeId: string): Promise<StagedEventReview | null> {
  const owned = await readOwnedIntake(intakeId)
  if (!owned) return null
  const { row } = owned
  return {
    id: row.id,
    status: row.status,
    title: titleOf(row),
    source: row.inputs.sourceLabel ?? 'Staged by hand',
    door: row.inputs.source ?? 'paste',
    note: row.inputs.note ?? '',
    sourceText: row.inputs.sourceText ?? '',
    imageNames: row.inputs.imageNames ?? [],
    // Signed here, on the server, from the path the stager wrote. The private bucket is never
    // opened up; the operator gets a short-lived URL for as long as the page is on screen.
    posterUrl: await posterSignedUrl(row.inputs.posterPath ?? null),
    isDemo: row.inputs.consent?.isDemo ?? true,
    targetEventId: row.targetEventId,
    error: row.error,
    model: modelFor(row),
    createdAtISO: row.createdAt,
    updatedAtISO: row.updatedAt,
  }
}

/** The manifest-derived model for one row, narrowed to the paths this door carries. */
function modelFor(row: EventIntakeRow): FieldModel {
  const ledger = (row.ledger as ProvenanceLedger) ?? {}
  return seededFieldsOnly(buildFieldModel(EVENT_MANIFEST, row.draft, ledger))
}

// ── Per-field edit / confirm / drop ───────────────────────────────────────────────

export type FieldAction = { kind: 'edit'; value: string } | { kind: 'confirm' } | { kind: 'drop' }

export type UpdateStagedFieldResult = { ok: true; model: FieldModel } | { ok: false; error: string }

/**
 * Apply one operator action to one field, persist the draft + ledger, and return the fresh
 * model. Bound to the intake id.
 *
 *   • edit    — write the value, and record it as a human-verified fact (an operator typing a
 *               value IS a confirmation of it).
 *   • confirm — keep the value, promote its entry to a human-verified fact. This is how "the
 *               AI read this off a chat message" becomes "a person checked it".
 *   • drop    — clear the value and forget its provenance.
 *
 * Editable while the row is in 'review' only: once it is applied, the event itself is the
 * thing to edit, in the draft editor, and pretending otherwise would be a second source of
 * truth. Fail-safe: a bad path or a wrong status returns a plain reason.
 */
export async function updateStagedEventField(
  intakeId: string,
  path: string,
  action: FieldAction,
): Promise<UpdateStagedFieldResult> {
  const owned = await readOwnedIntake(intakeId)
  if (!owned) return { ok: false, error: 'Staged event not found.' }
  const { row } = owned
  if (row.status !== 'review') {
    return { ok: false, error: `This one is '${row.status}', not open for edits.` }
  }

  const draft = structuredClone(row.draft)
  const ledger: ProvenanceLedger = structuredClone((row.ledger as ProvenanceLedger) ?? {})

  if (action.kind === 'edit') {
    const value = (action.value ?? '').trim()
    if (!setDraftValue(draft, path, value)) return { ok: false, error: 'That field could not be updated.' }
    confirmEventLedger(ledger, path, value)
  } else if (action.kind === 'confirm') {
    const current = readDraftValue(draft, path)
    if (!current) return { ok: false, error: 'Nothing to confirm. The field is empty.' }
    confirmEventLedger(ledger, path, current)
  } else if (action.kind === 'drop') {
    if (!setDraftValue(draft, path, '')) return { ok: false, error: 'That field could not be cleared.' }
    delete ledger[path]
  } else {
    return { ok: false, error: 'Unknown field action.' }
  }

  const saved = await saveEventDraft(intakeId, { draft, ledger })
  if (!saved) return { ok: false, error: 'Could not save the change.' }
  return { ok: true, model: seededFieldsOnly(buildFieldModel(EVENT_MANIFEST, draft, ledger)) }
}

// ── Approve -> apply ──────────────────────────────────────────────────────────────

export type ApproveStagedEventResult =
  | { ok: true; eventId: string; draftHref: string; alreadyApplied: boolean }
  | { ok: false; error: string }

/**
 * Approve the reviewed draft and seed it as an event. It materializes through the EXISTING
 * event writer (lib/events/event-drafts.createEventDraft) as an events row at status='draft':
 * an UNLISTED demo, in no catalog, no feed, and no search, owned by the operator until they
 * publish it from the draft editor. Publishing is the deliberate flip to live, and the
 * existing publish path mints the claim token so the real organizer can take it over.
 */
export async function approveStagedEvent(intakeId: string): Promise<ApproveStagedEventResult> {
  const owned = await readOwnedIntake(intakeId)
  if (!owned) return { ok: false, error: 'Staged event not found.' }
  const result = await applyEventIntake(intakeId, { operatorProfileId: owned.operatorId })
  if (!result.ok) return { ok: false, error: result.error }

  revalidatePath('/admin/event-seeder')
  revalidatePath('/events/drafts')
  return {
    ok: true,
    eventId: result.eventId,
    draftHref: `/events/drafts/${result.eventId}`,
    alreadyApplied: result.alreadyApplied,
  }
}

// ── Set aside ─────────────────────────────────────────────────────────────────────

export type SetAsideResult = { ok: true } | { ok: false; error: string }

/** Take a staged event off the review board without seeding it (the chatter a classifier read
 *  as an event, a duplicate, an event that already exists). It lands in the recoverable side
 *  state with a plain reason, so it can be picked back up rather than being lost. */
export async function setAsideStagedEvent(intakeId: string): Promise<SetAsideResult> {
  const owned = await readOwnedIntake(intakeId)
  if (!owned) return { ok: false, error: 'Staged event not found.' }
  const moved = await setEventIntakeStatus(intakeId, 'failed', { error: 'Set aside by the operator.' })
  if (!moved) return { ok: false, error: 'Could not set this one aside. It may already be seeded.' }
  revalidatePath('/admin/event-seeder')
  return { ok: true }
}

/** Put a set-aside row back on the review board. */
export async function restoreStagedEvent(intakeId: string): Promise<SetAsideResult> {
  const owned = await readOwnedIntake(intakeId)
  if (!owned) return { ok: false, error: 'Staged event not found.' }
  const moved = await setEventIntakeStatus(intakeId, 'review', { error: null })
  if (!moved) return { ok: false, error: 'Could not restore this one.' }
  revalidatePath('/admin/event-seeder')
  return { ok: true }
}
