import { listAllTags } from '@/lib/practices/clean'
import { SectionHeader } from '@/components/ui/section-header'
import { TagGovernancePanel, type TagRow } from './tag-governance-panel'

// Practice library — Phase 2 "Clean" tag governance (ADR-438, PRACTICE-LIBRARY §6 item 2.4).
//
// Self-fetching async RSC: reads every tag (listAllTags, canonical first then by usage) and hands
// plain rows to a thin client panel that owns Promote-to-canonical and Merge-into. Returns null
// when there are no tags at all (the module contract; PAGE-FRAMEWORK §4.1). Read-only here; the
// mutations live in the panel via the curator-gated promoteTagAction / mergeTagsAction. Built
// self-contained so the block-area agent can register it as a layout module (ADR-270/272).

export async function PracticeTagGovernance() {
  const tags = await listAllTags()
  if (tags.length === 0) return null

  const rows: TagRow[] = tags.map((t) => ({
    id: t.id,
    label: t.label,
    isCanonical: t.is_canonical,
    usageCount: t.usageCount,
    source: t.source,
  }))

  // The merge targets are the canonical tags (fold a synonym into a canonical).
  const canonicalTargets = rows
    .filter((t) => t.isCanonical)
    .map((t) => ({ id: t.id, label: t.label }))

  return (
    <section className="space-y-3">
      <SectionHeader title="Tags" count={rows.length} />
      <TagGovernancePanel rows={rows} canonicalTargets={canonicalTargets} />
    </section>
  )
}
