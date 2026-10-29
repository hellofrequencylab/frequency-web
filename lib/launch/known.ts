// WHAT THE PERSON ALREADY HAS (the pure half). The launch form never opens empty when anything they own can fill it:
// the Spotlight's own words first, then the Space (its name, tagline, first line of its about, its domain), then their
// profile (display name, bio, website). Nothing is invented; every value is something they already wrote. PURE.

import type { SpotlightAnswers } from './spotlight-step'

interface KnownSpace {
  name: string
  tagline: string | null
  about: string | null
  domain: string | null
}

export interface KnownProfile {
  displayName: string | null
  bio: string | null
  website: string | null
}

const LINE_MAX = 300

/** An https address from what the person wrote, or '' when it does not parse as one. */
export function httpsAddress(raw: string | null | undefined): string {
  const text = (raw ?? '').trim()
  if (!text) return ''
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : ''
  } catch {
    return ''
  }
}

const first = (...values: Array<string | null | undefined>) => values.map((v) => (v ?? '').trim()).find(Boolean) ?? ''

export function prefillAnswers(saved: Partial<SpotlightAnswers> | null, space: KnownSpace | null, profile: KnownProfile | null): SpotlightAnswers {
  const aboutLine = (space?.about ?? '').split('\n')[0]
  return {
    name: first(saved?.name, space?.name, profile?.displayName),
    line: first(saved?.line, space?.tagline, aboutLine, profile?.bio).slice(0, LINE_MAX),
    link: first(saved?.link, httpsAddress(space?.domain), httpsAddress(profile?.website)),
  }
}
