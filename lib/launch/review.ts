// THE REVIEW + PUBLISH SCREEN (the pure half). The built-out draft is shown with the person's own words beside every
// field, they edit it in place, and one Publish writes it. This file reads the edited form back into a draft and
// finds the cites for a field. It never writes words for anyone: an empty field stays empty. PURE, so a probe can
// run it under node.

import type { BuildoutDraft } from './buildout.ts'
import type { InventorySection } from './overview.ts'
import { parseSpotlightAnswers } from './spotlight-step.ts'

export const REVIEW_HREF = '/launch/step/review'
/** Where Publish lands: the overview, with the calm done note. */
export const PUBLISHED_HREF = '/launch?published=1'

export const REVIEW_ERRORS = {
  name: 'Add the name people know you by.',
  line: 'Add one line about what you do, in your own words.',
  retry: 'We could not publish that. Your words are kept here. Try again.',
} as const
export type ReviewErrorCode = keyof typeof REVIEW_ERRORS

const MAX_TAGLINE = 140
const MAX_ABOUT = 4000
const MAX_HEADLINE = 120
const MAX_INTRO = 1000
const MAX_SUBJECT = 120
const MAX_BODY = 4000

/** Keeps line breaks (paragraphs), trims each line, collapses runs of blank lines. */
function block(v: unknown, max: number): string {
  if (typeof v !== 'string') return ''
  return v
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, max)
}
const oneLine = (v: unknown, max: number): string => block(v, max).replace(/\s*\n\s*/g, ' ')

/** The edited form, read back as a draft with no cites. The Spotlight needs a name and one line, like its own step;
 *  everything else may be empty. */
export function parseReviewDraft(raw: Record<string, unknown>): Omit<BuildoutDraft, 'cites'> | { error: 'name' | 'line' } {
  const spotlight = parseSpotlightAnswers({
    name: raw.sp_name,
    line: raw.sp_line,
    link: raw.sp_link,
  })
  if ('error' in spotlight) return { error: spotlight.error === REVIEW_ERRORS.name ? 'name' : 'line' }
  return {
    spotlight,
    space: {
      tagline: oneLine(raw.tagline, MAX_TAGLINE),
      about: block(raw.about, MAX_ABOUT),
    },
    website: {
      headline: oneLine(raw.web_headline, MAX_HEADLINE),
      intro: block(raw.web_intro, MAX_INTRO),
    },
    email: {
      subject: oneLine(raw.email_subject, MAX_SUBJECT),
      body: block(raw.email_body, MAX_BODY),
    },
  }
}

/** The person's own words behind one field. */
export function citesFor(draft: Pick<BuildoutDraft, 'cites'>, slot: BuildoutDraft['cites'][number]['slot'], field: string) {
  return draft.cites.filter((c) => c.slot === slot && c.field === field && c.snippet.trim().length > 0)
}

/** What the inventory says is live now, for the done note. Read from the records, so it only claims what exists. */
export function wentLive(sections: readonly InventorySection[]): string[] {
  const done = (id: string) => sections.flatMap((s) => s.items).some((i) => i.id === id && i.state === 'done')
  const out: string[] = []
  if (done('sp-live')) out.push('Your Spotlight')
  if (done('sc-tag') && done('sc-about')) out.push('your Space')
  return out
}
