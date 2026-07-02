// ─────────────────────────────────────────────────────────────────────────────
// SPACE BREADCRUMB TRAIL — the ONE wayfinding model for a Space and its owner area
// (owner directive, 2026-07: "condense it down to breadcrumbs; make navigation work
// back and forth"). One brand-aware trail replaces the tangle of per-page back links
// + the low-fidelity global auto-breadcrumb (which only knew the raw slug).
//
// The IA the trail encodes (climb left, drill right):
//   Spaces  ›  {brandName}  ›  Manage  ›  {Section}
//
//   /spaces/{slug}                      → Spaces › {brandName}                 (the profile)
//   /spaces/{slug}/book                 → Spaces › {brandName} › Book
//   /spaces/{slug}/{customPage}         → Spaces › {brandName} › {Custom page}
//   /spaces/{slug}/manage               → Spaces › {brandName} › Manage
//   /spaces/{slug}/manage/mode          → Spaces › {brandName} › Manage › Mode
//   /spaces/{slug}/manage/layout        → Spaces › {brandName} › Manage › Page
//   /spaces/{slug}/settings/{section}   → Spaces › {brandName} › Manage › {Section}
//   /spaces/{slug}/crm                  → Spaces › {brandName} › Manage › CRM
//   /spaces/{slug}/edit-page            → (none: the full-width editor owns the viewport)
//
// The Manage crumb points at `manageHref` (the type-correct hub: /manage for console
// types, /settings for the rest) so the middle rung is never a redirect hop. The
// settings sub-pages NEST under Manage (the intermediate /settings index is skipped —
// it only redirects), so the trail matches how an operator actually thinks about the
// area. PURE + total: no server/Next imports; the client component feeds it usePathname.
// ─────────────────────────────────────────────────────────────────────────────

export type Crumb = { href: string; label: string }

/** Fixed labels for the owner sub-surfaces (under /manage or /settings). Anything not listed is
 *  titleized (a custom profile page, a new section). Plain nouns, no em dashes. */
const OWNER_SECTIONS: Record<string, string> = {
  mode: 'Mode',
  layout: 'Page',
  basics: 'Basics',
  offerings: 'Offerings',
  members: 'People',
  billing: 'Billing',
  email: 'Email',
  qr: 'Reach',
  features: 'Features',
  crm: 'CRM',
}

function titleize(seg: string): string {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(seg)) return 'Detail'
  return decodeURIComponent(seg)
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

/**
 * Build the breadcrumb trail for a Space route. `pathname` is the live path, `slug` + `brandName`
 * identify the Space, `manageHref` is the type-correct manage hub. Returns [] for the full-width
 * editor (no crumb) so the caller renders nothing. PURE + total.
 */
export function spaceCrumbs(
  pathname: string,
  slug: string,
  brandName: string,
  manageHref: string,
): Crumb[] {
  const base = `/spaces/${slug}`
  const spaces: Crumb = { href: '/spaces/directory', label: 'Spaces' }
  const profile: Crumb = { href: base, label: brandName }
  const manage: Crumb = { href: manageHref, label: 'Manage' }

  // Segments AFTER /spaces/{slug} (tolerant of a non-space path → treat as the bare profile).
  const rest = pathname.startsWith(base) ? pathname.slice(base.length).replace(/^\/+/, '') : ''
  const segs = rest.split('/').filter(Boolean)
  const [a, b] = segs

  if (segs.length === 0) return [spaces, profile] // the profile itself
  if (a === 'edit-page') return [] // the full-width Puck editor owns the viewport
  if (a === 'book') return [spaces, profile, { href: `${base}/book`, label: 'Book' }]

  if (a === 'manage') {
    if (!b) return [spaces, profile, manage]
    return [spaces, profile, manage, { href: pathname, label: OWNER_SECTIONS[b] ?? titleize(b) }]
  }
  if (a === 'settings') {
    // The /settings index only redirects to the manage hub, so it never gets its own crumb; a section
    // nests directly under Manage.
    if (!b) return [spaces, profile, manage]
    return [spaces, profile, manage, { href: pathname, label: OWNER_SECTIONS[b] ?? titleize(b) }]
  }
  if (a === 'crm') return [spaces, profile, manage, { href: `${base}/crm`, label: 'CRM' }]

  // A custom operator profile page (e.g. /spaces/{slug}/classes).
  return [spaces, profile, { href: `${base}/${a}`, label: titleize(a) }]
}
