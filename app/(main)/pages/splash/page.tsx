import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { getJanitor } from '@/lib/page-editor/guard'
import { AdminPage } from '@/components/admin/admin-page'
import { DEFAULT_FUNNEL } from '@/lib/funnels/definitions'
import { resolveDefaultFunnel } from '@/lib/funnels/resolve'
import { getFunnelOverride } from '@/lib/funnels/overrides'
import { SplashCopyEditor } from './editor'

export const dynamic = 'force-dynamic'

// The default Funnel's live-preview editor: every voiced beat of the induction at
// /join, edited on the left and rendered by the REAL induction component on the
// right. This is the first entry in the Funnels library and the template every
// custom Funnel clones. Saves the `beta-default` override (a stored slug — see
// lib/funnels/definitions.ts) in sequence_overrides; janitor-gated like /pages.
export default async function DefaultFunnelTemplatePage() {
  if (!(await getJanitor())) notFound()

  // The flow exactly as it's live right now (coded copy + any saved edits).
  const seq = await resolveDefaultFunnel()
  const hasOverride = !!(await getFunnelOverride(DEFAULT_FUNNEL))

  return (
    <AdminPage
      title="Default Funnel"
      eyebrow="Funnels"
      description="The default Funnel every new member walks through, and the template every custom Funnel is built from. Edit the words on the left and watch the real flow update on the right. Saving publishes straight to /join."
      width="wide"
      actions={
        <div className="flex items-center gap-2">
          <Link
            href="/pages/sequences"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-meta font-semibold text-muted transition-colors hover:bg-surface-elevated hover:text-text"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> All funnels
          </Link>
          <a
            href="/join"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-meta font-semibold text-muted transition-colors hover:bg-surface-elevated hover:text-text"
          >
            <ExternalLink className="h-3.5 w-3.5" /> View live
          </a>
        </div>
      }
    >
      <SplashCopyEditor
        initialVera={seq.vera}
        heardAbout={seq.heardAbout}
        initialHasOverride={hasOverride}
      />
    </AdminPage>
  )
}
