// Shared types for the Profile Creator / Network Profiles feature
// (docs/NETWORK-CRM.md, ADR-098). Framework-free so client components, server
// actions, the store, and the AI module can all share one vocabulary.

export type Visibility = 'private' | 'shared' | 'network'
export type ContactSource = 'manual' | 'card_scan' | 'poster' | 'import'
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
  photo: { found: boolean; box: FaceBox | null }
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

export interface ContactTag {
  id: string
  tag: string
  source: TagSource
  createdAt: string | null
}
