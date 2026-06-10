import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminPage } from '@/components/admin/admin-page'
import { resolveSequence } from '@/lib/onboarding/resolve-sequence'
import { listSequences } from '@/lib/onboarding/beta-sequences'
import { SequenceWizard } from '@/components/sequences/sequence-wizard'

export const dynamic = 'force-dynamic'

// The full-induction builder (ADR-162) — a guided beat-by-beat wizard over the real
// /onboarding/beta flow, with an in-page preview of each beat.
export default async function BuildSequencePage({ params }: { params: Promise<{ slug: string }> }) {
  await requireAdmin('janitor')
  const { slug } = await params
  const sequence = await resolveSequence(slug)
  const isCustom = !listSequences().some((s) => s.slug === slug)

  return (
    <AdminPage
      title={`Build induction: ${sequence.audience}`}
      eyebrow="Pages · Sequences"
      description="One screen per beat of the real /onboarding/beta induction. Edit the copy, watch the preview, then save & publish. It goes live at its own link."
      width="wide"
      actions={
        <Link href="/pages/sequences" className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:bg-surface-elevated hover:text-text">
          <ArrowLeft className="h-3.5 w-3.5" /> All sequences
        </Link>
      }
    >
      <SequenceWizard slug={slug} initial={sequence} isCustom={isCustom} />
    </AdminPage>
  )
}
