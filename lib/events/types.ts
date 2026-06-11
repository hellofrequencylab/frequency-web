// Shared types for the Poster Events engine (capture a poster, AI builds a draft,
// publish for Zaps, the organizer claims it). Framework-free so the AI module, the
// normalizer, the draft store, and any future client/server actions share one
// vocabulary. Mirrors lib/connections/types.ts (the Profile Creator).

/** The four top-level Domains (Mind / Body / Spirit / Expression). Matches the
 *  `domains.slug` taxonomy (20260604010000_channels_domains_taxonomy). */
export type DomainSlug = 'mind' | 'body' | 'spirit' | 'expression'

/** A normalized (0..1) bounding box around the best cover-image region on the
 *  poster, so the UI can crop a good event cover (mirrors the card's face box). */
export interface ImageBox {
  x: number
  y: number
  w: number
  h: number
}

/** A normalized (0..1) corner point on the poster. */
export interface CornerPoint {
  x: number
  y: number
}

/** The model's honest read on capture quality, so the UI can offer a plain
 *  retake tip. Extraction-only (never a DB column). */
export interface CaptureQuality {
  legible: boolean
  glare: boolean
  skew: boolean
  /** A short, plain retake tip (no em dashes, no emojis), or null when fine. */
  note: string | null
}

/** Low/high confidence flag the model can attach to an uncertain field, so the
 *  UI can mark it for review on hard-to-read posters. */
export type FieldConfidence = 'high' | 'low'

/** A person or act on the poster (band, speaker, dj, ...). imageBox is a
 *  normalized crop region of their photo; the UI crops it client-side. */
export interface LineupItem {
  name: string
  role: 'band' | 'speaker' | 'dj' | 'performer' | 'host' | 'other'
  note?: string
  imageBox?: ImageBox
  confidence?: FieldConfidence
}

/** One row of a printed schedule / set times. */
export interface ScheduleItem {
  time?: string
  title: string
  note?: string
  confidence?: FieldConfidence
}

/** A ticket tier printed on the poster. priceCents is whole cents or null. */
export interface TicketTier {
  label: string
  priceCents?: number | null
  note?: string
  confidence?: FieldConfidence
}

/** A link printed on the poster. */
export interface EventLink {
  label: string
  url: string
  kind: 'tickets' | 'rsvp' | 'website' | 'instagram' | 'other'
}

/** A croppable image region on the poster for the gallery (other than the cover). */
export interface ImageRegion {
  box: ImageBox
  kind: 'logo' | 'photo' | 'art'
  note?: string
}

/** A catch-all label/value pair for anything that does not fit the other slots. */
export interface OtherDetail {
  label: string
  value: string
}

/** The rich, flexible harvest of everything else on the poster. Every field is
 *  optional and omitted when empty. Persisted as the events.details JSONB column;
 *  the UI crops imageBox/imageRegions client-side (we never process the images). */
export interface EventDetails {
  lineup?: LineupItem[]
  schedule?: ScheduleItem[]
  features?: string[]
  tickets?: TicketTier[]
  links?: EventLink[]
  sponsors?: string[]
  imageRegions?: ImageRegion[]
  other?: OtherDetail[]
  /** A top-level read on how confidently this poster could be parsed at all. */
  confidence?: FieldConfidence
}

/** What the AI extraction (vision scan or text assist) yields — already coerced
 *  to a safe, fully-populated shape by coerceEventExtraction(). */
export interface ExtractedEvent {
  title: string
  /** A clean 1-2 sentence description, voice-canon (no hype, no em dashes). */
  description: string
  /** ISO 8601 start, or '' if the poster gives no usable date/time. */
  startsAt: string
  /** ISO 8601 end, or '' if absent. */
  endsAt: string
  /** Venue + city as printed (free text). */
  location: string
  /** True when the poster says the event is free. */
  isFree: boolean
  /** Price in cents when a paid price is printed; null otherwise (or when free). */
  priceCents: number | null
  organizerName: string
  organizerContact: string
  /** Best-guess Domain for the event, or null when nothing fits. */
  domain: DomainSlug | null
  tags: string[]
  /** The cover-image crop region the model found on the poster, if any. */
  cover: { found: boolean; box: ImageBox | null; imageIndex: number }
  /** Four normalized (0..1) poster corners in order
   *  [top-left, top-right, bottom-right, bottom-left] for a client-side
   *  perspective deskew, or null when the model cannot locate them. */
  corners: [CornerPoint, CornerPoint, CornerPoint, CornerPoint] | null
  /** The model's honest read on capture quality (legibility / glare / skew). */
  quality: CaptureQuality
  /** The rich, flexible harvest of everything else on the poster (all optional). */
  details: EventDetails
}
