import type { SpaceProfileTab } from './profile-tab'

// The Frequency Space portal has four destinations. Website menus remain independent.
// `-` cannot be a custom page slug (profile-pages.ts), so Program never shadows a saved page.
export function spaceProgramHref(slug: string): string {
  return `/spaces/${slug}/-/program`
}

export function primarySpaceTabs(slug: string, platformRoot = false): SpaceProfileTab[] {
  const base = `/spaces/${slug}`
  return [
    { key: 'home', href: base, label: 'Home' },
    ...(!platformRoot ? [{ key: 'feature:community', href: `${base}/community`, label: 'Community' }] : []),
    { key: 'feature:calendar', href: `${base}/calendar`, label: 'Calendar' },
    { key: 'feature:program', href: spaceProgramHref(slug), label: 'Program' },
  ]
}

/** The parent destination of a contextual page. Does not treat owner routes as public navigation. */
export function spacePrimarySection(pathname: string, base: string): string | null {
  if (pathname === base || pathname === `${base}/full`) return 'home'
  if (!pathname.startsWith(`${base}/`)) return null
  const path = pathname.slice(base.length)
  if (/^\/(?:manage|settings|crm|edit-page|setup)(?:\/|$)/.test(path)) return null
  if (/^\/(?:community|circles|people|collaborators)(?:\/|$)/.test(path)) return 'feature:community'
  if (/^\/calendar(?:\/|$)/.test(path)) return 'feature:calendar'
  if (/^\/(?:-\/program|journeys|practices)(?:\/|$)/.test(path)) return 'feature:program'
  return 'home'
}

/** Retain existing contextual doors without Home section shortcuts or additional primary tabs. */
export function spaceContextLinks(catalog: SpaceProfileTab[]): SpaceProfileTab[] {
  const primary = new Set(['home', 'feature:community', 'feature:calendar', 'feature:program'])
  const base = catalog.find((entry) => entry.key === 'home')?.href
  const primaryHrefs = new Set(base ? [base, `${base}/community`, `${base}/calendar`, `${base}/-/program`] : [])
  const seen = new Set<string>()
  // The shared website/editor catalog retains its legacy booking target. Only the Frequency
  // contextual surface turns that Home shortcut into the action-capable booking page.
  return catalog.map((entry) => base && (entry.href === `${base}#booking` || entry.href === '#booking')
    ? { ...entry, href: `${base}/book` }
    : entry).filter((entry) => {
    const homeSection = entry.href.startsWith('#') || (!!base && entry.href.startsWith(`${base}#`))
    if (!entry.key || primary.has(entry.key) || primaryHrefs.has(entry.href) || homeSection || seen.has(entry.href)) return false
    seen.add(entry.href)
    return true
  })
}
