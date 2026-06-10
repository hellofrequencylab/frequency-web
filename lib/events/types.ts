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
}
