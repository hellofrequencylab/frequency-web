import { notFound } from 'next/navigation'
import { getJanitor } from '@/lib/page-editor/guard'
import { BETA_SEQUENCES, getSequence } from '@/lib/onboarding/beta-sequences'
import { getSplashOverride } from '@/lib/onboarding/sequence-overrides'
import { FocusTemplate } from '@/components/templates'
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
    <FocusTemplate
      eyebrow="Pages"
      title={`Edit splash: ${seq.audience}`}
      description={
        <>
          Publishes to <code className="rounded bg-surface-elevated px-1 py-0.5 text-xs">/beta/{slug}</code> immediately.
          The voiced induction copy stays code-managed.
        </>
      }
      back={{ href: '/pages/sequences', label: 'Sequences' }}
      width="wide"
    >
      <SequenceSplashForm slug={slug} splash={splash} />
    </FocusTemplate>
  )
}
