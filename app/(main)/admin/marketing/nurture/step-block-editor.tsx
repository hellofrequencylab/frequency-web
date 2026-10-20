'use client'

// STEP BLOCK EDITOR (Email Studio Phase 5). Lets an operator compose a nurture step's email body in the SAME
// block arranger an Email Studio campaign uses. It REUSES the entity-blocks arranger UNCHANGED: it mounts the
// shared EntityLayoutProvider with kind 'email' and an injected `save` that persists to the step's
// nurture_steps.block_json (the store owns the debounce), then renders the same EntityPageBuilder the Email
// Studio editor and the Space page use. Email is single-column, so the builder renders its block-LIST shape.
// A live preview reuses the Email Studio preview.tsx, compiling the working doc in-browser. This mount mirrors
// components/admin/email-studio/editor-pane.tsx (EmailEditorPane), whose `save` is hardwired to the campaigns
// table, so we replicate the ~15-line mount here with the nurture step's save instead. No em dashes (voice canon).

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react'
import {
  EntityLayoutProvider,
  useProfileLayout,
  type SaveLayout,
} from '@/components/entity-blocks/profile-layout-context'
import { EntityPageBuilder, type BuilderRailData } from '@/components/entity-blocks/profile-page-builder'
import { resolveRows, type EntityLayout } from '@/lib/entity-blocks/layout'
import type { BuilderLayout } from '@/lib/entity-blocks/rows-ops'
import { EmailPreview } from '@/components/admin/email-studio/preview'
import { NodeLayoutProvider, useNodeLayout } from '@/components/entity-blocks/node-layout-store'
import { NodeEmailCanvasEditor } from '@/components/admin/email-studio/email-canvas-editor'
import { NodeSeeder } from '@/components/admin/email-studio/email-canvas-model'
import type { NodeLayout } from '@/lib/entity-blocks/node-tree'
import { updateStepBlockJson } from './actions'

/** Run BEFORE the browser paints AND before the builder's passive-effect seed, so the store carries the full
 *  layout (rows + hidden + content + style) first. On the server it is a no-op, degrading to a plain effect. */
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

/** Seeds the shared store from the loaded layout the instant the pane mounts (layout effect wins the store's
 *  first-seed race), so authored content + style are present before the arranger paints. */
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
 *  Falls back to the seed layout until the store is seeded. Preheader is empty (nurture steps carry none). */
function LivePreview({ layout, subject }: { layout: EntityLayout; subject: string }) {
  const store = useProfileLayout()
  const working: EntityLayout = store?.seeded
    ? { rows: store.rows, hidden: store.hidden, content: store.content, style: store.style }
    : layout
  return <EmailPreview layout={working} subject={subject} preheader="" />
}

/** The node twin of the live preview: reads the working node document off the node store. */
function NodeLivePreview({ layout, subject }: { layout: NodeLayout; subject: string }) {
  const store = useNodeLayout()
  return <EmailPreview layout={store?.layout ?? layout} subject={subject} preheader="" />
}

/** The step designer on the node store (render_path_email): the same canvas editor an Email Studio campaign
 *  uses, so a block type can repeat. Saves the node document through the step's own writer. */
function NodeStepBlockEditor({ stepId, subject, nodeLayout }: { stepId: string; subject: string; nodeLayout: NodeLayout }) {
  const [previewOpen, setPreviewOpen] = useState(false)
  const save = useCallback((payload: NodeLayout) => updateStepBlockJson(stepId, payload), [stepId])
  return (
    <NodeLayoutProvider save={save}>
      <NodeSeeder layout={nodeLayout} />
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="eyebrow text-muted">Email design</p>
          <button
            type="button"
            onClick={() => setPreviewOpen((v) => !v)}
            className="rounded-control border border-border px-2 py-1 text-2xs font-semibold text-muted transition-colors hover:text-text"
            aria-pressed={previewOpen}
          >
            {previewOpen ? 'Hide preview' : 'Preview'}
          </button>
        </div>
        <div className={previewOpen ? 'grid gap-4 lg:grid-cols-2' : ''}>
          <div className="min-w-0">
            <NodeEmailCanvasEditor />
          </div>
          {previewOpen && (
            <div className="min-w-0">
              <NodeLivePreview layout={nodeLayout} subject={subject} />
            </div>
          )}
        </div>
      </div>
    </NodeLayoutProvider>
  )
}

export function StepBlockEditor({
  stepId,
  subject,
  initialLayout,
  nodeLayout,
}: {
  /** The step's body as a node document, present only while render_path_email is on. */
  nodeLayout?: NodeLayout
  stepId: string
  /** The step's subject, shown in the preview's inbox header (edited separately in the step form). */
  subject: string
  /** The step's persisted body layout (its block_json, or a basic email starter when never designed). */
  initialLayout: EntityLayout
}) {
  if (nodeLayout) return <NodeStepBlockEditor stepId={stepId} subject={subject} nodeLayout={nodeLayout} />
  return <LegacyStepBlockEditor stepId={stepId} subject={subject} initialLayout={initialLayout} />
}

function LegacyStepBlockEditor({ stepId, subject, initialLayout }: { stepId: string; subject: string; initialLayout: EntityLayout }) {
  const [previewOpen, setPreviewOpen] = useState(false)

  // The arranger's injected persist: the store hands the freshest BuilderLayout here (debounced), and this
  // re-sanitizes + writes nurture_steps.block_json server-side. Returns { error? } as the store expects.
  const save = useCallback<SaveLayout>(
    (payload: BuilderLayout) => updateStepBlockJson(stepId, payload),
    [stepId],
  )

  // The pre-fetched seed for the builder (skips its own rail fetch); matches this step so the kind gate opens.
  const seed = useMemo<BuilderRailData>(
    () => ({
      matchId: stepId,
      rows: initialLayout.rows ?? resolveRows(initialLayout, 'email'),
      hidden: initialLayout.hidden ?? [],
      customized: true,
    }),
    [stepId, initialLayout],
  )
  const loadRailData = useCallback(async (): Promise<BuilderRailData | null> => seed, [seed])

  return (
    <EntityLayoutProvider kind="email" save={save}>
      <LayoutSeeder layout={initialLayout} />
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="eyebrow text-muted">Email design</p>
          <button
            type="button"
            onClick={() => setPreviewOpen((v) => !v)}
            className="rounded-control border border-border px-2 py-1 text-2xs font-semibold text-muted transition-colors hover:text-text"
            aria-pressed={previewOpen}
          >
            {previewOpen ? 'Hide preview' : 'Preview'}
          </button>
        </div>

        <div className={previewOpen ? 'grid gap-4 lg:grid-cols-2' : ''}>
          <div className="min-w-0">
            <EntityPageBuilder pageId={stepId} kind="email" loadRailData={loadRailData} seed={seed} />
          </div>
          {previewOpen && (
            <div className="min-w-0">
              <LivePreview layout={initialLayout} subject={subject} />
            </div>
          )}
        </div>
      </div>
    </EntityLayoutProvider>
  )
}
