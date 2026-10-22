// The shape of one page a CyberUnicorn tag can open (lib/devices/tag-targets.ts finds them). Its own
// import-free module so the console (a client component) can read the labels without pulling in the
// server-only search.

type TagTargetKind = 'space' | 'event' | 'journey' | 'practice' | 'circle' | 'partner' | 'offer' | 'page'

export interface TagTarget {
  kind: TagTargetKind
  /** What the console lists, and the code's title. */
  label: string
  /** A second line: when, where, or what the page is for. */
  detail: string | null
  /** The root-relative public page the tag opens (or, before it is checked, a pasted link). */
  path: string
}

/** The plain-word name of each kind, for the console's result list. */
export const TAG_KIND_LABEL: Record<TagTargetKind, string> = {
  space: 'Space',
  event: 'Event',
  journey: 'Journey',
  practice: 'Practice',
  circle: 'Circle',
  partner: 'Partner',
  offer: 'Offer',
  page: 'Page',
}
