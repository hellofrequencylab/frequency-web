import Link from 'next/link'
import { ArrowLeft, Tag, CheckCircle2, AlertTriangle, Wand2, Plus, Rocket, Layers, Trash2 } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminPage, AdminSection } from '@/components/admin/admin-page'
import { listAllSequences, resolveSequence } from '@/lib/onboarding/resolve-sequence'
import { createSequenceVersion, deleteSequenceVersionAction } from './builder-actions'
import { getTrait } from '@/lib/traits/registry'
import { renderQrSvg } from '@/lib/qr/render'
import { toAbsoluteSiteUrl } from '@/lib/qr/links'
import { SITE_URL } from '@/lib/site'
import { EntryPointShare } from './entry-point-share'

// Splash pages (ADR-068 → ADR-162): audience-targeted splash + induction flows.
// Every flow here is a DB version built in the wizard (the three code-shipped
// launch templates retired); each runs the full induction in its own voice at
// /onboarding/beta?seq=<slug> and stamps a marketing tag so the cohort stays
// segmentable forever. The DEFAULT flow (what /onboarding/beta runs with no ?seq)
// is edited at /pages/splash, not here. Role promotion overlays are a planned
// second category — visible below, not built yet.

export const dynamic = 'force-dynamic'

export default async function SplashPagesPage() {
  await requireAdmin('janitor')
  const versions = (await listAllSequences()).filter((s) => s.source === 'custom')

  // Resolve each version (copy + tag) and pre-render its induction QR server-side
  // (same renderer as every other QR surface).
  const cards = await Promise.all(
    versions.map(async (v) => {
      const seq = await resolveSequence(v.slug)
      const inductionPath = `/onboarding/beta?seq=${v.slug}`
      const inductionQr = await renderQrSvg(toAbsoluteSiteUrl(inductionPath), 160)
      return { seq, inductionPath, inductionQr, tagDef: getTrait(seq.marketingTag) }
    }),
  )

  return (
    <AdminPage
      title="Splash pages"
      eyebrow="Pages"
      description="Audience-targeted splash and induction flows. Build a version for a specific audience, share its link or QR, and everyone who joins through it walks the full induction in that voice and gets its marketing tag."
      width="default"
      actions={
        <Link
          href="/pages"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:bg-surface-elevated hover:text-text"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> All pages
        </Link>
      }
    >
      {/* ── Categories: what lives here today, and what's coming ── */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-border bg-surface p-5">
          <div className="flex items-center gap-2">
            <Rocket className="h-4 w-4 shrink-0 text-primary-strong" aria-hidden />
            <h2 className="text-sm font-bold text-text">Splash pages</h2>
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-muted">
            Audience-targeted splash and induction flows. The default flow at /onboarding/beta is edited in{' '}
            <Link href="/pages/splash" className="font-semibold text-primary-strong hover:underline">
              Beta splash
            </Link>
            ; versions for specific audiences live below.
          </p>
        </div>
        <div
          aria-disabled
          className="cursor-not-allowed rounded-2xl border border-dashed border-border bg-surface/50 p-5 opacity-60"
        >
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 shrink-0 text-subtle" aria-hidden />
            <h2 className="text-sm font-bold text-muted">Role promotion overlays</h2>
            <span className="ml-auto shrink-0 rounded-full bg-surface-elevated px-2 py-0.5 text-3xs font-semibold uppercase tracking-wide text-subtle">
              Coming soon
            </span>
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-muted">
            These will walk a member through newly unlocked areas when their role advances.
          </p>
        </div>
      </div>

      <AdminSection
        title="Build a version"
        description="Spin up a new version of the whole induction (every voiced beat) for a specific audience, then edit it beat by beat in the guided builder."
      >
        <div className="rounded-2xl border border-border bg-surface p-5">
          <form action={createSequenceVersion} className="flex flex-wrap items-end gap-2">
            <label className="min-w-0 flex-1">
              <span className="mb-1 block text-xs font-semibold text-subtle">New version: audience name</span>
              <input
                name="audience"
                required
                placeholder="e.g. Local business owners"
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-subtle outline-none focus:border-broadcast"
              />
            </label>
            <button type="submit" className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover">
              <Plus className="h-4 w-4" /> Create &amp; build
            </button>
          </form>
        </div>
      </AdminSection>

      <AdminSection
        title={cards.length === 1 ? '1 version' : `${cards.length} versions`}
        description="Each card shows the audience, the cohort tag it stamps, and a shareable link + QR straight into its induction."
      >
        {cards.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-surface p-8 text-center">
            <p className="text-sm font-semibold text-text">No versions yet</p>
            <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-muted">
              Every new member currently walks the default flow. Create a version above when you want a
              splash and induction tuned to a specific audience.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {cards.map(({ seq, inductionPath, inductionQr, tagDef }) => (
              <article key={seq.slug} className="space-y-4 rounded-2xl border border-border bg-surface p-5">
                {/* Header: audience + the cohort tag */}
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-base font-bold text-text">{seq.audience}</h3>
                    <p className="mt-0.5 font-mono text-xs text-subtle">{inductionPath}</p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <Link
                      href={`/pages/sequences/${seq.slug}/build`}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-2.5 py-1 text-xs font-semibold text-on-primary transition-colors hover:bg-primary-hover"
                    >
                      <Wand2 className="h-3 w-3" /> Build induction
                    </Link>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-bg px-2.5 py-1 text-xs font-semibold text-primary-strong">
                      <Tag className="h-3 w-3" />
                      {seq.marketingTag}
                    </span>
                    {tagDef ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-success" title="Registered in the trait registry">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Registered
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-warning" title="Not in lib/traits/registry.ts, so tagging will be skipped">
                        <AlertTriangle className="h-3.5 w-3.5" /> Unregistered
                      </span>
                    )}
                    <form action={deleteSequenceVersionAction.bind(null, seq.slug)}>
                      <button
                        type="submit"
                        title="Delete this version"
                        className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs font-semibold text-muted transition-colors hover:bg-danger-bg hover:text-danger"
                      >
                        <Trash2 className="h-3 w-3" /> Delete
                      </button>
                    </form>
                  </div>
                </div>

                {/* Entry point: shareable link + QR straight into the induction */}
                <EntryPointShare
                  slug={seq.slug}
                  audience={seq.audience}
                  inductionPath={inductionPath}
                  inductionQr={inductionQr}
                  siteOrigin={SITE_URL}
                />

                {/* The beats this version voices, at a glance */}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-border bg-surface-elevated/50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-subtle">Oath beat</p>
                    <p className="mt-1.5 text-sm font-bold text-text">{seq.vera.oath.heading}</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted">{seq.vera.oath.body}</p>
                  </div>
                  <div className="rounded-xl border border-border bg-surface-elevated/50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-subtle">Welcome beat</p>
                    <p className="mt-1.5 text-sm font-bold text-text">{seq.vera.intro.heading}</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted">{seq.vera.intro.body}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </AdminSection>

      <AdminSection title="How it works">
        <ol className="space-y-2 rounded-2xl border border-border bg-surface p-5 text-sm text-muted">
          <li><span className="font-semibold text-text">1. Build a version, then share its link.</span> Each version gets a link + QR (PNG/SVG) into its induction (<code className="rounded bg-surface-elevated px-1 py-0.5 font-mono text-xs">/onboarding/beta?seq=&lt;slug&gt;</code>) for a video description, a DM, a partner email, or printed signage.</li>
          <li><span className="font-semibold text-text">2. They run the matching flow.</span> The link carries the audience into the induction (<code className="rounded bg-surface-elevated px-1 py-0.5 font-mono text-xs">?seq=</code>), which speaks in that version&rsquo;s voice. A cookie keeps it through sign-in.</li>
          <li><span className="font-semibold text-text">3. The cohort is tagged.</span> On completion the member is stamped with the version&rsquo;s marketing tag, so you can segment the founding cohort by entry path forever. See <Link href="/admin/segments" className="text-primary-strong hover:underline">Segments</Link>.</li>
        </ol>
        <p className="text-xs text-subtle">
          Links + QRs encode the canonical site URL (<code className="font-mono">{SITE_URL.replace(/^https?:\/\//, '')}</code>), so they&rsquo;re safe to print and share before launch. For codes with scan analytics or a swappable destination, use the <Link href="/admin/qr" className="text-primary-strong hover:underline">QR Studio</Link> instead. The default flow&rsquo;s copy is edited in <Link href="/pages/splash" className="text-primary-strong hover:underline">Beta splash</Link>; a tag only stamps if it&rsquo;s registered in <code className="font-mono">lib/traits/registry.ts</code>.
        </p>
      </AdminSection>
    </AdminPage>
  )
}
