'use server'

// THE CANVAS'S ONE DRAFT WRITE (PROG-E5B, dark). The inspector on /pages/canvas saves one node's fields here:
// desktop content and the sparse tablet and phone overrides. It writes the Space page's DRAFT only
// (spaces.preferences.profileLayoutDraft). Nothing here publishes; going live stays the Space's own Publish.
//
// The door, in order: the EDITOR_CANVAS switch, the staff role the route asks for, then the Space page builder's
// own rule (resolveSpaceManageAccess: a manager of the Space, never a read-only staff preview) and the node render
// path for Space pages. The client names a Space, a node and values; the server decides which keys that node's
// block contract lets the inspector write, and re-reads the stored document before it plans anything.
//
// A stale tab cannot overwrite a newer draft: the save carries the base it loaded (a revision counter and a
// document fingerprint, lib/builder/canvas-document.ts). The fingerprint is checked against the fresh read; the
// counter is compared again inside the single UPDATE that writes.
//
// THE WRITE (PROG-E5 item 1): writeSpacePreferencesAtRevision, given the draft and the actor, saves through
// save_space_profile_draft (lib/spaces/profile-draft-write.ts), which sets only the draft key and moves the counter
// after its own manage-access check, so another preferences key saved meanwhile is kept and a Space page builder
// save (which moves the same counter) makes this tab stale in the write itself. Until that function is applied,
// or if the call fails, the old guarded whole-blob write runs.

import { revalidatePath } from 'next/cache'
import { envFlag } from '@/lib/env/string'
import { getJanitor } from '@/lib/page-editor/guard'
import { parseInput, z } from '@/lib/validation'
import { getNode } from '@/lib/entity-blocks/node-ops'
import { NODE_ID_RE } from '@/lib/entity-blocks/node-tree'
import { writeSpacePreferencesAtRevision } from '@/lib/spaces/store'
import { CANVAS_REVISION_KEY, canvasStoredNode, planCanvasDraftWrite, readCanvasDocument, type CanvasDocChange, type CanvasDocumentView, type CanvasDraftBase, type CanvasNodeView } from '@/lib/builder/canvas-document'
import { canvasDocumentParts, resolveCanvasAccess } from '@/lib/builder/canvas-document-load'
import { canvasInspectorFor } from '@/lib/builder/canvas-inspector'
import { resolveCanvasInsert } from '@/lib/builder/canvas-presets'
import { canvasLiveBlockIds } from '@/lib/builder/canvas-live-blocks'

const bag = z.record(z.string().max(60), z.union([z.string().max(20_000), z.boolean()])).refine((o) => Object.keys(o).length <= 60, 'Too many fields')
// A change to the page's structure (PROG-E6B). Every part is a fixed word or a bounded number: a spacing step is
// one of the document's own named steps, never a length, and an insert is an id this server resolves.
const rowId = z.string().regex(/^r[0-9a-z]{1,40}$/i)
const slot = z.object({ rowId, col: z.number().int().min(0).max(3), index: z.number().int().min(0).max(48) })
// PROG-E6C: a copy, hide or show, a removal (kept on the bench, or for good when it undoes an add) and a put-back.
// None of them carries a block's content: a copy is made from what is stored.
const change = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('move'), to: slot }),
  z.object({ kind: z.literal('duplicate') }),
  z.object({ kind: z.literal('hide'), hidden: z.boolean() }),
  z.object({ kind: z.literal('remove'), keep: z.boolean() }),
  z.object({ kind: z.literal('restore'), to: slot }),
  z.object({ kind: z.literal('spacing'), edge: z.enum(['mt', 'pad', 'mb']), step: z.enum(['none', 'default', 'sm', 'md', 'lg', 'xl']) }),
  z.object({ kind: z.literal('insert'), source: z.enum(['preset', 'blank', 'live']), id: z.string().regex(/^[a-z][a-z0-9-]{0,40}$/i) }),
  // PROG-E6D: rows. An index, a row id, one step up or down, and a split by its fixed name.
  z.object({ kind: z.literal('row-add'), at: z.number().int().min(0).max(24) }),
  z.object({ kind: z.literal('row-remove'), rowId }),
  z.object({ kind: z.literal('row-move'), rowId, by: z.union([z.literal(-1), z.literal(1)]) }),
  z.object({ kind: z.literal('row-split'), rowId, split: z.enum(['full', 'even', 'lead', 'sidebar']) }),
])
const saveInput = z.object({
  spaceId: z.string().regex(/^[0-9a-f-]{8,64}$/i),
  nid: z.string().regex(NODE_ID_RE),
  base: z.object({ revision: z.number().int().min(0), fingerprint: z.string().min(1).max(64) }),
  values: z.object({ desktop: bag.optional(), tablet: bag.optional(), phone: bag.optional() }),
  change: change.optional(),
})

export type CanvasSaveResult =
  | { ok: true; base: CanvasDraftBase; node: CanvasNodeView['node']; view?: Pick<CanvasDocumentView, 'layers' | 'tree' | 'nodes' | 'inserter'> }
  | { ok: false; conflict: boolean; error: string }

const refuse = (error: string, conflict = false): CanvasSaveResult => ({ ok: false, conflict, error })
// Why a change the page cannot take was refused, by kind. The draft is never changed to make room.
const REFUSED: Partial<Record<CanvasDocChange['kind'], string>> = {
  move: 'That block cannot go there. The draft was left as it was.',
  insert: 'This page cannot take one more of that block here.',
  duplicate: 'This page cannot take another copy of that block here.',
  remove: 'A page keeps at least one block, and removed blocks need room in the tray. The draft was left as it was.',
  restore: 'That block cannot go back: its place is gone or the page already has as many as it can hold.',
  'row-add': 'This page already has as many rows as it can hold.',
  'row-remove': 'Only an empty row can come off, and a page keeps at least one row.',
  'row-move': 'That row is already at the edge of the page.',
  'row-split': 'Move the blocks out of the columns this would drop first. Nothing was moved.',
}
const CHANGED = 'This page was changed somewhere else. Reload to see the newer draft; nothing here was saved over it.'

export async function saveCanvasNodeDraft(raw: unknown): Promise<CanvasSaveResult> {
  if (!envFlag('EDITOR_CANVAS')) return refuse('The canvas is switched off.')
  const staff = await getJanitor()
  if (!staff) return refuse('Only staff can use the canvas.')
  let input: z.infer<typeof saveInput>
  try {
    input = parseInput(saveInput, raw)
  } catch {
    return refuse('That change could not be read. Reload and try again.')
  }

  const { space, canSave, notice } = await resolveCanvasAccess(input.spaceId.toLowerCase())
  if (!space) return refuse('That Space was not found.')
  if (!canSave) return refuse(notice ?? 'You cannot save this page.')

  // `space.preferences` is the fresh read: resolveCanvasAccess loads the row uncached, on this request.
  const stored = readCanvasDocument(space.preferences)
  const target = stored.layout ? getNode(stored.layout, input.nid) : null
  if (!target) return refuse(stored.layout ? 'That block is no longer on the page. Reload to see the page as it is now.' : 'This Space has no page to edit yet.', !!stored.layout)
  const fieldKeys = canvasInspectorFor(target.type).fields.map((field) => field.key)
  if (!input.change && !fieldKeys.length) return refuse('This block has no fields the inspector can save.')
  // A move, a spacing step or an insert rides the same plan and the same guarded write as a field edit.
  let structure: CanvasDocChange | undefined
  // The live sections this Space may place, read on this request with the Space page builder's rule (PROG-E6F):
  // checked again for a live insert, and handed back with a reshaped view. Not read for a field edit or a step.
  const reshapes = !!input.change && input.change.kind !== 'spacing'
  const liveIds = reshapes ? await canvasLiveBlockIds(space) : []
  if (input.change?.kind === 'insert') {
    const block = resolveCanvasInsert(input.change.source, input.change.id, liveIds)
    if (!block) return refuse('That block is not one this page can add.')
    structure = { kind: 'insert', ...block }
  } else structure = input.change

  const plan = planCanvasDraftWrite({ preferences: space.preferences, nid: input.nid, values: input.values, fieldKeys, base: input.base, change: structure })
  if (plan.status === 'conflict') return refuse(CHANGED, true)
  if (plan.status === 'refused') return refuse(REFUSED[structure?.kind ?? 'move'] ?? REFUSED.move!)
  if (plan.status !== 'ready') return refuse('That change could not be saved. The draft was left as it was.')

  const written = await writeSpacePreferencesAtRevision(space.id, plan.preferences, { revisionKey: CANVAS_REVISION_KEY, expected: input.base.revision }, { actor: staff.profileId, draft: plan.layout as unknown as Record<string, unknown> })
  if (written === 'forbidden') return refuse('You cannot save this page.')
  if (written === 'stale') return refuse(CHANGED, true)
  if (written !== 'written') return refuse('Could not save the draft. Try again.')

  // The same pages the Space page builder refreshes after a draft save. The public page reads the published
  // layout, so it is refreshed, not changed.
  revalidatePath(`/spaces/${space.slug}/settings/profile`)
  revalidatePath(`/spaces/${space.slug}`)
  revalidatePath(`/spaces/${space.slug}/profile-preview`)
  // A field edit or a spacing step changes one block. Every other change alters the page's shape (or, for hide,
  // how its tree reads), so the tab gets the layer tree, each block's controls and the inserter again, built from
  // what was just stored. `node` is then the block the change left selected.
  const reshaped = structure && structure.kind !== 'spacing'
  return { ok: true, base: plan.base, node: canvasStoredNode(plan.node), ...(reshaped ? { view: canvasDocumentParts(plan.layout, liveIds) } : {}) }
}
