// The Link Generator's pure compose core (BUILD-LIST P5 "unified link generator").
// Builds a trackable destination URL by appending UTM parameters to an operator's
// raw target, then hands the cleaned target to the existing qr_codes short-link
// infrastructure (lib/qr/codes.ts validators, lib/qr/links.ts shortLinkUrl). No DB,
// no `qrcode` import: this stays trivially unit-testable and isomorphic, mirroring
// lib/qr/codes.ts. The write path + authorization live in the server action
// (app/(main)/admin/growth/links/actions.ts); this file only shapes strings.
//
// VOICE: any operator-facing strings here obey CONTENT-VOICE (plain, no narrated
// feelings, no em/en dashes). The five UTM fields are the standard analytics quintet
// the existing source_tag column on qr_codes already understands as first-touch.

import { isValidTargetUrl } from '@/lib/qr/codes'

/** The standard UTM quintet an operator can stamp on a trackable link. Every field
 *  is optional; an empty field is omitted from the built URL (never an empty `&utm_x=`). */
export interface UtmParams {
  source: string
  medium: string
  campaign: string
  term: string
  content: string
}

export const EMPTY_UTM: UtmParams = {
  source: '',
  medium: '',
  campaign: '',
  content: '',
  term: '',
}

// The qr_codes.source_tag column stores a short first-touch label; cap the stamped
// value so a hostile/long input can never store an unbounded string (mirrors the
// 60-char cap link-actions.ts already applies to source_tag).
const MAX_TAG_LEN = 60

// UTM values are free text an operator types; normalize to the conventional lowercase,
// hyphenated, ASCII-ish token so the same campaign reads identically across links and
// the stored source_tag stays a clean key. Pure.
export function normalizeUtmValue(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9._-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, MAX_TAG_LEN)
}

/** The first-touch source_tag this link stamps into qr_scans (UTM passthrough, like
 *  link-actions.ts). Prefers an explicit campaign, then source; '' when neither is set
 *  (the action stores null). Pure. */
export function deriveSourceTag(utm: UtmParams): string {
  return normalizeUtmValue(utm.campaign) || normalizeUtmValue(utm.source)
}

const PARAM_ORDER: Array<[keyof UtmParams, string]> = [
  ['source', 'utm_source'],
  ['medium', 'utm_medium'],
  ['campaign', 'utm_campaign'],
  ['term', 'utm_term'],
  ['content', 'utm_content'],
]

/**
 * Append the (normalized, non-empty) UTM params to `target`, preserving any query the
 * operator already typed and never clobbering an existing utm_* the target carries.
 * Works for both absolute http(s) URLs and site-relative paths (the two shapes
 * isValidTargetUrl accepts). Returns the input unchanged when no UTM is set. Pure.
 */
export function buildTrackedUrl(target: string, utm: UtmParams): string {
  const t = target.trim()
  // Site-relative path: parse against a dummy origin, then strip it back off so the
  // result stays root-relative (the resolver and isValidTargetUrl both accept '/...').
  const relative = t.startsWith('/')
  const base = relative ? `https://x.invalid${t}` : t
  let url: URL
  try {
    url = new URL(base)
  } catch {
    // Not parseable: hand the raw target back untouched (the action validates separately).
    return t
  }
  for (const [key, param] of PARAM_ORDER) {
    const value = normalizeUtmValue(utm[key])
    // Never overwrite a utm_* the operator already put in the target by hand.
    if (value && !url.searchParams.has(param)) url.searchParams.set(param, value)
  }
  if (!relative) return url.toString()
  return `${url.pathname}${url.search}${url.hash}`
}

export interface ComposeInput {
  title: string
  /** The raw destination the operator typed: an http(s) URL or a site-relative path. */
  target: string
  utm: UtmParams
}

export interface ComposedLink {
  title: string
  /** The destination with UTM applied, ready to store as qr_codes.target_url. */
  trackedUrl: string
  /** The first-touch label to store as qr_codes.source_tag, or null when none. */
  sourceTag: string | null
}

/**
 * Validate + compose an operator's input into the row fields the action persists.
 * Returns a ComposedLink on success or a plain, voice-compliant error STRING on
 * failure (the action turns the string into a fail()). Pure: same input, same output,
 * no IO, so the action's happy path is unit-testable without a DB.
 */
export function composeLink(input: ComposeInput): ComposedLink | string {
  const title = input.title.trim()
  if (!title) return 'Give the link a title.'

  const rawTarget = input.target.trim()
  if (!rawTarget) return 'Enter the destination URL.'
  if (!isValidTargetUrl(rawTarget)) return 'Use a full web address or a link that starts with /.'

  const trackedUrl = buildTrackedUrl(rawTarget, input.utm)
  // The tracked URL must still validate (a normalized UTM can only add safe query
  // params, but re-check so a malformed compose can never reach the write path).
  if (!isValidTargetUrl(trackedUrl)) return 'That destination did not build into a valid link.'

  const tag = deriveSourceTag(input.utm)
  return {
    title: title.slice(0, 120),
    trackedUrl,
    sourceTag: tag || null,
  }
}
