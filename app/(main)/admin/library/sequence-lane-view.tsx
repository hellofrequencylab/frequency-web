import Link from 'next/link'
import { Route, ChevronRight } from 'lucide-react'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { getRootSpaceId, searchLibraryAssets, getLibraryAsset } from '@/lib/library/store'
import { listVersions } from '@/lib/library/versions'
import { parseSequenceDef } from '@/lib/onboarding/sequence-schema'
import { DEFAULT_ONBOARDING_SEQUENCE } from '@/lib/onboarding/default-sequence'
import { PERSONAS, isPersonaId } from '@/lib/onboarding/personas'
import { SequenceEditor, NewSequenceButton } from './sequence-editor'

// The Loom Studio "Onboarding flows" lane (docs/LOOM-PLATFORM.md §3). Rendered when ?lane=sequence.
// A Server Component: it lists the managed onboarding flows (library_assets kind='sequence') and, with
// ?edit=<id>, mounts the client editor for one. Staff-gated by the page (requireAdmin) that mounts it.
//
// This is the CREATE / EDIT / PUBLISH / VERSION surface for the sequence read side that was already
// built and dormant (the resolver + runner + staff preview). It edits ONLY the SequenceDef config
// (Layer-2 data); it is NOT a Puck editor and never serves live members directly — a flow starts as a
// draft and only serves once published to the resolver's live rungs.

const LIVE = new Set(['approved', 'final'])

/** A short "who sees it" summary for a flow's target. */
function targetSummary(target: { personas?: string[]; regionIds?: string[] } | undefined): string {
  if (!target || (!target.personas?.length && !target.regionIds?.length)) return 'Everyone'
  const parts: string[] = []
  if (target.personas?.length) {
    parts.push(target.personas.map((p) => (isPersonaId(p) ? PERSONAS[p].label : p)).join(', '))
  }
  if (target.regionIds?.length) {
    parts.push(`${target.regionIds.length} region${target.regionIds.length === 1 ? '' : 's'}`)
  }
  return parts.join(' · ')
}

export async function SequenceLaneView({ q = '', editId = '' }: { q?: string; editId?: string }) {
  const spaceId = await getRootSpaceId()

  // Editor mode: one flow + its version history.
  if (editId && spaceId) {
    const asset = await getLibraryAsset(spaceId, editId)
    if (asset && asset.kind === 'sequence') {
      const def = parseSequenceDef(asset.config) ?? { ...DEFAULT_ONBOARDING_SEQUENCE, key: asset.slug, label: asset.title }
      const versions = await listVersions(editId)
      return <SequenceEditor id={asset.id} status={asset.status} def={def} versions={versions} />
    }
  }

  // List mode.
  const page = spaceId
    ? await searchLibraryAssets({ spaceId, kind: 'sequence', q, pageSize: 100 })
    : { items: [], total: 0 }

  return (
    <AdminTemplate
      title="Loom Studio"
      icon={Route}
      eyebrow="Onboarding flows"
      description="Managed onboarding flows: the ordered steps a new member walks. Publish one to serve it to matching members; the resolver always falls back to the code default when nothing is published."
      actions={<NewSequenceButton />}
      actionsAlign="end"
      width="wide"
    >
      <AdminSection>
        <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex items-baseline gap-2">
            <h2 className="font-display text-lg uppercase text-text">Flows</h2>
            <span className="text-sm text-subtle">
              {page.total} flow{page.total === 1 ? '' : 's'}
            </span>
          </div>
          <form className="flex flex-1 items-center justify-end gap-2" action="/admin/library" method="get">
            <input type="hidden" name="lane" value="sequence" />
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Search flows…"
              className="min-w-[180px] flex-1 rounded-2xl border border-border bg-surface px-3 py-2 text-sm sm:max-w-xs sm:flex-none"
            />
            <button type="submit" className="rounded-2xl border border-border-strong px-4 py-2 text-sm font-semibold text-text hover:bg-surface-elevated">
              Apply
            </button>
          </form>
        </div>

        {page.items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border-strong px-6 py-16 text-center">
            <Route className="mx-auto mb-3 h-8 w-8 text-subtle" aria-hidden />
            <p className="text-base text-muted">{q ? 'No flows match.' : 'No managed onboarding flows yet.'}</p>
            <p className="mt-1 text-sm text-subtle">
              {q ? 'Try clearing the search.' : 'New members follow the code default until you publish a flow. Create one to override it.'}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border">
            {page.items.map((item) => {
              const def = parseSequenceDef(item.config)
              const steps = def?.steps.length ?? 0
              const summary = targetSummary(def?.target)
              const live = LIVE.has(item.status)
              return (
                <li key={item.id}>
                  <Link
                    href={`/admin/library?lane=sequence&edit=${item.id}`}
                    className="flex items-center gap-4 px-4 py-4 hover:bg-surface-elevated"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-semibold text-text">{item.title || 'Untitled flow'}</span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            live ? 'bg-primary text-on-primary' : 'border border-border text-muted'
                          }`}
                        >
                          {item.status}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-subtle">
                        {steps} step{steps === 1 ? '' : 's'} · {summary}
                      </p>
                    </div>
                    <ChevronRight className="h-5 w-5 shrink-0 text-subtle" aria-hidden />
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </AdminSection>
    </AdminTemplate>
  )
}
