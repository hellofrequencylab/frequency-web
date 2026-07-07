// THE OPERATOR-EDITABLE HEADER CTA (the one dominant action on a Space profile hero). By default the
// header's primary button reads the per-type label from profile-config (defaultPrimaryCtaLabel) and
// routes to the reserved /book transactional surface. This module lets the OWNER override that button:
// pick an IN-HOUSE FUNCTION that links to a surface that already exists, or a CUSTOM LINK (a URL + a
// label of their own). The choice persists in spaces.preferences.headerCta (the existing override blob,
// alongside coverScrim / moduleMenu), so no new column.
//
// PURE + data-only (no React / Supabase / Next imports), so the normalizer + the resolver are trivially
// unit-testable and safe to import from the public header (a Server Component), the admin form's data
// getter, and the write action alike. FRAMING only, never a gate.
//
// COPY NOTE (NAMING + CONTENT-VOICE §10): every label here is a plain verb phrase, sentence case, no em
// dashes, no hype. Each function maps to a surface that ACTUALLY EXISTS (verified against the routes):
// /spaces/<slug>/book (the type-branched transactional surface: booking / join / donate / tickets),
// and the profile Home section anchors #offerings and #contact (the SpaceOfferings / SpaceContact
// blocks render as `<section id="...">`, see lib/spaces/section-anchors.ts).

/** The in-house function keys the owner can point the header CTA at. Each resolves to a real surface
 *  relative to the Space's base path. A CUSTOM link uses `custom` + a stored url/label instead. */
export type HeaderCtaFunction =
  | 'book'
  | 'contact'
  | 'tickets'
  | 'donate'
  | 'join'
  | 'offerings'

/** The closed set of in-house function keys (for the normalizer + the admin picker). */
const FUNCTION_KEYS: readonly HeaderCtaFunction[] = [
  'book',
  'contact',
  'tickets',
  'donate',
  'join',
  'offerings',
] as const

/** One in-house function choice: its key, the default plain label, and how it resolves to a surface off
 *  the Space's base path. `anchor` targets a Home section (`#offerings` / `#contact`); otherwise it is a
 *  sub-path off the base. */
export interface HeaderCtaFunctionChoice {
  key: HeaderCtaFunction
  /** The default button label (sentence case, no em dashes). The owner may still type their own label. */
  label: string
  /** A one-line plain description of where it points (the admin picker hint). */
  hint: string
}

/** The in-house functions, in the order the admin picker lists them. Labels + hints pass CONTENT-VOICE. */
export const HEADER_CTA_FUNCTIONS: readonly HeaderCtaFunctionChoice[] = [
  { key: 'book', label: 'Book now', hint: 'Opens your booking page.' },
  { key: 'contact', label: 'Contact me', hint: 'Jumps to your contact section.' },
  { key: 'tickets', label: 'Get tickets', hint: 'Opens your tickets page.' },
  { key: 'donate', label: 'Donate', hint: 'Opens your donation page.' },
  { key: 'join', label: 'Join', hint: 'Opens your membership page.' },
  { key: 'offerings', label: 'View offerings', hint: 'Jumps to what you offer.' },
] as const

/** Is `value` a registered in-house function key? (Closed set.) */
export function isHeaderCtaFunction(value: unknown): value is HeaderCtaFunction {
  return typeof value === 'string' && (FUNCTION_KEYS as readonly string[]).includes(value)
}

/** The default label for an in-house function (falls back to "Book now" for an unknown key). */
export function headerCtaFunctionLabel(fn: HeaderCtaFunction): string {
  return HEADER_CTA_FUNCTIONS.find((f) => f.key === fn)?.label ?? 'Book now'
}

/** The owner's persisted header-CTA override (spaces.preferences.headerCta). Sparse by design: an absent
 *  blob means "use the per-type default" (the blueprint label + the /book surface). Two shapes:
 *   - a FUNCTION override: `{ kind: 'function', function, label? }` — an in-house surface, with an
 *     OPTIONAL label the owner typed (else the function's default label applies).
 *   - a CUSTOM override: `{ kind: 'custom', url, label }` — an operator URL + label. */
export type HeaderCtaPreference =
  | { kind: 'function'; function: HeaderCtaFunction; label?: string }
  | { kind: 'custom'; url: string; label: string }

/** The fully-resolved header CTA the render layer paints: a label + an href, plus whether it is an
 *  external (custom) link (so the render can add rel/target). PURE, total. */
export interface ResolvedHeaderCta {
  label: string
  href: string
  /** True for a custom (operator-supplied) URL: the render opens it in a new tab with safe rel. */
  external: boolean
}

/** A custom URL is allowed only if it is an absolute http(s) URL (an external site) or a same-origin
 *  path starting with `/`. Anything else (javascript:, mailto without scheme guard, a bare word) is
 *  rejected so a stored value can never be an unsafe href. PURE. */
export function isValidCtaUrl(raw: string): boolean {
  const url = raw.trim()
  if (!url) return false
  if (url.startsWith('/')) return !url.startsWith('//') // a same-origin path (not protocol-relative)
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

/** Normalize a raw `spaces.preferences` blob into a typed HeaderCtaPreference, or null when the owner has
 *  set nothing valid (so the caller falls back to the per-type default). Tolerant of any shape. Drops an
 *  unknown function key, a blank label, or an unsafe URL, so a stale / forged value never reaches the
 *  render. A custom override needs BOTH a valid url AND a non-empty label. PURE. */
export function readHeaderCtaPreference(raw: unknown): HeaderCtaPreference | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const node = (raw as Record<string, unknown>).headerCta
  if (!node || typeof node !== 'object' || Array.isArray(node)) return null
  const n = node as Record<string, unknown>

  if (n.kind === 'custom') {
    const url = typeof n.url === 'string' ? n.url.trim() : ''
    const label = typeof n.label === 'string' ? n.label.trim() : ''
    if (!url || !label || !isValidCtaUrl(url)) return null
    return { kind: 'custom', url, label }
  }

  if (n.kind === 'function') {
    if (!isHeaderCtaFunction(n.function)) return null
    const label = typeof n.label === 'string' && n.label.trim() ? n.label.trim() : undefined
    return { kind: 'function', function: n.function, ...(label ? { label } : {}) }
  }

  return null
}

/** The href an in-house function resolves to, off the Space's `base` path (e.g. `/spaces/river-yoga`).
 *  `#contact` / `#offerings` jump to the Home section anchors (SpaceContact / SpaceOfferings blocks);
 *  the rest open the reserved `/book` transactional surface, which itself branches by Space type. PURE. */
export function headerCtaFunctionHref(fn: HeaderCtaFunction, base: string): string {
  switch (fn) {
    case 'contact':
      return `${base}#contact`
    case 'offerings':
      return `${base}#offerings`
    case 'book':
    case 'tickets':
    case 'donate':
    case 'join':
      return `${base}/book`
  }
}

/** Compute the next preferences blob for a header-CTA change. Non-destructive: only the `headerCta` node
 *  is written, every other key preserved. Passing `null` CLEARS the override (back to the per-type
 *  default). PURE. Mirrors nextCoverScrimPreferences. */
export function nextHeaderCtaPreferences(
  current: Record<string, unknown>,
  pref: HeaderCtaPreference | null,
): Record<string, unknown> {
  if (pref === null) {
    const { headerCta: _drop, ...rest } = current
    void _drop
    return rest
  }
  return { ...current, headerCta: pref }
}

/** Resolve the EFFECTIVE header CTA for a Space: the owner's override if set + valid, else the per-type
 *  default (`defaultLabel` + the `/book` surface). `base` is the Space's profile base path. PURE, total,
 *  so the same result feeds the desktop row + the mobile band + any preview. */
export function resolveHeaderCta(
  pref: HeaderCtaPreference | null,
  base: string,
  defaultLabel: string,
): ResolvedHeaderCta {
  if (pref?.kind === 'custom') {
    return { label: pref.label, href: pref.url, external: !pref.url.startsWith('/') }
  }
  if (pref?.kind === 'function') {
    return {
      label: pref.label ?? headerCtaFunctionLabel(pref.function),
      href: headerCtaFunctionHref(pref.function, base),
      external: false,
    }
  }
  return { label: defaultLabel, href: `${base}/book`, external: false }
}
