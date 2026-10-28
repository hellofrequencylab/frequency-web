// STEP 1, THE SPOTLIGHT (VLS-07), the pure half. What the person types (a name, one line, one link) becomes the
// Space's handle and the Space Spotlight's first layout. No imports from the app beyond the Spotlight's own
// writer, so a probe can run it under node. The IO (making the Space, saving the Spotlight) is spotlight-io.ts.
//
// The Spotlight is the person's own words: the name as the heading, their line as the text, their link as the
// one link. Nothing is written for them, and no timing or outcome claim is added.

import { nextSpotlightPreferences } from '../spaces/spotlight.ts'
import { slugify } from '../utils.ts'

export interface SpotlightAnswers {
  name: string
  line: string
  /** Optional. An https address, kept only when it parses as one. */
  link: string
}

const MAX_NAME = 80
const MAX_LINE = 300

const clean = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '')

/** An https address with a host, or empty. A bare "example.com" gets https:// in front. Never throws. */
function cleanLink(v: unknown): string {
  const raw = clean(v, 300)
  if (!raw) return ''
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
    return u.protocol === 'https:' && u.hostname.includes('.') ? u.toString() : ''
  } catch {
    return ''
  }
}

/** The typed answers, cleaned, or the line to show. A name and one line are required; the link is not. */
export function parseSpotlightAnswers(raw: Record<string, unknown> | null | undefined): SpotlightAnswers | { error: string } {
  const name = clean(raw?.name, MAX_NAME)
  const line = clean(raw?.line, MAX_LINE)
  if (!name) return { error: 'Add the name people know you by.' }
  if (!line) return { error: 'Add one line about what you do, in your own words.' }
  return { name, line, link: cleanLink(raw?.link) }
}

/** A Space handle from a name: the one slug rule (lib/utils.ts), cut to 32 characters, at least 3. `attempt` 0 is the
 *  plain handle; later attempts add a short suffix, so a taken handle never blocks the step. */
export function handleFor(name: string, attempt = 0): string {
  const base = slugify(name).slice(0, 32).replace(/-+$/g, '') || 'my-space'
  const padded = base.length < 3 ? `${base}-space` : base
  return attempt === 0 ? padded : `${padded}-${attempt + 1}`
}

/** The Spotlight's layout: heading, text, and the link when there is one. Fed to nextSpotlightPreferences, which
 *  sanitizes it again and narrows it to Spotlight blocks. */
export function spotlightLayout(a: SpotlightAnswers): Record<string, unknown> {
  const ids = a.link ? ['heading', 'text', 'links'] : ['heading', 'text']
  const content: Record<string, unknown> = { heading: { text: a.name }, text: { text: a.line } }
  if (a.link) content.links = { items: [{ label: new URL(a.link).hostname.replace(/^www\./, ''), url: a.link }] }
  return { rows: ids.map((id, i) => ({ id: `r${i}`, columns: 1, cells: [[id]] })), content }
}

/** The Space's next preferences blob with the Spotlight written and PUBLISHED. Every other key is kept. */
export function publishedSpotlightPreferences(current: Record<string, unknown>, a: SpotlightAnswers): Record<string, unknown> {
  return nextSpotlightPreferences(current, { published: true, layout: spotlightLayout(a) })
}
