// ─────────────────────────────────────────────────────────────────────────────
// THE EVENT SEEDER — the intake types + the status machine (ADR-989).
//
// The admin counterpart to the Business Seeder, for events. PURE + framework-independent
// (no React / Next / Supabase), so the stagers, the persistence layer, the apply, and the
// tests all import the SAME contract. An `event_intake` row (migration 20270222000000)
// carries these shapes as jsonb.
//
// ONE STATUS MACHINE, NOT TWO. The stages a staged draft walks (intake -> researching ->
// review -> applied, with `failed` as a recoverable side-state) are identical to the
// Business Seeder's, so they are IMPORTED from lib/importer/intake rather than restated.
// That module is pure and framework-free, and a second copy of a five-state machine is a
// drift waiting to happen: a fix to `canTransition` has to reach both seeders.
// ─────────────────────────────────────────────────────────────────────────────

import type { DomainSlug, EventDetails, FieldConfidence } from '@/lib/events/types'
import {
  canTransition,
  INTAKE_STATUSES,
  type IntakeMode,
  type IntakeStatus,
} from '@/lib/importer/intake'

export { canTransition, INTAKE_STATUSES }
export type { IntakeMode, IntakeStatus }

// ── Intake inputs ─────────────────────────────────────────────────────────────────

/** Which front door produced the draft. `whatsapp` is a classified message out of a group
 *  chat export, `scan` is a photographed flyer read by the vision pass, `paste` is an
 *  operator pasting a write-up. Mirrors the event manifest's `accepts` (paste + image). */
export type EventIntakeSource = 'whatsapp' | 'scan' | 'paste'

/** Consent. `isDemo` decides the publish posture and is ALWAYS true for a seeded event: it
 *  materializes as an events row with status='draft' (unlisted, in no catalog) until an
 *  operator publishes it. Mirrors IntakeConsent on the business side. */
export interface EventIntakeConsent {
  isDemo: boolean
  /** Set once the real organizer has confirmed they want this event listed. */
  organizerConfirmed?: boolean
}

/** The captured inputs for one staged event: which door it came through and the raw
 *  material it was read from, so the review board can always show its receipt. */
export interface EventIntakeInputs {
  source: EventIntakeSource
  consent: EventIntakeConsent
  /** A short human label for where this came from ("WhatsApp export, messages 412-414"). */
  sourceLabel?: string
  /** The raw text the draft was read from (the chat message block, the pasted write-up). */
  sourceText?: string
  /** The `ref` line numbers of the parsed chat messages this event was read from. */
  chatRefs?: number[]
  /** Filenames of the photos posted alongside it in the chat. The operator uploads the real
   *  files on the event draft once it is applied; the names are the paper trail until then. */
  imageNames?: string[]
  /** The classifier's own one-line reason, in plain voice, for the operator's review. */
  note?: string
  /** The classifier's confidence in the whole read (drives the seeded ledger confidence). */
  confidence?: FieldConfidence
}

// ── Harvested sources ─────────────────────────────────────────────────────────────

/** The kind of a raw staged source, one entry per read. */
export type EventSourceKind = 'chat' | 'paste' | 'poster'

/** One raw source behind a staged event. The array is the cache: a re-read of the draft
 *  costs no new AI call, and every ledger citation points back at one of these snippets. */
export interface EventHarvestedSource {
  id: string
  kind: EventSourceKind
  capturedAt: string
  /** The exact text that was read (a chat message block, the pasted flyer copy). */
  text?: string
  /** A human label for the source ("WhatsApp export, messages 412-414"). */
  label?: string
  meta?: Record<string, unknown>
}

// ── The draft ─────────────────────────────────────────────────────────────────────

/**
 * The EVENT DRAFT, keyed by the EVENT_MANIFEST field paths (lib/studio/entities/event.ts).
 * Those paths are deliberately the same vocabulary as `ExtractedEvent` + `EventDetails`
 * (lib/events/types.ts) and the create form's FormData keys, which is what lets ONE draft
 * shape serve the poster scan, the chat importer, the review board, and the writer.
 *
 * Everything is optional except the two things creation cannot do without (title, startsAt),
 * and even those can be blank on a staged draft: the whole point of review is to SEE the gap
 * before anything is written. The apply is what refuses an incomplete draft.
 */
export interface EventSeedDraft {
  title: string
  description: string
  startsAt: string
  endsAt: string
  location: string
  isFree: boolean
  priceCents: number | null
  organizerName: string
  organizerContact: string
  domain: DomainSlug | null
  tags: string[]
  /** The kind of gathering (the manifest's CATEGORIES). Defaults to 'gathering'. */
  category?: string
  /** Venue split out of the one-line place, when the source gave one. */
  venueName?: string
  city?: string
  details: EventDetails
}

// ── The full staging row shape (jsonb columns typed) ──────────────────────────────

/** The typed view of an `event_intake` row. The table is not in database.types (ADR-246),
 *  so the persistence layer reaches it with narrow untyped casts and returns THIS shape. */
export interface EventIntakeRow {
  id: string
  createdBy: string
  mode: IntakeMode
  status: IntakeStatus
  inputs: EventIntakeInputs
  rawSources: EventHarvestedSource[]
  /** The staged draft (a Partial EventSeedDraft until the read completes). */
  draft: Record<string, unknown>
  ledger: Record<string, unknown>
  budgetSpent: number
  targetEventId: string | null
  appliedAt: string | null
  error: string | null
  createdAt: string
  updatedAt: string
}
