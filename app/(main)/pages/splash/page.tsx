import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { getJanitor } from '@/lib/page-editor/guard'
import { AdminPage } from '@/components/admin/admin-page'
import { DEFAULT_SEQUENCE } from '@/lib/onboarding/beta-sequences'
import { resolveDefaultSequence } from '@/lib/onboarding/resolve-sequence'
import { getSequenceOverride } from '@/lib/onboarding/sequence-overrides'
import { SplashCopyEditor } from './editor'

export const dynamic = 'force-dynamic'

// The default Splash Funnel template's live-preview editor: every voiced beat of the
// induction at /onboarding/beta, edited on the left and rendered by the REAL induction
// component on the right. This is the first entry in the Splash Funnels library and the
// template every custom funnel clones. Saves the `beta-default` override
// (sequence_overrides); janitor-gated like the rest of /pages.
export default async function SplashFunnelTemplatePage() {
  if (!(await getJanitor())) notFound()

  // The flow exactly as it's live right now (coded copy + any saved edits).
  const seq = await resolveDefaultSequence()
  const hasOverride = !!(await getSequenceOverride(DEFAULT_SEQUENCE))

  return (
    <AdminPage
      title="Splash Funnel template"
      eyebrow="Splash Funnels"
      description="The default funnel every new member walks through, and the template every custom funnel is built from. Edit the words on the left and watch the real flow update on the right. Saving publishes straight to /onboarding/beta."
      width="wide"
      actions={
        <div className="flex items-center gap-2">
          <Link
            href="/pages/sequences"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:bg-surface-elevated hover:text-text"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> All funnels
          </Link>
          <a
            href="/onboarding/beta"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:bg-surface-elevated hover:text-text"
          >
            <ExternalLink className="h-3.5 w-3.5" /> View live
          </a>
        </div>
      }
    >
      <SplashCopyEditor
        initialVera={seq.vera}
        initialOaths={seq.oaths}
        heardAbout={seq.heardAbout}
        initialHasOverride={hasOverride}
      />
    </AdminPage>
  )
}
