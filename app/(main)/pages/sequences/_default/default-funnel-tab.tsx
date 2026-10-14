import { ExternalLink } from 'lucide-react'
import { SectionHeader } from '@/components/ui/section-header'
import { DEFAULT_FUNNEL } from '@/lib/funnels/definitions'
import { resolveDefaultFunnel } from '@/lib/funnels/resolve'
import { getFunnelOverride } from '@/lib/funnels/overrides'
import { SplashCopyEditor } from './editor'

// The Default Funnel TAB of the Funnels page (/pages/sequences?tab=default). It was its own page at
// /pages/splash until the owner ruling of 2026-10-14 (ADR-1746) merged it in; that route now 301s
// here (next.config.ts). The body is unchanged: every voiced beat of the induction at /join, edited
// on the left and rendered by the REAL induction component on the right. It is the first entry in
// the Funnels library and the template every custom Funnel clones. Saves the `beta-default` override
// (a stored slug, see lib/funnels/definitions.ts) in sequence_overrides; the page gates janitor and
// each save action re-checks it (./actions.ts).
export async function DefaultFunnelTab() {
  // The flow exactly as it's live right now (coded copy + any saved edits).
  const seq = await resolveDefaultFunnel()
  const hasOverride = !!(await getFunnelOverride(DEFAULT_FUNNEL))

  return (
    <section>
      <SectionHeader title="Default Funnel" />
      <div className="-mt-1 mb-4 flex max-w-3xl flex-wrap items-start justify-between gap-3">
        <p className="min-w-0 flex-1 text-body-sm text-muted">
          The default Funnel every new member walks through, and the template every custom Funnel
          is built from. Edit the words on the left and watch the real flow update on the right.
          Saving publishes straight to /join.
        </p>
        <a
          href="/join"
          target="_blank"
          rel="noreferrer"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-control border border-border px-3 py-1.5 text-meta font-semibold text-muted transition-colors hover:bg-surface-elevated hover:text-text"
        >
          <ExternalLink className="h-3.5 w-3.5" /> View live
        </a>
      </div>
      <SplashCopyEditor initialVera={seq.vera} heardAbout={seq.heardAbout} initialHasOverride={hasOverride} />
    </section>
  )
}
