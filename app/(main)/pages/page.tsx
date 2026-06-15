import Link from 'next/link'
import { ExternalLink, Pencil, Rocket, ArrowRight, Sparkles } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { isJanitor } from '@/lib/core/roles'
import { EDITABLE_PAGES, listPages } from '@/lib/page-editor/data'
import { MANAGED_ROUTES } from '@/lib/layout/page-chrome'
import { listAllSequences } from '@/lib/onboarding/resolve-sequence'
import { IndexTemplate } from '@/components/templates'
import { SectionHeader } from '@/components/ui/section-header'

export const dynamic = 'force-dynamic'

function fmt(d: string | null | undefined): string {
  if (!d) return 'Not published'
  const date = new Date(d)
  return isNaN(date.getTime())
    ? 'Not published'
    : `Published ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
}

export default async function PagesDirectory() {
  // Page management is STAFF (admin+, ADR-261/262): the Library is the one place to find
  // any page and open it ready to edit. Site Admins get the in-app pages (open in place
  // with edit mode on); the public marketing + beta induction editors stay Executive-
  // Admin (janitor) only, so a Site Admin never dead-ends in a gated editor — those
  // sections are simply hidden below.
  const { webRole } = await requireAdmin('admin')
  const janitor = isJanitor(webRole)

  const pages = janitor ? await listPages() : {}
  const splashVersions = janitor
    ? (await listAllSequences()).filter((s) => s.source === 'custom')
    : []

  // The in-app member-facing surfaces an operator opens to edit in place. The shell
  // workspace under /admin manages itself, so the Operator area is left out here.
  const inAppByArea = (['Member', 'Focus surfaces'] as const).map((area) => ({
    area,
    routes: MANAGED_ROUTES.filter((r) => r.area === area),
  }))

  return (
    <IndexTemplate
      title="Pages"
      description="Find any page and open it ready to edit. In-app pages open in place with edit mode on. The public marketing pages and the beta induction open in their own editors and go live when you publish."
    >
      {/* ── In-app pages — open the real page with edit mode on (ADR-261/262) ── */}
      <SectionHeader title="In-app pages" />
      <p className="-mt-1 mb-4 max-w-2xl text-sm text-muted">
        Open any member-facing page with edit mode on. Staff edit it in place, right on the page.
      </p>
      <div className="mb-10 max-w-3xl space-y-6">
        {inAppByArea.map(({ area, routes }) => (
          <div key={area}>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-subtle">{area}</p>
            <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-subtle">
                    <th className="px-4 py-2.5 font-semibold">Page</th>
                    <th className="px-4 py-2.5 font-semibold">Route</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {routes.map((r) => (
                    <tr key={r.route} className="border-b border-border/60 last:border-0">
                      <td className="px-4 py-3 font-medium text-text">{r.label}</td>
                      <td className="px-4 py-3 font-mono text-xs text-subtle">{r.route}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-3">
                          <a
                            href={r.route}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-muted hover:text-text"
                          >
                            <ExternalLink className="h-3.5 w-3.5" /> View
                          </a>
                          <Link
                            href={`${r.route}?edit=1`}
                            className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary transition-colors hover:bg-primary-hover"
                          >
                            <Pencil className="h-3.5 w-3.5" /> Open &amp; edit
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>

      {janitor && (
        <>
      {/* ── Beta splash — the front door, edited live ── */}
      <Link
        href="/pages/splash"
        className="group mb-8 flex max-w-3xl items-center gap-4 rounded-2xl border border-primary/40 bg-primary-bg/60 p-5 shadow-sm transition-colors hover:border-primary"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-on-primary">
          <Sparkles className="h-5 w-5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-base font-bold text-text">Beta splash</span>
          <span className="block text-sm leading-relaxed text-muted">
            The induction every new member walks through. Edit every beat and watch the real flow update live.
          </span>
        </span>
        <ArrowRight className="h-4 w-4 shrink-0 text-primary-strong transition-transform group-hover:translate-x-0.5" aria-hidden />
      </Link>

      <SectionHeader title="Marketing pages" />
      <div className="rounded-2xl border border-border bg-surface shadow-sm overflow-x-auto max-w-3xl">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-subtle">
              <th className="px-4 py-2.5 font-semibold">Page</th>
              <th className="px-4 py-2.5 font-semibold">Status</th>
              <th className="px-4 py-2.5 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {/* Home: deliberately NOT in the visual editor (a published draft would
                shadow the coded splash — see lib/page-editor/data.ts). Its row edits
                the SEO title + description only, through the page-content system. */}
            <tr className="border-b border-border/60 bg-surface-elevated/40">
              <td className="px-4 py-3">
                <span className="inline-flex items-center gap-2 font-medium text-text">
                  Home
                  <span className="rounded-md border border-border bg-surface px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-wide text-subtle">
                    Coded page
                  </span>
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed text-subtle">
                  SEO title and description only. The homepage itself is a coded experience (live counts) and stays in code.
                </span>
              </td>
              <td className="px-4 py-3">
                <span className="text-xs px-1.5 py-0.5 rounded-md font-medium bg-success-bg text-success">Live from code</span>
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center justify-end gap-3">
                  <a
                    href="/?preview"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-muted hover:text-text"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> View
                  </a>
                  <Link
                    href="/pages/home"
                    className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-text hover:bg-surface-elevated transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" /> Edit SEO
                  </Link>
                </div>
              </td>
            </tr>
            {EDITABLE_PAGES.map((p) => {
              const row = pages[p.slug]
              const published = row?.status === 'published'
              return (
                <tr key={p.slug} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-3 text-text font-medium">{p.title}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded-md font-medium ${
                        published ? 'bg-success-bg text-success' : 'bg-surface-elevated text-muted'
                      }`}
                    >
                      {fmt(row?.published_at)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-3">
                      <a
                        href={p.path}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-muted hover:text-text"
                      >
                        <ExternalLink className="w-3.5 h-3.5" /> View
                      </a>
                      <Link
                        href={`/edit/${p.slug}`}
                        className="inline-flex items-center gap-1 rounded-lg bg-primary text-on-primary px-3 py-1.5 text-xs font-semibold hover:bg-primary-hover transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5" /> Edit
                      </Link>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Splash pages — audience-targeted versions of the induction, built and
          shared from the manager. The default flow is the Beta splash card above. */}
      <div className="mt-10">
        <SectionHeader
          title="Splash pages"
          action={
            <Link
              href="/pages/sequences"
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary-strong transition-colors hover:text-primary-hover"
            >
              Manage all <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          }
        />
        <div className="max-w-3xl overflow-x-auto rounded-2xl border border-border bg-surface shadow-sm">
          {splashVersions.length === 0 ? (
            <div className="p-6 text-center">
              <p className="text-sm font-semibold text-text">No audience versions yet</p>
              <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-muted">
                Every new member walks the default flow (edit it in Beta splash above). Build a version
                for a specific audience in the{' '}
                <Link href="/pages/sequences" className="font-semibold text-primary-strong hover:underline">
                  splash page manager
                </Link>
                .
              </p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-subtle">
                  <th className="px-4 py-2.5 font-semibold">Audience</th>
                  <th className="px-4 py-2.5 font-semibold">Link</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {splashVersions.map((seq) => (
                  <tr key={seq.slug} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-3 font-medium text-text">
                      <span className="inline-flex items-center gap-2">
                        <Rocket className="h-3.5 w-3.5 shrink-0 text-primary-strong" /> {seq.audience}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-subtle">/onboarding/beta?seq={seq.slug}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-3">
                        <a
                          href={`/onboarding/beta?seq=${seq.slug}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-muted hover:text-text"
                        >
                          <ExternalLink className="h-3.5 w-3.5" /> View
                        </a>
                        <Link
                          href={`/pages/sequences/${seq.slug}/build`}
                          className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary transition-colors hover:bg-primary-hover"
                        >
                          <Pencil className="h-3.5 w-3.5" /> Edit
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
        </>
      )}
    </IndexTemplate>
  )
}
