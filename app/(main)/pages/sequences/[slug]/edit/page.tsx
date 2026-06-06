import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getJanitor } from '@/lib/page-editor/guard'
import { BETA_SEQUENCES, getSequence } from '@/lib/onboarding/beta-sequences'
import { getSplashOverride } from '@/lib/onboarding/sequence-overrides'
import { SequenceSplashForm } from './form'

export const dynamic = 'force-dynamic'

// Edit an onboarding sequence's splash copy (build §9.1). Overrides merge over the
// code default and publish to /beta/<slug> immediately. Janitor-only.
export default async function EditSequencePage({ params }: { params: Promise<{ slug: string }> }) {
  if (!(await getJanitor())) notFound()
  const { slug } = await params
  if (!BETA_SEQUENCES[slug]) notFound()

  const seq = getSequence(slug)
  const splash = { ...seq.splash, ...(await getSplashOverride(slug)) }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6">
      <Link href="/pages/sequences" className="inline-flex items-center gap-1.5 text-xs font-semibold text-subtle hover:text-text">
        <ArrowLeft className="h-3.5 w-3.5" /> Sequences
      </Link>
      <h1 className="mt-3 text-2xl font-bold tracking-tight text-text">Edit splash — {seq.audience}</h1>
      <p className="mt-1 text-sm text-muted">
        Publishes to <code className="rounded bg-surface-elevated px-1 py-0.5 text-xs">/beta/{slug}</code> immediately.
        The voiced induction copy stays code-managed.
      </p>
      <div className="mt-5">
        <SequenceSplashForm slug={slug} splash={splash} />
      </div>
    </div>
  )
}
