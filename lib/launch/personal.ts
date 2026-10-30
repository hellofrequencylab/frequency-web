// THE PERSONAL SPOTLIGHT STEP (LIVE-1918), the pure half. Everyone has a personal Spotlight; it is their profile. The
// three answers the launch asks (a name, one line, one link) are saved onto the profile: the name is the display name,
// the line is the bio, the link is the website. Nothing else on the profile moves: the one profile writer asks for every
// field on every call and blanks the ones it is not given, so this builds the whole call from what is stored and changes
// only those three. PURE.

import type { SpotlightAnswers } from './spotlight-step.ts'

/** The stored profile fields the profile writer needs on every call. */
export interface StoredProfile {
  displayName: string | null
  handle: string | null
  bio: string | null
  website: string | null
  phone: string | null
  city: string | null
}

export interface ProfileWrite {
  displayName: string
  handle: string
  bio: string
  /** '' leaves the stored avatar untouched. */
  avatarUrl: string
  phone: string
  city: string
  website: string
}

/** The whole profile write: the stored values, with the name, bio and website taken from the answers. Null when the
 *  profile has no handle yet (the writer needs one, and the launch does not invent it). */
export function personalProfileWrite(stored: StoredProfile | null, answers: SpotlightAnswers): ProfileWrite | null {
  const handle = (stored?.handle ?? '').trim()
  if (!stored || !handle) return null
  return {
    displayName: answers.name,
    handle,
    bio: answers.line,
    avatarUrl: '',
    phone: stored.phone ?? '',
    city: stored.city ?? '',
    website: answers.link,
  }
}

/** The public address of someone's personal Spotlight. */
export function personalSpotlightHref(handle: string | null | undefined): string | null {
  const h = (handle ?? '').trim()
  return h ? `/spotlight/${encodeURIComponent(h)}` : null
}
