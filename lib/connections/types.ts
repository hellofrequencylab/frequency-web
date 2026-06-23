// Shared types for the Profile Creator / Network Profiles feature
// (docs/NETWORK-CRM.md, ADR-098). Framework-free so client components, server
// actions, the store, and the AI module can all share one vocabulary.

export type Visibility = 'private' | 'shared' | 'network'
export type ContactSource = 'manual' | 'card_scan' | 'poster' | 'import' | 'qr_scan'
export type ContactStatus = 'new' | 'active' | 'archived'
export type NoteKind = 'note' | 'connection' | 'ai'
export type TagSource = 'manual' | 'ai'

/** A normalized (0..1) bounding box around a face/portrait on the source image. */
export interface FaceBox {
  x: number
  y: number
  w: number
  h: number
}

// Shared capture vocabulary, reused from the Poster Events engine so the two
// scanners speak one language (corners for deskew, an honest quality read, and
// low/high confidence flags on hard-to-read rows).
export type { CornerPoint, CaptureQuality, FieldConfidence } from '@/lib/events/types'
import type { CornerPoint, CaptureQuality, FieldConfidence } from '@/lib/events/types'

/** Four normalized (0..1) card corners in order
 *  [top-left, top-right, bottom-right, bottom-left] for one card side. */
export type CardCorners = [CornerPoint, CornerPoint, CornerPoint, CornerPoint]

/** One phone number printed on the card (label e.g. "mobile", "office"). */
export interface ContactPhone {
  label: string
  number: string
  confidence?: FieldConfidence
}

/** One email address printed on the card. */
export interface ContactEmail {
  label: string
  address: string
  confidence?: FieldConfidence
}

/** A link printed on the card. */
export interface ContactLink {
  label: string
  url: string
  kind: 'website' | 'booking' | 'portfolio' | 'other'
  confidence?: FieldConfidence
}

/** A catch-all label/value pair for anything that does not fit the other slots. */
export interface ContactOtherDetail {
  label: string
  value: string
  confidence?: FieldConfidence
}

/** Where and when two members met, stamped onto a QR-scan capture (CRM-STRATEGY
 *  §4). Lives in the `details` jsonb so it needs no migration. */
export interface MetContext {
  /** How the capture happened. Today always `'qr'` (an in-person QR scan). */
  via: 'qr'
  /** Where they met: the event/Space name, else the city, else null. */
  at: string | null
  /** The day they met, ISO date (yyyy-mm-dd). */
  on: string | null
}

/** The rich, flexible harvest of everything printed on the card. Every field is
 *  optional and omitted when empty. Persisted as the network_contacts.details
 *  JSONB column. Mirrors the events EventDetails contract. */
export interface ContactDetails {
  phones?: ContactPhone[]
  emails?: ContactEmail[]
  addresses?: string[]
  services?: string[]
  certifications?: string[]
  hours?: string
  links?: ContactLink[]
  other?: ContactOtherDetail[]
  /** A top-level read on how confidently the card could be parsed at all. */
  confidence?: FieldConfidence
  /** Set on a QR-scan capture: where/when the scanner met this person. */
  metContext?: MetContext
}

export interface ContactSocials {
  instagram?: string
  linkedin?: string
  x?: string
  other?: string
}

/** What the AI harvest (vision scan or Vera text assist) yields — already
 *  coerced to a safe, fully-populated shape by coerceExtraction(). */
export interface ExtractedContact {
  displayName: string
  email: string
  phone: string
  title: string
  company: string
  city: string
  website: string
  socials: ContactSocials
  tags: string[]
  connectionNote: string
  photo: { found: boolean; box: FaceBox | null; imageIndex: number }
  /** The company logo region, for the avatar fallback and the org image. */
  logo: { found: boolean; box: FaceBox | null; imageIndex: number }
  /** Per-image card corners, aligned to the input images (entry i belongs to
   *  image i). null where the model cannot see all four corners of that side.
   *  Lets the client deskew EACH card side before keeping it. */
  corners: (CardCorners | null)[]
  /** The model's honest read on capture quality (legibility / glare / skew). */
  quality: CaptureQuality
  /** The rich, flexible harvest of everything printed on the card. */
  details: ContactDetails
}

/** A stored network contact (the CRM record). */
export interface NetworkContact {
  id: string
  ownerId: string
  visibility: Visibility
  source: ContactSource
  status: ContactStatus
  displayName: string | null
  email: string | null
  phone: string | null
  title: string | null
  company: string | null
  city: string | null
  website: string | null
  socials: ContactSocials
  avatarPath: string | null
  /** The rich, flexible details harvested from the card ({} when none). */
  details: ContactDetails
  /** Deskewed card images on file, keys in the private network-contacts bucket. */
  cardFrontPath: string | null
  cardBackPath: string | null
  /** Cropped company logo, key in the private network-contacts bucket. */
  logoPath: string | null
  /** The member profile this contact has been merged with (null = not linked). */
  linkedProfileId: string | null
  /** The shared-CRM `contacts` row this personal card has been bridged into (the graduation /
   *  scan-to-invite link, null = not bridged). Set when the contact graduates into a Space CRM. */
  linkedContactId: string | null
  /** When the owner last reached out (notes / completed follow-ups / a QR scan). */
  lastContactedAt: string | null
  createdAt: string | null
  updatedAt: string | null
}

/** A list row — the contact plus its tags and a short-lived signed photo URL. */
export interface NetworkContactListItem extends NetworkContact {
  tags: string[]
  avatarUrl: string | null
}

export interface ContactNote {
  id: string
  body: string
  kind: NoteKind
  authorId: string | null
  createdAt: string | null
}

/** A follow-up reminder on a network contact (the free keep-in-touch layer). */
export interface ContactReminder {
  id: string
  contactId: string
  dueAt: string
  note: string | null
  doneAt: string | null
  createdAt: string | null
}

/** A reminder joined with its contact's identity, for the "reach out" list. */
export interface ReminderWithContact extends ContactReminder {
  contactName: string | null
  contactAvatarUrl: string | null
}

export interface ContactTag {
  id: string
  tag: string
  source: TagSource
  createdAt: string | null
}
