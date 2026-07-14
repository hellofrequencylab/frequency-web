import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { getJanitor } from '@/lib/page-editor/guard'
import { AdminPage } from '@/components/admin/admin-page'
import { DEFAULT_SEQUENCE } from '@/lib/onboarding/beta-sequences'
import { resolveSequence } from '@/lib/onboarding/resolve-sequence'
import { getSequenceOverride } from '@/lib/onboarding/sequence-overrides'
import { SplashCopyEditor } from '@/app/(main)/pages/splash/editor'

export const dynamic = 'force-dynamic'

// Edit a CUSTOM Splash Funnel's copy (ADR-162 → splash-editor refactor). Mounts the
// SAME live-preview copy editor as the default template (/pages/splash), scoped to this
// funnel's slug: the operator retitles it, rewrites every voiced beat, and watches the
// real induction update. Saving writes this slug's override (saveSequenceVersion) and
// carries its publish state forward, so a draft stays a draft until published from the
// funnels list. Janitor-gated like the rest of /pages.
export default async function EditFunnelPage({ params }: { params: Promise<{ slug: string }> }) {
  if (!(await getJanitor())) notFound()
  const { slug } = await params
  // The default template has its own editor; never edit it as a custom funnel.
  if (slug === DEFAULT_SEQUENCE) redirect('/pages/splash')
  // Only DB-backed custom funnels are editable here (a row in sequence_overrides).
  const override = await getSequenceOverride(slug)
  if (!override) notFound()

  // preview: load the funnel's real content even when it's an unpublished draft.
  const seq = await resolveSequence(slug, { preview: true })
  const inductionPath = `/onboarding/beta?seq=${slug}`

  return (
    <AdminPage
      title={`Edit funnel: ${seq.audience}`}
      eyebrow="Splash Funnels"
      description="Retitle the funnel and rewrite every voiced beat on the left; watch the real induction update on the right. Saving keeps the funnel's link, tag, and publish state; publish it from the funnels list to take it live."
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
            href={inductionPath}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:bg-surface-elevated hover:text-text"
          >
            <ExternalLink className="h-3.5 w-3.5" /> Preview
          </a>
        </div>
      }
    >
      <SplashCopyEditor
        slug={slug}
        initialAudience={seq.audience}
        initialVera={seq.vera}
        initialOaths={seq.oaths}
        heardAbout={seq.heardAbout}
        initialHasOverride={!!override}
      />
    </AdminPage>
  )
}
