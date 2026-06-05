import Link from 'next/link'
import { ArrowRight, Tag, CheckCircle2, AlertTriangle } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminPage, AdminSection } from '@/components/admin/admin-page'
import { listSequences } from '@/lib/onboarding/beta-sequences'
import { getTrait } from '@/lib/traits/registry'
import { renderQrSvg } from '@/lib/qr/render'
import { toAbsoluteSiteUrl } from '@/lib/qr/links'
import { SITE_URL } from '@/lib/site'
import { EntryPointShare } from './entry-point-share'

// The splash-page creator (ADR-068). Janitor-only catalog of the beta induction's
// audience sequences — early-adopter / personal / founding-partner. Each card lets
// you pick the INCOMING POINT (splash vs straight-to-induction) and gives a
// shareable link + QR code for it (/beta/<slug> or /onboarding/beta?seq=<slug>),
// which carries the audience into the induction and stamps a marketing tag so the
// founding cohort stays segmentable forever. Copy is authored in
// lib/onboarding/beta-sequences.ts (source of truth); a DB-backed editable layer
// can override it later without changing this page.

export const dynamic = 'force-dynamic'

export default async function BetaSequencesPage() {
  await requireAdmin('janitor')
  const sequences = listSequences()

  // Pre-render both QR variants per sequence server-side (same renderer as every
  // other QR surface), so the client toggle swaps them with zero round-trips.
  const cards = await Promise.all(
    sequences.map(async (seq) => {
      const splashPath = `/beta/${seq.slug}`
      const inductionPath = `/onboarding/beta?seq=${seq.slug}`
      const [splashQr, inductionQr] = await Promise.all([
        renderQrSvg(toAbsoluteSiteUrl(splashPath), 160),
        renderQrSvg(toAbsoluteSiteUrl(inductionPath), 160),
      ])
      return { seq, splashPath, inductionPath, splashQr, inductionQr, tagDef: getTrait(seq.marketingTag) }
    }),
  )

  return (
    <AdminPage
      title="Beta sequences"
      eyebrow="Vera"
      description="Audience-targeted splash pages that feed the founder induction. Pick an entry point, then share its link or QR — everyone who joins through it runs that voiced flow and gets its marketing tag."
      width="default"
    >
      <AdminSection
        title={`${cards.length} sequences`}
        description="Each card shows the public splash, the induction copy it drives, a shareable link + QR for the entry point you choose, and the cohort tag it stamps."
      >
        <div className="space-y-4">
          {cards.map(({ seq, splashPath, inductionPath, splashQr, inductionQr, tagDef }) => {
            return (
              <article key={seq.slug} className="space-y-4 rounded-2xl border border-border bg-surface p-5">
                {/* Header: audience + the cohort tag */}
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-base font-bold text-text">{seq.audience}</h3>
                    <p className="mt-0.5 font-mono text-xs text-subtle">{splashPath}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-bg px-2.5 py-1 text-xs font-semibold text-primary-strong">
                      <Tag className="h-3 w-3" />
                      {seq.marketingTag}
                    </span>
                    {tagDef ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-success" title="Registered in the trait registry">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Registered
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-warning" title="Not in lib/traits/registry.ts — tagging will be skipped">
                        <AlertTriangle className="h-3.5 w-3.5" /> Unregistered
                      </span>
                    )}
                  </div>
                </div>

                {/* Entry point: set the incoming point + grab its link / QR */}
                <EntryPointShare
                  slug={seq.slug}
                  audience={seq.audience}
                  splashPath={splashPath}
                  inductionPath={inductionPath}
                  splashQr={splashQr}
                  inductionQr={inductionQr}
                  siteOrigin={SITE_URL}
                />

                {/* Splash preview — the real public copy, scaled down */}
                <div className="rounded-xl border border-border bg-surface-elevated/50 p-5 text-center">
                  <p className="text-[0.65rem] font-semibold uppercase tracking-widest text-primary-strong">
                    {seq.splash.eyebrow}
                  </p>
                  <p className="mt-2 text-balance text-xl font-bold leading-tight text-text">{seq.splash.headline}</p>
                  <p className="mx-auto mt-2 max-w-lg text-pretty text-sm leading-relaxed text-muted">{seq.splash.body}</p>
                  <span className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-on-primary">
                    {seq.splash.cta} <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </div>

                {/* Induction copy this sequence drives (Vera's voiced beats) */}
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

                {/* The oaths + heard-about options */}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-subtle">The oaths</p>
                    <ul className="mt-1.5 space-y-1">
                      {seq.oaths.map((o) => (
                        <li key={o.id} className="text-sm text-text">
                          <span className="text-success">✅</span> {o.label}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-subtle">“How did you hear?” options</p>
                    <ul className="mt-1.5 flex flex-wrap gap-1.5">
                      {seq.heardAbout.map((h) => (
                        <li key={h} className="rounded-full bg-surface-elevated px-2.5 py-1 text-xs text-muted">
                          {h}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      </AdminSection>

      <AdminSection title="How it works">
        <ol className="space-y-2 rounded-2xl border border-border bg-surface p-5 text-sm text-muted">
          <li><span className="font-semibold text-text">1. Pick the entry point, then share.</span> Per sequence, choose the <span className="font-semibold text-text">incoming point</span> — the public splash (<code className="rounded bg-surface-elevated px-1 py-0.5 font-mono text-xs">/beta/&lt;slug&gt;</code>) or straight into the induction (<code className="rounded bg-surface-elevated px-1 py-0.5 font-mono text-xs">/onboarding/beta?seq=&lt;slug&gt;</code>) — then copy its link or download the QR (PNG/SVG) for a video description, a DM, a partner email, or printed signage.</li>
          <li><span className="font-semibold text-text">2. They run the matching flow.</span> The CTA carries the audience into the induction (<code className="rounded bg-surface-elevated px-1 py-0.5 font-mono text-xs">?seq=</code>), which speaks in that sequence’s voice. A cookie keeps it through sign-in.</li>
          <li><span className="font-semibold text-text">3. The cohort is tagged.</span> On completion the member is stamped with the sequence’s marketing tag, so you can segment the founding cohort by entry path forever — see <Link href="/admin/segments" className="text-primary-strong hover:underline">Segments</Link>.</li>
        </ol>
        <p className="text-xs text-subtle">
          Links + QRs encode the canonical site URL (<code className="font-mono">{SITE_URL.replace(/^https?:\/\//, '')}</code>), so they’re safe to print and share before launch. For codes with scan analytics or a swappable destination, use the <Link href="/admin/qr" className="text-primary-strong hover:underline">QR Studio</Link> instead. Copy lives in <code className="font-mono">lib/onboarding/beta-sequences.ts</code> (source of truth); editing it in-app is the next step — for now, sequences ship in code and are reviewed in PRs.
        </p>
      </AdminSection>
    </AdminPage>
  )
}
