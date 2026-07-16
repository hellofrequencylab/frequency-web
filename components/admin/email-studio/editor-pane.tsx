'use client'

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { EntityLayoutProvider, useProfileLayout } from '@/components/entity-blocks/profile-layout-context'
import { EntityPageBuilder, type BuilderRailData } from '@/components/entity-blocks/profile-page-builder'
import { resolveRows, type EntityLayout } from '@/lib/entity-blocks/layout'
import type { BuilderLayout } from '@/lib/entity-blocks/rows-ops'
import type { SaveLayout } from '@/components/entity-blocks/profile-layout-context'
import type { EmailColors } from '@/lib/email-studio/render'
import type { ActionResult } from '@/lib/action-result'
import { ComposeToolbar } from './compose-toolbar'
import { EmailContextBar } from './context-bar'
import { EmailPreview } from './preview'
import { EmailCanvasEditor } from './email-canvas-editor'
import { saveEmailCampaign, sendTestEmail, type LoadedEmailCampaign } from '@/app/(main)/admin/email-studio/actions'

/** The persist action shape the pane injects into the store + compose fields (matches saveEmailCampaign). */
type SaveCampaign = (
  id: string,
  patch: { layout?: BuilderLayout | EntityLayout; subject?: string; preheader?: string; fromName?: string },
) => Promise<{ error?: string }>

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
  colors,
}: {
  layout: EntityLayout
  subject: string
  preheader: string
  colors?: EmailColors
}) {
  const store = useProfileLayout()
  const working: EntityLayout = store?.seeded
    ? { rows: store.rows, hidden: store.hidden, content: store.content, style: store.style }
    : layout
  return <EmailPreview layout={working} subject={subject} preheader={preheader} colors={colors} />
}

export function EmailEditorPane({
  campaign,
  onSubjectChange,
  arrangement = 'stacked',
  sidebar,
  saveCampaign = saveEmailCampaign,
  sendTest = sendTestEmail,
  colors,
}: {
  campaign: LoadedEmailCampaign
  /** Bubble a subject edit up so the left rail card relabels live. */
  onSubjectChange?: (id: string, subject: string) => void
  /** The persist action (layout + subject/preheader). Defaults to the admin saveEmailCampaign; a per-Space
   *  editor injects its own space-scoped, brand-compiling save (saveSpaceEmailDraft). */
  saveCampaign?: SaveCampaign
  /** The test-send action, injected into the compose toolbar (defaults to the admin sendTestEmail). */
  sendTest?: (id: string) => Promise<ActionResult<{ to: string }>>
  /** Brand palette for the canvas + live preview (spaceEmailColors for a Space). Defaults to DAWN. */
  colors?: EmailColors
  /** 'stacked' (default): toolbar on top, canvas below, preview toggled beside it. 'trio': a full-width
   *  three-region layout — settings/controls LEFT, the block canvas CENTER, the live preview RIGHT. 'canvas'
   *  (prototype, flag-gated): the on-canvas WYSIWYG editor — block list + core settings LEFT, a live clickable
   *  email canvas RIGHT. All three share the SAME provider / seed / save / compile / preview / test-send. */
  arrangement?: 'stacked' | 'trio' | 'canvas'
  /** Extra controls rendered UNDER the compose fields in the LEFT column of the trio layout (e.g. the send /
   *  schedule panel). Ignored in the stacked layout. */
  sidebar?: ReactNode
}) {
  const { id } = campaign
  const [subject, setSubject] = useState(campaign.subject)
  const [preheader, setPreheader] = useState(campaign.preheader)
  const [fromName, setFromName] = useState(campaign.fromName ?? '')
  const [previewOpen, setPreviewOpen] = useState(false)

  // The arranger's injected persist: the store hands the freshest BuilderLayout here (debounced), and this
  // re-sanitizes + writes block_json server-side.
  const save = useCallback<SaveLayout>(
    (payload: BuilderLayout) => saveCampaign(id, { layout: payload }),
    [id, saveCampaign],
  )

  // Debounced subject / preheader save (separate from the layout store's own debounce).
  const fieldTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scheduleFieldSave = useCallback(
    (patch: { subject?: string; preheader?: string; fromName?: string }) => {
      if (fieldTimer.current) clearTimeout(fieldTimer.current)
      fieldTimer.current = setTimeout(() => {
        void saveCampaign(id, patch)
      }, SAVE_DEBOUNCE_MS)
    },
    [id, saveCampaign],
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
  const onFromName = useCallback(
    (value: string) => {
      setFromName(value)
      scheduleFieldSave({ fromName: value })
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

  // TRIO (Beta Campaign tab): the compose fields and the send / schedule panel sit as TWO COLUMNS across the
  // top; below them the editor runs full width with the block settings (the "Your page" canvas) on the LEFT
  // and the live inbox preview EXPANDED to fill the rest on the RIGHT. Reuses the SAME provider, seed, save,
  // compile/preview, merge tags, and test-send as the stacked layout; only the frame changes. The preview is
  // always on, so the compose toolbar hides its preview toggle.
  // CANVAS (prototype, flag-gated): the on-canvas WYSIWYG model. Reuses the SAME provider, seed, save,
  // compile, and (via the shared store) the live preview / test-send paths as the other arrangements; only the
  // editing surface changes. The compose fields sit on top; the send / schedule panel (sidebar) sits below.
  if (arrangement === 'canvas') {
    return (
      <EntityLayoutProvider kind="email" save={save}>
        <LayoutSeeder layout={campaign.layout} />
        <div className="space-y-4">
          {/* Ask #7: the context bar names the campaign/sequence, step, timing, audience, and status ABOVE the
              canvas, in every arrangement. Reads the server-resolved EmailEditorContext; never touches the
              canvas editor's rail-alignment or click-to-select. */}
          <EmailContextBar context={campaign.context} />
          <ComposeToolbar
            campaignId={id}
            subject={subject}
            preheader={preheader}
            fromName={fromName}
            onSubject={onSubject}
            onPreheader={onPreheader}
            onFromName={onFromName}
            previewOpen
            onTogglePreview={() => {}}
            showPreviewToggle={false}
            sendTest={sendTest}
          />
          <EmailCanvasEditor colors={colors} />
          {sidebar}
        </div>
      </EntityLayoutProvider>
    )
  }

  if (arrangement === 'trio') {
    return (
      <EntityLayoutProvider kind="email" save={save}>
        <LayoutSeeder layout={campaign.layout} />
        <div className="space-y-4">
          {/* Ask #7: the context bar names the campaign/sequence, step, timing, audience, and status ABOVE the
              canvas, in every arrangement. Reads the server-resolved EmailEditorContext; never touches the
              canvas editor's rail-alignment or click-to-select. */}
          <EmailContextBar context={campaign.context} />
          {/* TOP — the subject + preheader compose fields, FULL WIDTH above Your page and preview. */}
          <ComposeToolbar
            campaignId={id}
            subject={subject}
            preheader={preheader}
            fromName={fromName}
            onSubject={onSubject}
            onPreheader={onPreheader}
            onFromName={onFromName}
            previewOpen
            onTogglePreview={() => {}}
            showPreviewToggle={false}
            sendTest={sendTest}
          />
          {/* MIDDLE — the editor: a narrow Your page rail (~30%, min 220px) on the LEFT, the live preview
              taking the rest on the RIGHT. The preview auto-scales the fixed-width email to fit, so the whole
              email always shows with no scroll however wide this column ends up. */}
          <div className="grid gap-4 lg:grid-cols-[minmax(220px,30%)_minmax(0,1fr)]">
            <div className="min-w-0">
              <EntityPageBuilder pageId={id} kind="email" loadRailData={loadRailData} seed={seed} />
            </div>
            <div className="min-w-0">
              <LivePreview layout={campaign.layout} subject={subject} preheader={preheader} colors={colors} />
            </div>
          </div>
          {/* BOTTOM — the send / schedule panel, FULL WIDTH with all its controls in a row. */}
          {sidebar}
        </div>
      </EntityLayoutProvider>
    )
  }

  return (
    <EntityLayoutProvider kind="email" save={save}>
      <LayoutSeeder layout={campaign.layout} />
      <div className="space-y-4">
        <ComposeToolbar
          campaignId={id}
          subject={subject}
          preheader={preheader}
          fromName={fromName}
          onSubject={onSubject}
          onPreheader={onPreheader}
          onFromName={onFromName}
          previewOpen={previewOpen}
          onTogglePreview={() => setPreviewOpen((v) => !v)}
          sendTest={sendTest}
        />

        <div className={previewOpen ? 'grid gap-4 lg:grid-cols-2' : ''}>
          <div className="min-w-0">
            <EntityPageBuilder pageId={id} kind="email" loadRailData={loadRailData} seed={seed} />
          </div>
          {previewOpen && (
            <div className="min-w-0">
              <LivePreview layout={campaign.layout} subject={subject} preheader={preheader} colors={colors} />
            </div>
          )}
        </div>
      </div>
    </EntityLayoutProvider>
  )
}
