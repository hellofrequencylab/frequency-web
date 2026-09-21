// The authored refund promise on a Journey (LIVE-395).
//
// ADR-1398's "Not done" list named two missing pieces of proof on a $444 page: testimonials and a
// guarantee. This is the guarantee, and it is the cheaper and the more load-bearing of the two.
// `revokeJourneyByOrder` (lib/commerce/journey-fulfilment.ts) ALREADY performs the mechanics on a
// full refund, so the policy has had an implementation and no way to state itself. A buyer cannot
// read an implementation.
//
// PER JOURNEY, NOT PER PLATFORM. Hosts sell different things at different prices, and a window that
// suits a four-week cohort does not suit a year-long container. The host writes their own sentence;
// the platform renders it where it is read. Nothing here asserts a default window — an unwritten
// guarantee renders NOTHING rather than a hollow promise the host never made, which is the same
// degrade-to-nothing rule the rest of the sales body follows.
//
// STORED ON page_config, NOT A COLUMN — exactly like the outcomes list beside it (LIVE-393,
// ADR-1463). It rides the story widget's `settings.guarantee` so Advanced layout saves keep it
// (editorPageConfig preserves settings) and every visitor face reads the same string without a
// schema change. It is not a fourth page_config toggle (ADR-1462): a guarantee is content, and its
// presence is whether the host wrote one.
//
// PURE + dependency-light (only the PageWidgetConfig shape). Safe from Server Components, the rail,
// and vitest.

import type { PageWidgetConfig } from '@/lib/journey-plans'

export const JOURNEY_GUARANTEE_MAX_LEN = 400

function isPlain(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Trim, collapse runaway whitespace and cap length. Empty in, empty out. */
export function normalizeJourneyGuarantee(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  return raw.replace(/\s+/g, ' ').trim().slice(0, JOURNEY_GUARANTEE_MAX_LEN).trim()
}

/** Read the authored promise off a stored page_config. Empty when the host has not written one. */
export function readJourneyGuarantee(stored: PageWidgetConfig[] | null | undefined): string {
  for (const entry of stored ?? []) {
    if (!entry || entry.id !== 'story' || !isPlain(entry.settings)) continue
    return normalizeJourneyGuarantee(entry.settings.guarantee)
  }
  return ''
}

/** Write the promise onto the story entry, preserving every other widget and the reserved wizard
 *  row. Returns a NEW array. An empty string DELETES the key rather than storing '', so a cleared
 *  guarantee and a never-written one are the same state and neither renders. */
export function writeJourneyGuarantee(
  stored: PageWidgetConfig[] | null | undefined,
  guarantee: string,
): PageWidgetConfig[] {
  const text = normalizeJourneyGuarantee(guarantee)
  const list = [...(stored ?? [])]
  const i = list.findIndex((e) => e && e.id === 'story')

  if (i < 0) {
    if (!text) return list
    return [...list, { id: 'story', enabled: true, settings: { guarantee: text } }]
  }

  const prev = list[i]
  const settings: Record<string, unknown> = { ...(isPlain(prev.settings) ? prev.settings : {}) }
  if (text) settings.guarantee = text
  else delete settings.guarantee

  // Mirror writeJourneyOutcomes exactly: an emptied settings bag is REMOVED, not left as `{}`.
  // The two share this object, so a Journey with only a guarantee that clears it must land on the
  // same shape as one that only ever had outcomes and cleared those.
  if (Object.keys(settings).length === 0) {
    const { settings: _dropped, ...rest } = prev
    list[i] = rest
  } else {
    list[i] = { ...prev, settings }
  }
  return list
}
