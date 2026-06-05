'use client'

// Campaign detail client (ADR-126, Phase 2): rename/archive the campaign + an
// in-place "add entry point" that reuses the Phase 1 EntryForm (filing under this
// campaign), and the Phase 1 EntryRow for each entry point.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Pencil, Archive, ArrowLeft } from 'lucide-react'
import { listEntryTemplates, type EntryTemplate } from '@/lib/entry-points/templates'
import type { DestinationGroup } from '@/lib/entry-points/destinations'
import {
  EntryForm,
  EntryRow,
  type EntryCard,
} from '@/app/(main)/entry-points/entry-points-client'
import { updateCampaign, archiveCampaign } from '../actions'
import type { CampaignStatus } from '@/lib/entry-points/campaigns'

export function CampaignDetail({
  campaign,
  cards,
  destinationGroups,
}: {
  campaign: { id: string; name: string; status: CampaignStatus }
  cards: EntryCard[]
  destinationGroups: DestinationGroup[]
}) {
  const router = useRouter()
  const [adding, setAdding] = useState(false)
  const [template, setTemplate] = useState<EntryTemplate | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(campaign.name)
  const [pending, start] = useTransition()

  function closeAdd() {
    setAdding(false)
    setTemplate(null)
  }

  function saveName() {
    start(async () => {
      await updateCampaign(campaign.id, { name })
      setRenaming(false)
      router.refresh()
    })
  }

  function archive() {
    if (!confirm('Archive this campaign? Its entry points keep working.')) return
    start(async () => {
      await archiveCampaign(campaign.id)
      router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      {/* Campaign controls. */}
      <section className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-surface p-4 shadow-sm">
        {renaming ? (
          <>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-md border border-border bg-canvas px-2.5 py-1.5 text-sm text-text"
            />
            <button
              onClick={saveName}
              disabled={pending}
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary hover:bg-primary-hover disabled:opacity-60"
            >
              Save
            </button>
            <button onClick={() => { setRenaming(false); setName(campaign.name) }} className="px-2 py-1.5 text-xs font-semibold text-muted hover:text-text">
              Cancel
            </button>
          </>
        ) : (
          <>
            <button onClick={() => setRenaming(true)} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted transition-colors hover:text-text">
              <Pencil className="h-3 w-3" /> Rename
            </button>
            {campaign.status !== 'archived' && (
              <button onClick={archive} disabled={pending} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted transition-colors hover:text-danger disabled:opacity-60">
                <Archive className="h-3 w-3" /> Archive
              </button>
            )}
            <button
              onClick={() => setAdding(true)}
              className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary transition-colors hover:bg-primary-hover"
            >
              <Plus className="h-3.5 w-3.5" /> Add entry point
            </button>
          </>
        )}
      </section>

      {/* Add an entry point under this campaign. */}
      {adding && (
        <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
          {!template ? (
            <div>
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-text">Pick a template</p>
                <button onClick={closeAdd} className="text-xs font-medium text-muted hover:text-text">Cancel</button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {listEntryTemplates().map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setTemplate(t)}
                    className="flex items-start gap-3 rounded-2xl border border-border bg-canvas/40 px-4 py-3 text-left transition-colors hover:border-primary/40"
                  >
                    <span className="text-2xl leading-none" aria-hidden>{t.emoji}</span>
                    <span>
                      <span className="block text-sm font-bold text-text">{t.label}</span>
                      <span className="mt-0.5 block text-xs text-muted">{t.blurb}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <button onClick={() => setTemplate(null)} className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-text">
                <ArrowLeft className="h-3 w-3" /> {template.label} · change
              </button>
              <EntryForm
                template={template}
                destinationGroups={destinationGroups}
                campaignId={campaign.id}
                onDone={() => { closeAdd(); router.refresh() }}
              />
            </div>
          )}
        </section>
      )}

      {/* Entry points in this campaign. */}
      <section className="space-y-3">
        {cards.length === 0 && !adding && (
          <p className="rounded-2xl border border-dashed border-border bg-surface px-4 py-8 text-center text-sm text-muted">
            No entry points in this campaign yet. Add one above.
          </p>
        )}
        {cards.map((card) => (
          <EntryRow key={card.id} card={card} destinationGroups={destinationGroups} />
        ))}
      </section>
    </div>
  )
}
