import Link from 'next/link'
import { cookies } from 'next/headers'
import { ExternalLink, Pencil, ArrowRight, Sparkles } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { isJanitor } from '@/lib/core/roles'
import { EDITABLE_PAGES, listPages, type PageRow } from '@/lib/page-editor/data'
import { MANAGED_ROUTES } from '@/lib/layout/page-chrome'
import { listAllSequences } from '@/lib/onboarding/resolve-sequence'
import { DashboardTemplate } from '@/components/templates'
import { SectionHeader } from '@/components/ui/section-header'
import { pagesCookie, sanitizePagesOrder, type PagesArea } from './pages-areas'

export const dynamic = 'force-dynamic'

function fmt(d: string | null | undefined): string {
  if (!d) return 'Not published'
  const date = new Date(d)
  return isNaN(date.getTime())
    ? 'Not published'
    : `Published ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
}

// ── Shared table chrome — the one table look the workspace reuses across areas. ──
const TABLE_WRAP = 'overflow-x-auto rounded-2xl border border-border bg-surface shadow-sm'
const HEAD_ROW = 'border-b border-border text-left text-xs uppercase tracking-wider text-subtle'
const TH = 'px-4 py-2.5 font-semibold'
const BODY_ROW = 'border-b border-border/60 last:border-0'
const VIEW_LINK = 'inline-flex items-center gap-1 text-xs text-muted hover:text-text'
const EDIT_BTN =
  'inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary transition-colors hover:bg-primary-hover'

// ── In-app pages — open the real page with edit mode on (ADR-261/262). ──
// One section per managed AREA (Member, Focus surfaces): View opens the live page,
// Open & edit opens it in place with `?edit=1`.
function InAppSection({ area, label }: { area: 'Member' | 'Focus surfaces'; label: string }) {
  const routes = MANAGED_ROUTES.filter((r) => r.area === area)
  return (
    <section>
      <SectionHeader title={`In-app pages / ${label}`} />
      <p className="-mt-1 mb-4 max-w-2xl text-sm text-muted">
        Open any member-facing page with edit mode on. Staff edit it in place, right on the page.
      </p>
      <div className={`max-w-3xl ${TABLE_WRAP}`}>
        <table className="w-full text-sm">
          <thead>
            <tr className={HEAD_ROW}>
              <th className={TH}>Page</th>
              <th className={TH}>Route</th>
              <th className={`${TH} text-right`}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {routes.map((r) => (
              <tr key={r.route} className={BODY_ROW}>
                <td className="px-4 py-3 font-medium text-text">{r.label}</td>
                <td className="px-4 py-3 font-mono text-xs text-subtle">{r.route}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-3">
                    <a href={r.route} target="_blank" rel="noreferrer" className={VIEW_LINK}>
                      <ExternalLink className="h-3.5 w-3.5" /> View
                    </a>
                    <Link href={`${r.route}?edit=1`} className={EDIT_BTN}>
                      <Pencil className="h-3.5 w-3.5" /> Open &amp; edit
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

// ── Marketing pages — the public, editor-backed site. ──
// Home is now a normal Puck-editable row (it ships from EDITABLE_PAGES): Edit opens the
// visual editor at /edit/home, View opens the live homepage. No more "coded page" row.
function MarketingSection({ pages }: { pages: Record<string, PageRow> }) {
  return (
    <section>
      <SectionHeader title="Marketing pages" />
      <div className={`max-w-3xl ${TABLE_WRAP}`}>
        <table className="w-full text-sm">
          <thead>
            <tr className={HEAD_ROW}>
              <th className={TH}>Page</th>
              <th className={TH}>Status</th>
              <th className={`${TH} text-right`}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {EDITABLE_PAGES.map((p) => {
              const row = pages[p.slug]
              const published = row?.status === 'published'
              return (
                <tr key={p.slug} className={BODY_ROW}>
                  <td className="px-4 py-3 font-medium text-text">{p.title}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-md px-1.5 py-0.5 text-xs font-medium ${
                        published ? 'bg-success-bg text-success' : 'bg-surface-elevated text-muted'
                      }`}
                    >
                      {fmt(row?.published_at)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-3">
                      <a href={p.path} target="_blank" rel="noreferrer" className={VIEW_LINK}>
                        <ExternalLink className="h-3.5 w-3.5" /> View
                      </a>
                      <Link href={`/edit/${p.slug}`} className={EDIT_BTN}>
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </Link>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

// ── Splash funnels — the onboarding front door. One card into the library, plus a
//    live count and a shortcut to the template every funnel is built from. ──
function SplashFunnelsSection({ customCount }: { customCount: number }) {
  return (
    <section>
      <SectionHeader
        title="Splash funnels"
        action={
          <Link
            href="/pages/sequences"
            className="inline-flex items-center gap-1 text-xs font-semibold text-primary-strong transition-colors hover:text-primary-hover"
          >
            Manage all <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        }
      />
      <Link
        href="/pages/sequences"
        className="group flex max-w-3xl items-center gap-4 rounded-2xl border border-primary/40 bg-primary-bg/60 p-5 shadow-sm transition-colors hover:border-primary"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-on-primary">
          <Sparkles className="h-5 w-5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-base font-bold text-text">Splash Funnels</span>
          <span className="block text-sm leading-relaxed text-muted">
            The induction every new member walks through. Start from the template, tune a
            funnel for a specific audience, and watch the real flow update live.
          </span>
          <span className="mt-1.5 block text-xs font-medium text-subtle">
            {customCount === 0
              ? 'Just the template so far'
              : `${customCount} custom ${customCount === 1 ? 'funnel' : 'funnels'} plus the template`}
          </span>
        </span>
        <ArrowRight
          className="h-4 w-4 shrink-0 text-primary-strong transition-transform group-hover:translate-x-0.5"
          aria-hidden
        />
      </Link>
      <p className="mt-2 max-w-3xl text-xs text-subtle">
        Editing the{' '}
        <Link href="/pages/splash" className="font-semibold text-primary-strong hover:underline">
          Splash Funnel template
        </Link>{' '}
        updates the default flow and every new funnel built from it.
      </p>
    </section>
  )
}

export default async function PagesDirectory() {
  // Page management is STAFF (admin+, ADR-261/262): the workspace is the one place to find
  // any page and open it ready to edit. Site Admins get the in-app pages (open in place
  // with edit mode on); the public marketing + beta induction editors stay Executive-
  // Admin (janitor) only, so a Site Admin never dead-ends in a gated editor — those areas
  // are simply hidden below.
  const { webRole } = await requireAdmin('admin')
  const janitor = isJanitor(webRole)

  const pages = janitor ? await listPages() : {}
  const customFunnelCount = janitor
    ? (await listAllSequences()).filter((s) => s.source === 'custom').length
    : 0

  // The operator's saved area order (the page-admin dock writes the cookie), read during
  // server render so the workspace never reflows. Non-janitors only ever see the in-app
  // areas, so the marketing / splash sections stay null for them.
  const order: PagesArea[] = sanitizePagesOrder((await cookies()).get(pagesCookie())?.value)
  const sections: Record<PagesArea, React.ReactNode> = {
    'in-app-member': <InAppSection area="Member" label="Member" />,
    'in-app-focus': <InAppSection area="Focus surfaces" label="Focus surfaces" />,
    'splash-funnels': janitor ? <SplashFunnelsSection customCount={customFunnelCount} /> : null,
    marketing: janitor ? <MarketingSection pages={pages} /> : null,
  }

  return (
    <DashboardTemplate
      title="Pages"
      description="Find any page and open it ready to edit. In-app pages open in place with edit mode on. The public marketing pages and the Splash Funnels open in their own editors and go live when you publish."
      width="wide"
    >
      {order.map((id) => {
        const node = sections[id]
        return node ? <div key={id}>{node}</div> : null
      })}
    </DashboardTemplate>
  )
}
