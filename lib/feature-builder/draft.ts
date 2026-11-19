// THE FEATURE BUILDER DRAFTS (LIVE-2481): the closed shape of what each builder collects. One list of fields per
// feature, read by the builder (what to ask), the hold cookie (what to keep) and the finish step (what to save), so
// the three cannot disagree. Every field is a short string; anything unknown is dropped and anything long is cut.
// PURE and client-safe.

import type { FeatureId } from './catalog'

interface DraftField {
  key: string
  max: number
  required?: boolean
  /** A url field keeps only an http(s) address (a bare domain gets https:// in front). */
  url?: boolean
}

export const DRAFT_FIELDS: Readonly<Record<FeatureId, readonly DraftField[]>> = {
  spotlight: [
    { key: 'name', max: 80, required: true },
    { key: 'line', max: 300, required: true },
    { key: 'link', max: 300, url: true },
  ],
  space: [
    { key: 'name', max: 80, required: true },
    { key: 'handle', max: 40 },
    { key: 'tagline', max: 160, required: true },
    { key: 'type', max: 20 },
  ],
  website: [
    { key: 'name', max: 80, required: true },
    { key: 'headline', max: 120, required: true },
    { key: 'about', max: 600 },
    { key: 'kit', max: 40 },
  ],
  email: [
    { key: 'from', max: 80, required: true },
    { key: 'subject', max: 140, required: true },
    { key: 'body', max: 4000, required: true },
  ],
}

export type FeatureDraft = Record<string, string>

const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g

/** A link as typed: a bare domain gets https://, anything that is not then an http(s) address is dropped. */
export function cleanLink(raw: string): string {
  const v = raw.trim()
  if (!v) return ''
  const withScheme = /^https?:\/\//i.test(v) ? v : `https://${v}`
  try {
    const u = new URL(withScheme)
    return (u.protocol === 'https:' || u.protocol === 'http:') && u.hostname.includes('.') ? u.toString() : ''
  } catch {
    return ''
  }
}

/** The draft cut to its feature's fields. Total: a non-object answers an empty draft. */
export function cleanDraft(feature: FeatureId, raw: unknown): FeatureDraft {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  const out: FeatureDraft = {}
  for (const f of DRAFT_FIELDS[feature]) {
    const v = typeof src[f.key] === 'string' ? (src[f.key] as string).replace(CONTROL, '').trim().slice(0, f.max) : ''
    out[f.key] = f.url ? cleanLink(v) : v
  }
  return out
}

/** The first required field still empty, or null when the draft can be saved. */
export function missingField(feature: FeatureId, draft: FeatureDraft): string | null {
  for (const f of DRAFT_FIELDS[feature]) if (f.required && !draft[f.key]?.trim()) return f.key
  return null
}

/** The draft from JSON text (a form field), or null when it does not parse or is not complete. */
export function parseDraft(feature: FeatureId, text: unknown): FeatureDraft | null {
  if (typeof text !== 'string' || text.length > 12_000) return null
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return null
  }
  const draft = cleanDraft(feature, raw)
  return missingField(feature, draft) ? null : draft
}
