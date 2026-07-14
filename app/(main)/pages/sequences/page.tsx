import Link from 'next/link'
import {
  ArrowLeft,
  Tag,
  CheckCircle2,
  AlertTriangle,
  Pencil,
  Plus,
  ExternalLink,
  Sparkles,
} from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { DashboardTemplate } from '@/components/templates'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import { listAllSequences, resolveSequence } from '@/lib/onboarding/resolve-sequence'
import { createSequenceVersion, createFromTemplateAction } from './builder-actions'
import { getTrait } from '@/lib/traits/registry'
import { renderStyledQrSvg } from '@/lib/qr/render-styled'
import { styleWithInlinedLogo } from '@/lib/qr/raster'
import { DEFAULT_STYLE } from '@/lib/qr/style'
import { toAbsoluteSiteUrl } from '@/lib/qr/links'
import { SITE_URL } from '@/lib/site'
import { EntryPointShare } from './entry-point-share'
import { FunnelRowActions } from './funnel-actions'
import { TRIGGER_CHIP } from '@/lib/walkthroughs'
import { allRolePromotionWalkthroughs } from '@/lib/walkthroughs/role-promotion'
import { RolePromotionPreview } from './role-promotion-preview'

// Splash Funnels (ADR-068 → ADR-162, Phase 4): the one library for the whole onboarding
// front door. The FIRST entry is the default "Splash Funnel" template (slug beta-default)
// — what /onboarding/beta runs with no ?seq, edited at /pages/splash, and the thing every
// custom funnel is cloned from. Each custom funnel runs the full induction in its own voice
// at /onboarding/beta?seq=<slug>, stamps a marketing tag so the cohort stays segmentable,
// and carries its own lifecycle (draft → published, duplicate, delete). Role promotion tours
// are a separate, always-on category, listed below.

export const dynamic = 'force-dynamic'

// ── Shared chrome — matches the Pages workspace look (app/(main)/pages/page.tsx). ──
const VIEW_LINK = 'inline-flex items-center gap-1 text-xs text-muted hover:text-text'
const EDIT_BTN =
  'inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary transition-colors hover:bg-primary-hover'

// PERF-9: each custom funnel below costs a resolveSequence read + a server-side QR
// render, so cap how many we fan out per page load. Operators have a handful, not
// hundreds; this bounds the work even if the list grows unexpectedly.
const MAX_FUNNELS = 100

export default async function SplashFunnelsPage() {
  await requireAdmin('janitor')
  const funnels = (await listAllSequences())
    .filter((s) => s.source === 'custom')
    .slice(0, MAX_FUNNELS)

  // The branded site QR style: the default style (connected modules, rounded eyes) with
  // the Frequency logo centered. Fetch + inline the logo ONCE server-side so every funnel
  // QR below is a self-contained SVG (no remote <image href>); a failed fetch drops the
  // logo (null) and the code still renders. Matches the QR Studio / flyer default look.
  const brandedStyle = await styleWithInlinedLogo(DEFAULT_STYLE)

  // Resolve each funnel (copy + tag, preview so drafts show their real content) and
  // pre-render its induction QR server-side in the branded site style.
  const cards = await Promise.all(
    funnels.map(async (f) => {
      const seq = await resolveSequence(f.slug, { preview: true })
      const inductionPath = `/onboarding/beta?seq=${f.slug}`
      const inductionQr = renderStyledQrSvg(toAbsoluteSiteUrl(inductionPath), brandedStyle, 160)
      return {
        slug: f.slug,
        status: f.status,
        seq,
        inductionPath,
        inductionQr,
        tagDef: getTrait(seq.marketingTag),
      }
    }),
  )

  return (
    <DashboardTemplate
      eyebrow="Pages"
      title="Splash Funnels"
      description="Every onboarding front door in one place. Start from the template, tune a funnel for a specific audience, share its link, and everyone who joins through it walks the full induction in that voice."
      width="wide"
      actions={
        <div className="flex items-center gap-2">
          <Link
            href="/pages"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:bg-surface-elevated hover:text-text"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> All pages
          </Link>
          <form action={createFromTemplateAction}>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
            >
              <Plus className="h-4 w-4" /> Create from template
            </button>
          </form>
        </div>
      }
    >
      {/* ── The template — the first funnel, always live, what every other one clones. ── */}
      <section>
        <SectionHeader title="The template" />
        <div className="flex max-w-3xl flex-col gap-4 rounded-2xl border border-primary/40 bg-primary-bg/60 p-5 shadow-sm sm:flex-row sm:items-center">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-on-primary">
            <Sparkles className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-text">Splash Funnel template</h3>
              <span className="shrink-0 rounded-full bg-success-bg px-2 py-0.5 text-xs font-medium text-success">
                Always live
              </span>
            </div>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              The default funnel every new member walks through, and the starting point for
              every custom funnel. Edit it once and every new funnel inherits the change.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <a
              href="/onboarding/beta"
              target="_blank"
              rel="noreferrer"
              className={VIEW_LINK}
            >
              <ExternalLink className="h-3.5 w-3.5" /> Preview
            </a>
            <Link href="/pages/splash" className={EDIT_BTN}>
              <Pencil className="h-3.5 w-3.5" /> Edit
            </Link>
          </div>
        </div>
      </section>

      {/* ── Custom funnels — one row each, with full lifecycle controls. ── */}
      <section>
        <SectionHeader title="Custom funnels" count={cards.length} />
        <p className="-mt-1 mb-4 max-w-2xl text-sm text-muted">
          A funnel for a specific audience. Each one carries its own voice, its own
          shareable link, and a cohort tag so you can segment everyone who joins through it.
        </p>
        {cards.length === 0 ? (
          <div className="max-w-3xl">
            <EmptyState
              title="No custom funnels yet"
              description="Every new member walks the template above. Start a funnel tuned to a specific audience when you want one."
              action={
                <form action={createFromTemplateAction}>
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
                  >
                    <Plus className="h-4 w-4" /> Create from template
                  </button>
                </form>
              }
            />
          </div>
        ) : (
          <div className="space-y-4">
            {cards.map(({ slug, status, seq, inductionPath, inductionQr, tagDef }) => (
              <article
                key={slug}
                className="space-y-4 rounded-2xl border border-border bg-surface p-5 shadow-sm"
              >
                {/* Header: audience, status, link, tag */}
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-bold text-text">{seq.audience}</h3>
                      <span
                        className={`rounded-md px-1.5 py-0.5 text-xs font-medium ${
                          status === 'published'
                            ? 'bg-success-bg text-success'
                            : 'bg-surface-elevated text-muted'
                        }`}
                      >
                        {status === 'published' ? 'Published' : 'Draft'}
                      </span>
                    </div>
                    <p className="mt-1 font-mono text-xs text-subtle">{inductionPath}</p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-bg px-2.5 py-1 text-xs font-semibold text-primary-strong">
                      <Tag className="h-3 w-3" />
                      {seq.marketingTag}
                    </span>
                    {tagDef ? (
                      <span
                        className="inline-flex items-center gap-1 text-xs font-medium text-success"
                        title="Registered in the trait registry"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" /> Registered
                      </span>
                    ) : (
                      <span
                        className="inline-flex items-center gap-1 text-xs font-medium text-warning"
                        title="Not in lib/traits/registry.ts, so tagging will be skipped"
                      >
                        <AlertTriangle className="h-3.5 w-3.5" /> Unregistered
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions: edit + preview, then the lifecycle controls. */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/pages/sequences/${slug}/edit`} className={EDIT_BTN}>
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </Link>
                    <a
                      href={inductionPath}
                      target="_blank"
                      rel="noreferrer"
                      className={VIEW_LINK}
                    >
                      <ExternalLink className="h-3.5 w-3.5" /> Preview
                    </a>
                  </div>
                  <FunnelRowActions slug={slug} status={status} />
                </div>

                {/* Entry point: shareable link + QR straight into the induction. */}
                <EntryPointShare
                  slug={slug}
                  audience={seq.audience}
                  inductionPath={inductionPath}
                  inductionQr={inductionQr}
                  siteOrigin={SITE_URL}
                />
              </article>
            ))}
          </div>
        )}
      </section>

      {/* ── Secondary: a blank funnel from just an audience name. ── */}
      <section>
        <SectionHeader title="Start from scratch" />
        <p className="-mt-1 mb-4 max-w-2xl text-sm text-muted">
          Prefer a blank slate? Name an audience and build every beat yourself, instead of
          cloning the template.
        </p>
        <div className="max-w-3xl rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <form action={createSequenceVersion} className="flex flex-wrap items-end gap-2">
            <label className="min-w-0 flex-1">
              <span className="mb-1 block text-xs font-semibold text-subtle">Audience name</span>
              <input
                name="audience"
                required
                placeholder="e.g. Local business owners"
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-subtle outline-none focus:border-broadcast"
              />
            </label>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm font-semibold text-muted transition-colors hover:bg-surface-elevated hover:text-text"
            >
              <Plus className="h-4 w-4" /> Create blank funnel
            </button>
          </form>
        </div>
      </section>

      <RolePromotionTours />

      {/* ── How it works — the share-and-segment loop in plain terms. ── */}
      <section>
        <SectionHeader title="How it works" />
        <ol className="max-w-3xl space-y-2 rounded-2xl border border-border bg-surface p-5 text-sm text-muted shadow-sm">
          <li>
            <span className="font-semibold text-text">1. Make a funnel, then share its link.</span>{' '}
            Each funnel gets a link and a QR (PNG or SVG) into its induction (
            <code className="rounded bg-surface-elevated px-1 py-0.5 font-mono text-xs">
              /onboarding/beta?seq=&lt;slug&gt;
            </code>
            ) for a video description, a DM, a partner email, or printed signage.
          </li>
          <li>
            <span className="font-semibold text-text">2. They walk the matching flow.</span> The
            link carries the audience into the induction (
            <code className="rounded bg-surface-elevated px-1 py-0.5 font-mono text-xs">?seq=</code>
            ), which speaks in that funnel&rsquo;s voice. A cookie keeps it through sign-in. A
            draft falls back to the template until you publish.
          </li>
          <li>
            <span className="font-semibold text-text">3. The cohort is tagged.</span> On
            completion the member is stamped with the funnel&rsquo;s marketing tag, so you can
            segment the founding cohort by entry path forever. See{' '}
            <Link href="/admin/segments" className="text-primary-strong hover:underline">
              Segments
            </Link>
            .
          </li>
        </ol>
        <p className="mt-3 max-w-3xl text-xs text-subtle">
          Links and QRs encode the canonical site URL (
          <code className="font-mono">{SITE_URL.replace(/^https?:\/\//, '')}</code>), so they&rsquo;re
          safe to print and share before launch. For codes with scan analytics or a swappable
          destination, use the{' '}
          <Link href="/admin/qr" className="text-primary-strong hover:underline">
            QR Studio
          </Link>{' '}
          instead. The template&rsquo;s copy is edited in{' '}
          <Link href="/pages/splash" className="text-primary-strong hover:underline">
            the Splash Funnel template
          </Link>
          ; a tag only stamps if it&rsquo;s registered in{' '}
          <code className="font-mono">lib/traits/registry.ts</code>.
        </p>
      </section>
    </DashboardTemplate>
  )
}

// ── Role promotion tours (P1.8) ──────────────────────────────────────────────────
// The code-shipped tours assignRole queues when a member's trust role advances. Listed
// here so an operator can see exactly what each member sees and preview the slides. The
// content lives in lib/walkthroughs/role-promotion.ts (not editable here on purpose —
// these are shipped, always-on tours, distinct from the audience-targeted DB funnels above).
function RolePromotionTours() {
  const tours = allRolePromotionWalkthroughs()
  return (
    <section>
      <SectionHeader title="Role promotion tours" />
      <p className="-mt-1 mb-4 max-w-2xl text-sm text-muted">
        When a member&rsquo;s role advances, they get a short tour of the areas it just
        unlocked. One tour per step up the trust ladder. Each fires automatically the
        moment the role is granted, then meets the member as a gentle card on their next
        feed visit.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        {tours.map((t) => (
          <div key={t.slug} className="flex flex-col rounded-2xl border border-border bg-surface p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-broadcast-bg px-2 py-0.5 text-2xs font-semibold text-broadcast-strong">
                {TRIGGER_CHIP[t.trigger]}
              </span>
            </div>
            <h3 className="mt-2 text-sm font-bold text-text">{t.name}</h3>
            <p className="mt-1 flex-1 text-xs leading-relaxed text-muted">{t.description}</p>
            <p className="mt-2 text-2xs font-medium text-subtle">
              {t.steps.length} {t.steps.length === 1 ? 'slide' : 'slides'}
            </p>
            <RolePromotionPreview walkthrough={t} />
          </div>
        ))}
      </div>
      <p className="mt-3 max-w-3xl text-xs text-subtle">
        These tours are shipped with the product, so they aren&rsquo;t edited here. The content
        lives in{' '}
        <code className="rounded bg-surface-elevated px-1 py-0.5 font-mono text-xs">
          lib/walkthroughs/role-promotion.ts
        </code>
        . For evergreen walkthroughs you author and target yourself, use{' '}
        <Link href="/admin/walkthroughs" className="text-primary-strong hover:underline">
          Walkthroughs
        </Link>
        .
      </p>
    </section>
  )
}
