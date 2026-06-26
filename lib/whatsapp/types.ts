// Shared types for the WhatsApp chat-import engine: parse an exported chat .txt,
// classify each message, and STAGE events / housing listings for an operator to
// review before anything is created. Framework-free so the parser, the redactor,
// the AI extractor, and any future writer share one vocabulary (mirrors
// lib/events/types.ts). Nothing in this module writes to the DB — the whole flow
// produces a PREVIEW the operator approves. Members posted into a private group;
// the claim handshake (events) and the redactor (housing) are how we respect that.

import type { ExtractedEvent, FieldConfidence } from '@/lib/events/types'
import type { HousingType, RoomType } from '@/lib/listings/types'

/** One message parsed out of a WhatsApp export. `system` lines (the encryption
 *  notice, "X added Y", a group-subject change) carry no author and never classify. */
export interface WhatsAppMessage {
  /** 1-based line number of this message's FIRST line in the export, so a staged
   *  item can cite exactly where it came from. */
  ref: number
  /** ISO 8601 timestamp when the printed date/time parsed cleanly; '' otherwise. */
  timestamp: string
  /** The date/time text exactly as printed (kept for display when ISO parse fails). */
  rawTimestamp: string
  /** Sender display name as printed, or '' for a system line. */
  author: string
  /** The message body, with any continuation lines joined by newlines. */
  text: string
  /** True for a system / notice line (no sender). */
  system: boolean
  /** True when the body was ONLY an attachment marker (image/video/doc omitted). */
  attachmentOnly: boolean
}

/** The detected source format of an export. iOS brackets its timestamps; Android
 *  uses a ` - ` separator. `unknown` when no line matched either prefix. */
export type ExportFormat = 'ios' | 'android' | 'unknown'

export interface ParsedExport {
  messages: WhatsAppMessage[]
  format: ExportFormat
  /** Counts the UI surfaces so an operator can trust the parse before AI runs. */
  stats: {
    total: number
    system: number
    attachmentOnly: number
    authored: number
  }
}

/** What an operator is deciding about each staged item. Events and housing get
 *  structured fields; everything else is `other` (chatter, questions, noise). */
export type ImportCategory = 'event' | 'housing' | 'roommate' | 'other'

/** A housing / roommate listing the model read out of a message. Extraction-only
 *  (mirrors the listings contract in lib/listings) until an operator approves it.
 *  `contacts` are the phone/email/handle the poster left INLINE, pulled out so they
 *  never land in public copy until the listing is claimed by its owner. */
export interface HousingExtract {
  title: string
  description: string
  listingType: HousingType
  roomType: RoomType | null
  /** Whole cents, or null when no rent is stated. */
  rentCents: number | null
  bedrooms: number | null
  neighborhood: string
  city: string
  /** ISO date the place is available, or '' when not stated. */
  availableFrom: string
  /** Inline contact details lifted out of the body (kept off public copy until claimed). */
  contacts: string[]
}

/** One staged item the operator reviews: where it came from, what it is, and the
 *  structured fields (events reuse ExtractedEvent; housing/roommate use HousingExtract). */
export interface ClassifiedItem {
  /** The `ref`(s) of the parsed message(s) this item was read from. */
  refs: number[]
  category: ImportCategory
  /** The model's own confidence, so the UI can flag low-confidence rows for a look. */
  confidence: FieldConfidence
  /** A one-line reason, in plain voice, for the operator's review. */
  note: string
  /** Present when category === 'event'. */
  event?: ExtractedEvent
  /** Present when category is 'housing' or 'roommate'. */
  housing?: HousingExtract
}

/** The full dry-run result: the parse, the staged items, and whether AI ran. The
 *  operator surface renders this; NOTHING here has been written anywhere. */
export interface ImportPreview {
  parse: ParsedExport
  items: ClassifiedItem[]
  /** True when AI was off or over budget — the operator sees the parse only. */
  aiSkipped: boolean
  /** True when the export was longer than the per-run cap and was truncated. */
  truncated: boolean
  counts: Record<ImportCategory, number>
}
