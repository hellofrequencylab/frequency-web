// ─────────────────────────────────────────────────────────────────────────────
// CUSTOM-FIELD DISPLAY (CRM Master Build Plan Phase 2) — PURE helpers the contact card
// uses to render a `meta.custom` value the way its registry type says to: a date reads as
// a date, a phone dials, a url / email is a link, a boolean reads Yes/No. An UNKNOWN key
// (no registry entry) still renders, with a label humanized from the key, so imported data
// is never hidden. No I/O, no framework: the component maps the returned shape to JSX.
// ─────────────────────────────────────────────────────────────────────────────

import type { ValueType } from './types'

/** Turn a stable custom-field key into a display label: `lead_source` -> `Lead source`. Used as the
 *  fallback label when the registry has no entry for a key (data still shows, never hidden). */
export function humanizeFieldKey(key: string): string {
  const spaced = key.replace(/_/g, ' ').trim()
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : key
}

/** How a custom value should render. `kind` tells the component whether to draw a link (with `href`)
 *  or plain text; `display` is the human-facing string either way. */
export interface CustomFieldDisplay {
  kind: 'text' | 'link' | 'mailto' | 'tel'
  display: string
  href?: string
}

const DATE_FMT = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: 'numeric' })

/** Format a stored date value for display. Accepts an ISO date (2026-07-16) or a partial vCard-style
 *  birthday (--07-16, no year). Returns the original string when it is not a date we can parse. */
function formatDate(value: string): string {
  const v = value.trim()
  // A month-day-only birthday like "--07-16" (RFC 6350) -> "Jul 16".
  const md = /^--(\d{2})-(\d{2})$/.exec(v)
  if (md) {
    const d = new Date(Date.UTC(2000, Number(md[1]) - 1, Number(md[2])))
    return Number.isNaN(d.getTime()) ? v : new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(d)
  }
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(v)
  if (iso) {
    const d = new Date(`${iso[1]}-${iso[2]}-${iso[3]}T00:00:00Z`)
    return Number.isNaN(d.getTime()) ? v : DATE_FMT.format(d)
  }
  return v
}

/** A url the browser can follow: keep an absolute one, prefix a bare host with https://. */
function toHref(value: string): string {
  const v = value.trim()
  return /^https?:\/\//i.test(v) ? v : `https://${v.replace(/^\/+/, '')}`
}

/** Read a stored boolean value (TRUE/FALSE/yes/no/1/0) as a Yes/No display, or the raw value. */
function formatBoolean(value: string): string {
  const v = value.trim().toLowerCase()
  if (['true', 'yes', 'y', '1'].includes(v)) return 'Yes'
  if (['false', 'no', 'n', '0'].includes(v)) return 'No'
  return value.trim()
}

/**
 * Render a custom-field value per its (registry-derived) type. Falls back to plain text for an
 * unknown type or an unparseable value, so the value ALWAYS shows.
 */
export function formatCustomFieldValue(value: string, valueType: ValueType | undefined): CustomFieldDisplay {
  const v = (value ?? '').trim()
  if (!v) return { kind: 'text', display: '' }
  switch (valueType) {
    case 'email':
      return { kind: 'mailto', display: v, href: `mailto:${v}` }
    case 'phone':
      return { kind: 'tel', display: v, href: `tel:${v.replace(/[^\d+]/g, '')}` }
    case 'url':
      return { kind: 'link', display: v, href: toHref(v) }
    case 'date':
      return { kind: 'text', display: formatDate(v) }
    case 'boolean':
      return { kind: 'text', display: formatBoolean(v) }
    default:
      return { kind: 'text', display: v }
  }
}
