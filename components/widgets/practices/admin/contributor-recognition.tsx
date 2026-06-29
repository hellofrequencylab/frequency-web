import Link from 'next/link'
import { Sparkles, ArrowRight } from 'lucide-react'
import { topRemixContributors } from '@/lib/practices/lineage'
import { createAdminClient } from '@/lib/supabase/admin'
import { SectionHeader } from '@/components/ui/section-header'

// Admin practices layout module (ADR-438 Phase 3 "Grow", PRACTICE-LIBRARY §6): contributor
// recognition. Self-fetching async RSC; reads topRemixContributors (the creators whose originals
// the community has remixed most), resolves their names, and renders a ranked list — the same
// grammar as the Leadership "People to celebrate" module (lead-recognition.tsx). Returns null when
// no contributor has originated a remixed practice yet, per the module contract.
const MAX_ITEMS = 10

export async function PracticeContributorRecognition() {
  const contributors = await topRemixContributors({ limit: MAX_ITEMS })
  if (contributors.length === 0) return null

  // Resolve creator ids → identity (display_name + handle for the profile link).
  const admin = createAdminClient()
  const ids = contributors.map((c) => c.creatorId)
  const { data: profileRows } = await admin
    .from('profiles')
    .select('id, display_name, handle')
    .in('id', ids)
  const byId = new Map(
    ((profileRows ?? []) as { id: string; display_name: string | null; handle: string | null }[]).map((r) => [
      r.id,
      r,
    ]),
  )

  const items = contributors
    .map((c) => {
      const p = byId.get(c.creatorId)
      if (!p) return null
      return {
        id: c.creatorId,
        name: p.display_name ?? (p.handle ? `@${p.handle}` : 'A member'),
        handle: p.handle,
        originated: c.originated,
        remixesReceived: c.remixesReceived,
      }
    })
    .filter((x): x is NonNullable<typeof x> => x != null)

  if (items.length === 0) return null

  return (
    <section>
      <SectionHeader title="Contributors to celebrate" count={items.length} />
      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
        {items.map((c, i) => {
          const inner = (
            <>
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-bg text-primary-strong">
                <Sparkles className="h-4 w-4" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-2xs font-semibold uppercase tracking-widest text-primary-strong">
                  #{i + 1} most remixed
                </span>
                <span className="mt-0.5 block text-sm leading-relaxed text-text">
                  <span className="font-semibold">{c.name}</span> wrote {c.originated}{' '}
                  {c.originated === 1 ? 'original' : 'originals'}, remixed{' '}
                  {c.remixesReceived} {c.remixesReceived === 1 ? 'time' : 'times'}.
                </span>
              </span>
              {c.handle && (
                <ArrowRight
                  className="mt-1 hidden h-4 w-4 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5 sm:block"
                  aria-hidden
                />
              )}
            </>
          )
          return (
            <li key={c.id}>
              {c.handle ? (
                <Link
                  href={`/people/${c.handle}`}
                  className="group flex items-start gap-4 px-5 py-4 transition-colors hover:bg-surface-elevated motion-reduce:transition-none"
                >
                  {inner}
                </Link>
              ) : (
                <div className="flex items-start gap-4 px-5 py-4">{inner}</div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
