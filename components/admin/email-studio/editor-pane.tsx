'use client'

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { EntityLayoutProvider, useProfileLayout } from '@/components/entity-blocks/profile-layout-context'
import { EntityPageBuilder, type BuilderRailData } from '@/components/entity-blocks/profile-page-builder'
import { resolveRows, type EntityLayout } from '@/lib/entity-blocks/layout'
import type { BuilderLayout } from '@/lib/entity-blocks/rows-ops'
import type { SaveLayout } from '@/components/entity-blocks/profile-layout-context'
import { ComposeToolbar } from './compose-toolbar'
import { EmailPreview } from './preview'
import { saveEmailCampaign, type LoadedEmailCampaign } from '@/app/(main)/admin/email-studio/actions'

// EMAIL EDITOR PANE. The right pane's editor for ONE selected email. It REUSES the entity-blocks arranger
// UNCHANGED: it mounts the shared EntityLayoutProvider with kind 'email' and an injected `save` that persists
// to the campaign's block_json (the store owns the debounce), then renders the same EntityPageBuilder the
// Space page uses. Email is single-column (maxColumnsForKind('email') === 1), so the builder renders its
// block-LIST shape. Above the blocks sit the subject + preheader fields and the merge-tag / test-send /
// preview controls; a live preview compiles the working doc in-browser.
//
// This whole subtree is KEYED by campaign id upstream (in the workspace), so switching emails remounts the
// provider: the old store flushes its pending save, the new one seeds fresh. No em dashes (voice canon).

/** Run BEFORE the browser paints AND before the builder's passive-effect seed, so the store is seeded with
 *  the full layout (rows + hidden + content + style) first. On the server it is a no-op (effects never run
 *  there), so it degrades to a plain effect and avoids the SSR warning. */
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

const SAVE_DEBOUNCE_MS = 600

/** Seeds the shared store from the loaded layout the INSTANT the pane mounts (layout effect → wins the
 *  store's first-seed race), so authored content + style are present before the arranger paints. */
function LayoutSeeder({ layout }: { layout: EntityLayout }) {
  const store = useProfileLayout()
  useIsoLayoutEffect(() => {
    if (!store || store.seeded) return
    const rows = layout.rows ?? resolveRows(layout, 'email')
    store.seed(rows, layout.hidden ?? [], layout.content ?? {}, layout.style ?? {})
  }, [store, layout])
  return null
}

/** The live preview, reading the WORKING layout off the shared store so it repaints as the operator edits.
 *  Falls back to the seed layout until the store is seeded. */
function LivePreview({
  layout,
  subject,
  preheader,
}: {
  layout: EntityLayout
  subject: string
  preheader: string
}) {
  const store = useProfileLayout()
  const working: EntityLayout = store?.seeded
    ? { rows: store.rows, hidden: store.hidden, content: store.content, style: store.style }
    : layout
  return <EmailPreview layout={working} subject={subject} preheader={preheader} />
}

export function EmailEditorPane({
  campaign,
  onSubjectChange,
}: {
  campaign: LoadedEmailCampaign
  /** Bubble a subject edit up so the left rail card relabels live. */
  onSubjectChange?: (id: string, subject: string) => void
}) {
  const { id } = campaign
  const [subject, setSubject] = useState(campaign.subject)
  const [preheader, setPreheader] = useState(campaign.preheader)
  const [previewOpen, setPreviewOpen] = useState(false)

  // The arranger's injected persist: the store hands the freshest BuilderLayout here (debounced), and this
  // re-sanitizes + writes block_json server-side.
  const save = useCallback<SaveLayout>(
    (payload: BuilderLayout) => saveEmailCampaign(id, { layout: payload }),
    [id],
  )

  // Debounced subject / preheader save (separate from the layout store's own debounce).
  const fieldTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scheduleFieldSave = useCallback(
    (patch: { subject?: string; preheader?: string }) => {
      if (fieldTimer.current) clearTimeout(fieldTimer.current)
      fieldTimer.current = setTimeout(() => {
        void saveEmailCampaign(id, patch)
      }, SAVE_DEBOUNCE_MS)
    },
    [id],
  )
  useEffect(() => () => {
    if (fieldTimer.current) clearTimeout(fieldTimer.current)
  }, [])

  const onSubject = useCallback(
    (value: string) => {
      setSubject(value)
      onSubjectChange?.(id, value)
      scheduleFieldSave({ subject: value })
    },
    [id, onSubjectChange, scheduleFieldSave],
  )
  const onPreheader = useCallback(
    (value: string) => {
      setPreheader(value)
      scheduleFieldSave({ preheader: value })
    },
    [scheduleFieldSave],
  )

  // The pre-fetched seed for the builder (skips its own rail fetch): matches this campaign so the owner/kind
  // gate opens. Rows/hidden come straight off the loaded layout; the LayoutSeeder above carries content/style.
  const seed = useMemo<BuilderRailData>(
    () => ({
      matchId: id,
      rows: campaign.layout.rows ?? resolveRows(campaign.layout, 'email'),
      hidden: campaign.layout.hidden ?? [],
      customized: true,
    }),
    [id, campaign.layout],
  )
  const loadRailData = useCallback(async (): Promise<BuilderRailData | null> => seed, [seed])

  return (
    <EntityLayoutProvider kind="email" save={save}>
      <LayoutSeeder layout={campaign.layout} />
      <div className="space-y-4">
        <ComposeToolbar
          campaignId={id}
          subject={subject}
          preheader={preheader}
          onSubject={onSubject}
          onPreheader={onPreheader}
          previewOpen={previewOpen}
          onTogglePreview={() => setPreviewOpen((v) => !v)}
        />

        <div className={previewOpen ? 'grid gap-4 lg:grid-cols-2' : ''}>
          <div className="min-w-0">
            <EntityPageBuilder pageId={id} kind="email" loadRailData={loadRailData} seed={seed} />
          </div>
          {previewOpen && (
            <div className="min-w-0">
              <LivePreview layout={campaign.layout} subject={subject} preheader={preheader} />
            </div>
          )}
        </div>
      </div>
    </EntityLayoutProvider>
  )
}
