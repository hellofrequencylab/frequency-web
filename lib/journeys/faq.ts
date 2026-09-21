// The authored questions on a Journey (LIVE-394).
//
// `JourneyFaq` (components/journey/discovery-widgets.tsx) shipped with three or four questions it
// derived from two columns, and nothing else. Every Journey on the platform answered the same
// objections in the same words, so the section that exists to close a buyer's specific doubt was
// the one section that could not know what that doubt was. ADR-1398's "Not done" list named it.
//
// PER JOURNEY, AUTHORED, WITH THE GENERIC SET AS THE FALLBACK. The host writes the questions they
// actually get asked; the page renders those. A Journey whose host has written none keeps the
// generic set, so no page loses its FAQ the day this lands. Nothing here decides which to show:
// `readJourneyFaq` returns what was written and the block does the fallback, so the rule lives in
// one place that a test can hold.
//
// STORED ON page_config, NOT A COLUMN, exactly like the outcomes list (LIVE-393, ADR-1463) and the
// guarantee (LIVE-395) beside it. It rides the story widget's `settings.faq` as an ordered list of
// `{ q, a }` records, so Advanced layout saves keep it (editorPageConfig preserves settings) and
// every visitor face reads the same list without a schema change. Not a page_config toggle
// (ADR-1462): questions are content, and their presence is whether the host wrote any.
//
// PURE + dependency-light (only the PageWidgetConfig shape). Safe from Server Components, the rail,
// and vitest.

import type { PageWidgetConfig } from '@/lib/journey-plans'

export const JOURNEY_FAQ_CAP = 8
export const JOURNEY_FAQ_QUESTION_MAX_LEN = 160
export const JOURNEY_FAQ_ANSWER_MAX_LEN = 600

export interface JourneyFaqItem {
  q: string
  a: string
}

function isPlain(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Trim, collapse runaway whitespace and cap length. Empty in, empty out. */
function clean(raw: unknown, max: number): string {
  if (typeof raw !== 'string') return ''
  return raw.replace(/\s+/g, ' ').trim().slice(0, max).trim()
}

/** Keep only rows with BOTH a question and an answer, trimmed and capped, up to the cap. A question
 *  with no answer is a draft, not a promise the page should make; an answer with no question is
 *  noise. Order is preserved. */
export function normalizeJourneyFaq(raw: unknown): JourneyFaqItem[] {
  const list = Array.isArray(raw) ? raw : []
  const out: JourneyFaqItem[] = []
  for (const item of list) {
    if (!isPlain(item)) continue
    const q = clean(item.q, JOURNEY_FAQ_QUESTION_MAX_LEN)
    const a = clean(item.a, JOURNEY_FAQ_ANSWER_MAX_LEN)
    if (!q || !a) continue
    out.push({ q, a })
    if (out.length >= JOURNEY_FAQ_CAP) break
  }
  return out
}

/** Read the authored questions off a stored page_config. Empty when the host has written none. */
export function readJourneyFaq(stored: PageWidgetConfig[] | null | undefined): JourneyFaqItem[] {
  for (const entry of stored ?? []) {
    if (!entry || entry.id !== 'story' || !isPlain(entry.settings)) continue
    return normalizeJourneyFaq(entry.settings.faq)
  }
  return []
}

/** Write the questions onto the story entry, preserving every other widget and the reserved wizard
 *  row. Returns a NEW array. An empty list DELETES the key rather than storing `[]`, so a cleared
 *  list and a never-written one are the same state and both fall back to the generic set. */
export function writeJourneyFaq(
  stored: PageWidgetConfig[] | null | undefined,
  faq: readonly unknown[],
): PageWidgetConfig[] {
  const items = normalizeJourneyFaq(faq)
  const list = [...(stored ?? [])]
  const i = list.findIndex((e) => e && e.id === 'story')

  if (i < 0) {
    if (items.length === 0) return list
    return [...list, { id: 'story', enabled: true, settings: { faq: items } }]
  }

  const prev = list[i]
  const settings: Record<string, unknown> = { ...(isPlain(prev.settings) ? prev.settings : {}) }
  if (items.length > 0) settings.faq = items
  else delete settings.faq

  // Mirror writeJourneyOutcomes and writeJourneyGuarantee exactly: an emptied settings bag is
  // REMOVED, not left as `{}`. The three share this object, so a Journey that only ever had
  // questions and cleared them must land on the same shape as one that cleared its outcomes.
  if (Object.keys(settings).length === 0) {
    const { settings: _dropped, ...rest } = prev
    list[i] = rest
  } else {
    list[i] = { ...prev, settings }
  }
  return list
}
