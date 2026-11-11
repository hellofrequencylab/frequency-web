'use client'

// THE HISTORY SCRUBBER, LIVE (BLD-403, spec docs/EDITOR-NEXT.md#bld-403). The scrubber walks a page's stored
// versions (page_versions, PROG-E0); moving it previews one version's sections without touching the draft.
// Restore copies the whole version, or one section of it, into the draft held here (lib/builder/history-restore.ts).
// Publishing the draft is the normal versioned publish. "Make this the live page" is the pointer swap
// (revertPageToVersion): no document is copied and the draft is left alone.
//
// Mounted only by the staff-gated, EDITOR_CANVAS-gated /pages/canvas route, through a dynamic import.

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { HistoryScrubber } from './history-scrubber'
import { listPageHistory, previewPageVersion, publishPage, revertPageToVersion } from '@/app/(main)/edit/actions'
import { restoreSection, restoreWhole, sectionOutline, type SectionEntry } from '@/lib/builder/history-restore'
import type { EditorVersionSummary } from '@/lib/builder/version-history'
import type { PageVersionMeta } from '@/lib/page-editor/versions'
import type { Data } from '@/lib/page-editor/types'

export function versionSummaries(versions: readonly PageVersionMeta[]): EditorVersionSummary[] {
  return versions.map((v) => ({ id: v.id, createdAt: v.createdAt, author: v.note?.trim() || `Revision ${v.revision}` }))
}

const STATE_LABEL: Record<SectionEntry['state'], string> = {
  same: 'Same as your draft',
  changed: 'Changed since',
  missing: 'Not in your draft',
}

export function HistoryPanel({ slug, title, spaceId, initialVersions, initialDraft }: {
  slug: string
  title: string
  spaceId?: string
  initialVersions: PageVersionMeta[]
  initialDraft: Data
}) {
  const [versions, setVersions] = useState(() => versionSummaries(initialVersions))
  // The newest version (listed first) is the one previewed on arrival.
  const newest = initialVersions[0]?.id ?? null
  const [selectedId, setSelectedId] = useState<string | null>(newest)
  const [preview, setPreview] = useState<{ id: string; doc: Data | null } | null>(null)
  const [draft, setDraft] = useState<Data>(initialDraft)
  const [dirty, setDirty] = useState(false)
  const [message, setMessage] = useState('')
  const [pending, startTransition] = useTransition()
  // Versions are immutable, so a document read once is kept for this visit. Only the newest request lands.
  const docs = useRef(new Map<string, Data | null>())
  const wanted = useRef<string | null>(newest)

  const fetchDoc = useCallback((id: string) => {
    void previewPageVersion(slug, id, spaceId)
      .then((doc) => {
        docs.current.set(id, doc)
        if (wanted.current === id) setPreview({ id, doc })
      })
      .catch(() => setMessage('That version could not be loaded. Try again.'))
  }, [slug, spaceId])

  const load = useCallback((id: string) => {
    wanted.current = id
    setSelectedId(id)
    const cached = docs.current.get(id)
    if (cached !== undefined) setPreview({ id, doc: cached })
    else fetchDoc(id)
  }, [fetchDoc])

  useEffect(() => { if (newest) fetchDoc(newest) }, [fetchDoc, newest])

  const shown = preview && preview.id === selectedId ? preview.doc : null
  const outline = shown ? sectionOutline(shown, draft) : []

  const takeWhole = () => {
    const doc = restoreWhole(shown)
    if (!doc || !('content' in doc)) return
    setDraft(doc)
    setDirty(true)
    setMessage('Your draft now matches this version. Publish to make it live.')
  }

  const takeSection = (entry: SectionEntry) => {
    const r = restoreSection(draft, shown, entry.id)
    if (!r.ok || !('content' in r.doc)) { setMessage('That section could not be restored.'); return }
    setDraft(r.doc)
    setDirty(true)
    setMessage(`${entry.label} is back in your draft.`)
  }

  const publish = () => startTransition(async () => {
    try {
      await publishPage(slug, draft, spaceId)
      const next = await listPageHistory(slug, spaceId)
      setVersions(versionSummaries(next))
      if (next[0]) load(next[0].id)
      setDirty(false)
      setMessage('Published. Your draft is the newest version.')
    } catch {
      setMessage('Publish did not go through. Your draft is still here.')
    }
  })

  const makeLive = () => {
    if (!selectedId) return
    startTransition(async () => {
      try {
        await revertPageToVersion(slug, selectedId, spaceId)
        setMessage('The live page now shows this version. Your draft is unchanged.')
      } catch {
        setMessage('The live page did not change. Try again.')
      }
    })
  }

  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      <div className="min-w-0 space-y-3">
        <HistoryScrubber versions={versions} selectedId={selectedId} onPreview={load} onRestore={shown ? takeWhole : undefined} />
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" disabled={!shown || pending} onClick={makeLive}>Make this the live page</Button>
          <Button type="button" disabled={!dirty || pending} loading={pending} onClick={publish}>Publish draft</Button>
        </div>
        <p role="status" className="text-body-sm text-muted">
          {message || (dirty ? 'Your draft has restored changes that are not live yet.' : `Editing ${title}. Your draft matches what you opened.`)}
        </p>
      </div>
      <section aria-label="Version preview" className="min-w-0 rounded-card border border-border bg-surface p-4">
        <h2 className="text-lead font-semibold">Preview</h2>
        {!selectedId ? (
          <p className="text-body-sm text-muted">Publish this page once to start its history.</p>
        ) : !preview || preview.id !== selectedId ? (
          <p role="status" className="text-body-sm text-muted">Loading this version…</p>
        ) : !shown ? (
          <p className="text-body-sm text-muted">This version has no readable document.</p>
        ) : (
          <ol className="mt-3 space-y-2">
            {outline.map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-border p-3">
                <span className="min-w-0">
                  <span className="block truncate text-body font-semibold">{entry.label}</span>
                  <span className="text-meta text-muted">{entry.type} · {STATE_LABEL[entry.state]}</span>
                </span>
                <Button type="button" variant="ghost" size="sm" disabled={entry.state === 'same'} onClick={() => takeSection(entry)}>
                  Restore this section
                </Button>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  )
}
