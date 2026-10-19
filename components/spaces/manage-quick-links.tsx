import Link from 'next/link'
import { ArrowUpRight, Globe, Hammer, LayoutDashboard, PencilRuler, SlidersHorizontal } from 'lucide-react'
import { appOrigin, siteSubdomainHost } from '@/lib/sites/host'
import { siteAdminHandoffPath } from '@/lib/sites/site-admin-pass'

// THE MANAGE QUICK LINKS (SCAN-971, owner ask 2026-10-16: "When a user hits Manage on their space, I want
// it to open panel management, with links to everything including website and web editor"). One row of
// doors above the console tabs: the full console page, the page editor, the website and the menu. The
// full-console door shows only in the in-place panel (on /manage you are already there). The website door
// opens the live site in a new tab once it is published; before that it opens the Profile & Settings tab,
// where the Website card publishes it. The board renders this only after its manage gate passes.
// The Website builder door (SCAN-1015, owner ruling 2026-10-19 "Add builder") opens the site's own editor
// through the leadership handoff; Web editor keeps opening the Space page's sidebar, which is the page
// editor (SCAN-971's door).

export type ManageQuickLink = {
  key: 'console' | 'editor' | 'builder' | 'website' | 'menu'
  label: string
  href: string
  external?: boolean
}

export function manageQuickLinks({
  slug,
  published,
  inPanel,
}: {
  slug: string
  published: boolean
  inPanel: boolean
}): ManageQuickLink[] {
  const settingsHref = inPanel ? `/spaces/${slug}?panel=manage&area=settings` : `/spaces/${slug}/manage?section=settings`
  const subdomain = siteSubdomainHost(slug)
  const siteUrl = subdomain ? `https://${subdomain}` : `${appOrigin()}/sites/${slug}`
  const links: ManageQuickLink[] = []
  if (inPanel) links.push({ key: 'console', label: 'Full console', href: `/spaces/${slug}/manage` })
  links.push({ key: 'editor', label: 'Web editor', href: `/spaces/${slug}/edit-page` })
  links.push({ key: 'builder', label: 'Website builder', href: siteAdminHandoffPath(slug, 'editor') })
  links.push(
    published
      ? { key: 'website', label: 'Website', href: siteUrl, external: true }
      : { key: 'website', label: 'Publish website', href: settingsHref },
  )
  links.push({ key: 'menu', label: 'Menu and features', href: `/spaces/${slug}/manage/modules` })
  return links
}

const ICONS = {
  console: LayoutDashboard,
  editor: PencilRuler,
  builder: Hammer,
  website: Globe,
  menu: SlidersHorizontal,
} as const

export function ManageQuickLinks(props: { slug: string; published: boolean; inPanel: boolean }) {
  const links = manageQuickLinks(props)
  return (
    <nav aria-label="Manage shortcuts" className="mb-4 flex flex-wrap gap-2">
      {links.map((link) => {
        const Icon = ICONS[link.key]
        const className =
          'inline-flex items-center gap-1.5 rounded-control border border-border bg-surface px-3 py-1.5 text-body-sm font-semibold text-text outline-none transition-colors hover:border-border-strong hover:bg-surface-elevated focus-visible:ring-2 focus-visible:ring-primary/50 motion-reduce:transition-none'
        const body = (
          <>
            <Icon className="h-4 w-4 text-primary-strong" aria-hidden />
            {link.label}
            {link.external && <ArrowUpRight className="h-3.5 w-3.5 text-subtle" aria-hidden />}
          </>
        )
        return link.external ? (
          <a key={link.key} href={link.href} target="_blank" rel="noopener noreferrer" className={className}>
            {body}
          </a>
        ) : (
          <Link key={link.key} href={link.href} className={className}>
            {body}
          </Link>
        )
      })}
    </nav>
  )
}
