import Link from 'next/link'
import { MarketingHeader } from '@/components/layout/marketing-header'
import { MarketingFooter } from '@/components/layout/marketing-footer'
import { HelpNav } from '@/components/help/help-nav'
import { HelpSearch } from '@/components/help/help-search'
import { SupportChatWidget } from '@/components/chat/support-chat-widget'
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
      {/* `detectClientAuth`, for the same reason the (marketing) layout sets it: these pages are
          statically generated (see the note above), so the server cannot read auth here without
          force-dynamicking the whole help centre. Without the flag the header rendered the
          logged-out cluster on every help page forever — a member reading /help/the-quest was
          offered "Sign in" and then invited to join the beta they are in. The flag upgrades the
          chrome after hydration and leaves the prerendered body (and what a crawler indexes)
          exactly as it was. */}
      <MarketingHeader headerMenu={headerMenu} menuTimings={menuTimings} detectClientAuth />
      {/* Spacer clears the now-taller fixed header (4rem + safe-area-inset-top); min-h-dvh
          tracks the iOS dynamic toolbar so landscape height doesn't glitch. */}
      {/* id="main" is the target of MarketingHeader's "Skip to content" link (WCAG 2.4.1);
          without it the bypass-blocks link was broken on every help page. */}
      <main id="main" tabIndex={-1} className="min-h-dvh bg-surface" style={{ paddingTop: 'calc(4rem + env(safe-area-inset-top))' }}>
        <div className="mx-auto flex max-w-6xl gap-10 px-4 py-10 lg:px-8">
          <aside className="hidden w-64 shrink-0 lg:block">
            <div className="sticky top-24 space-y-6">
              <HelpSearch index={index} />
              <Link
                href="/help"
                className="block text-body-sm font-medium text-muted hover:text-text"
              >
                Help home
              </Link>
              <HelpNav categories={nav} />
              <Link
                href="/help/changelog"
                className="block text-meta text-subtle hover:text-text"
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
      {/* Anonymous live chat (ADR-816) — this PUBLIC surface owns the bottom-right corner
          (docs/CHAT-SHELL-PLAN.md §2); the member shell owns its own via the dock. Off unless
          NEXT_PUBLIC_SUPPORT_CHAT is enabled. */}
      {process.env.NEXT_PUBLIC_SUPPORT_CHAT === '1' && <SupportChatWidget />}
    </>
  )
}
