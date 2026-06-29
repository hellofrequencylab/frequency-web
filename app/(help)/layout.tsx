import Link from 'next/link'
import { MarketingHeader } from '@/components/layout/marketing-header'
import { MarketingFooter } from '@/components/layout/marketing-footer'
import { HelpNav } from '@/components/help/help-nav'
import { HelpSearch } from '@/components/help/help-search'
import { getAllCategories, getSearchIndex, helpHref } from '@/lib/help/content'
import { getMenu, getMenuSettings } from '@/lib/menus/read'

// Help-center chrome: shared marketing header/footer + a sticky sidebar (search +
// topic nav). Public (not in proxy.ts PROTECTED_PATHS), statically generated.
export default async function HelpLayout({ children }: { children: React.ReactNode }) {
  // DB-backed nav megas (lib/menus); fall back to code defaults on any miss.
  const [categories, index, headerMenu, footerMenu, menuTimings] = await Promise.all([
    getAllCategories(),
    getSearchIndex(),
    getMenu('header'),
    getMenu('footer'),
    getMenuSettings(),
  ])
  const nav = categories.map((c) => ({
    slug: c.slug,
    title: c.title,
    articles: c.articles.map((a) => ({
      slug: a.slug,
      title: a.title,
      href: helpHref(c.slug, a.slug),
    })),
  }))

  return (
    <>
      <MarketingHeader headerMenu={headerMenu} menuTimings={menuTimings} />
      {/* Spacer clears the now-taller fixed header (4rem + safe-area-inset-top); min-h-dvh
          tracks the iOS dynamic toolbar so landscape height doesn't glitch. */}
      <main className="min-h-dvh bg-surface" style={{ paddingTop: 'calc(4rem + env(safe-area-inset-top))' }}>
        <div className="mx-auto flex max-w-6xl gap-10 px-4 py-10 lg:px-8">
          <aside className="hidden w-64 shrink-0 lg:block">
            <div className="sticky top-24 space-y-6">
              <HelpSearch index={index} />
              <Link
                href="/help"
                className="block text-sm font-medium text-muted hover:text-text"
              >
                Help home
              </Link>
              <HelpNav categories={nav} />
              <Link
                href="/help/changelog"
                className="block text-xs text-subtle hover:text-text"
              >
                What&rsquo;s new
              </Link>
            </div>
          </aside>
          <div className="min-w-0 flex-1">
            <div className="mb-6 lg:hidden">
              <HelpSearch index={index} />
            </div>
            {children}
          </div>
        </div>
      </main>
      <MarketingFooter menu={footerMenu} />
    </>
  )
}
