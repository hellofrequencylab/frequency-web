import Link from 'next/link'
import type { ReactNode } from 'react'
import { Avatar } from '@/components/ui/avatar'
import { HOME_SLUG, type ProfilePage } from '@/lib/spaces/profile-pages'

// THE EXTERNAL WEBSITE CHROME (PROG-E10 phase 1). A published Space website (/sites/<slug>) is the
// Space's own pages, rendered without any Frequency app chrome: a slim header with the brand and the
// Space's page nav, the page body, and a small footer. Server Component, no client JS, DAWN semantic
// tokens only, so the Space's accent and page theme (AccentScope, set by the route) paint it.
//
// The nav links are BASE-relative: `base` is `/sites/<slug>` today, and becomes `` (the domain root)
// once a custom domain routes here, so the same chrome serves both without knowing which it is on.

export function siteHref(base: string, pageSlug: string): string {
  if (pageSlug === HOME_SLUG) return base || '/'
  return `${base}/${pageSlug}`
}

export function SiteChrome({
  brandName,
  logoUrl,
  pages,
  activePageSlug,
  base,
  profileHref,
  children,
}: {
  brandName: string
  logoUrl: string | null
  pages: ProfilePage[]
  activePageSlug: string
  /** The path prefix every site link hangs off (`/sites/<slug>`, or `` on the Space's own domain). */
  base: string
  /** The Space's page on Frequency, for the footer link. */
  profileHref: string
  children: ReactNode
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas text-text">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link href={siteHref(base, HOME_SLUG)} className="flex items-center gap-3">
            {logoUrl && <Avatar src={logoUrl} name={brandName} size="sm" />}
            <span className="font-display text-lead font-bold tracking-tight">{brandName}</span>
          </Link>
          {pages.length > 1 && (
            <nav aria-label={`${brandName} pages`}>
              <ul className="flex flex-wrap items-center gap-1">
                {pages.map((page) => {
                  const active = page.slug === activePageSlug
                  return (
                    <li key={page.slug}>
                      <Link
                        href={siteHref(base, page.slug)}
                        aria-current={active ? 'page' : undefined}
                        className={
                          active
                            ? 'rounded-control bg-primary-bg px-3 py-2 text-body-sm font-semibold text-primary-strong'
                            : 'rounded-control px-3 py-2 text-body-sm font-medium text-muted transition-colors hover:text-text'
                        }
                      >
                        {page.label}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </nav>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">{children}</main>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-6 text-body-sm text-muted sm:px-6">
          <span>
            © {new Date().getFullYear()} {brandName}
          </span>
          <Link href={profileHref} className="transition-colors hover:text-text">
            Made with Frequency
          </Link>
        </div>
      </footer>
    </div>
  )
}
