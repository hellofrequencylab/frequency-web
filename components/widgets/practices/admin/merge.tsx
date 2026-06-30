import { listReviewQueue } from '@/lib/practices/clean'
import { buildMergePairs, type MergeCandidateInput } from '@/lib/practices/merge-pairs'
import { SectionHeader } from '@/components/ui/section-header'
import { PracticeMergePanel, type MergePairRow } from './merge-panel'

// Practice library, Phase 2 "Clean" merge suggestions (ADR-438, PRACTICE-LIBRARY §6 item 2.2).
//
// Self-fetching async RSC: reuses the review queue's already-computed near-duplicate signal
// (listReviewQueue's possibleDuplicateOf, one HNSW lookup per pending row, no NEW query here)
// and shapes it into ranked merge PAIRS (buildMergePairs, pure + tested). The per-row "find
// near-duplicates" button (practice-duplicates.tsx) still handles the one-at-a-time path on a
// single practice; this block surfaces the system's own duplicate detections as a curation-wide
// merge worklist, so an operator can clear obvious copies without opening each row.
//
// Returns null when there are no flagged duplicates, so "assigned but nothing to merge" costs the
// queue's existing read and renders nothing (the module contract; PAGE-FRAMEWORK §4.1). Read-only
// here; the merge mutation lives in the panel via the curator-gated mergePracticesAction. Built
// self-contained so it registers as a layout module (ADR-270/272) like the sibling Phase-2 blocks.
export async function PracticeMergeSuggestions() {
  // Reuse the queue read (its near-dup column is what we shape). The cap matches the queue's so we
  // never widen the bounded fan-out described in listReviewQueue's COST NOTE.
  const items = await listReviewQueue({ limit: 50 })

  const candidates: MergeCandidateInput[] = items.map((it) => ({
    id: it.id,
    title: it.title,
    possibleDuplicateOf: it.possibleDuplicateOf,
  }))
  const pairs = buildMergePairs(candidates)
  if (pairs.length === 0) return null

  const rows: MergePairRow[] = pairs.map((p) => ({
    duplicateId: p.duplicate.id,
    duplicateTitle: p.duplicate.title,
    canonicalId: p.canonical.id,
    canonicalTitle: p.canonical.title,
    similarity: p.similarity,
  }))

  return (
    <section className="space-y-3">
      <SectionHeader title="Merge duplicates" count={rows.length} />
      <PracticeMergePanel rows={rows} />
    </section>
  )
}
