import { roleOfType } from '@/lib/blocks/roles/roles'
import { roleDrawsNothingForVisitor } from '@/components/page-editor/blocks/roles'
import type { Config, Data, Metadata } from '@/lib/page-editor/types'

// VIEW AS (BLD-304; spec docs/EDITOR-NEXT.md#bld-304, move 10). The owner sees the page as a visitor, a member or the
// host, through the gates the renderers already keep, never a second list:
//   • the host sees the editing canvas: authoring placeholders (`puck.isEditing`, ADR-927), readiness tags (BLD-204)
//     and the sample copy of a live role that has no Space rows yet (flagged as sample);
//   • a visitor meets none of that: no scaffolding, no tags, and a sample live role with nothing real to show draws
//     nothing (the `emptyLive` rule in components/page-editor/blocks/roles.tsx), as on the published page;
//   • a member is a visitor who is signed in: the same page today, with `metadata.viewer` saying so for any block that
//     reads it (no website block does yet; the hook is the seam, not a promise).
// The canvas draws the visitor and member views in preview (no editing chrome), so the one document is never changed:
// the sections a visitor cannot meet are left out of what the canvas draws, and listed, with the reason. PURE: no React.

export type ViewAs = 'visitor' | 'member' | 'host'

interface ViewAsSpec {
  id: ViewAs
  label: string
  says: string
}

export const VIEW_AS: readonly ViewAsSpec[] = [
  { id: 'host', label: 'Host', says: 'Editing: placeholders, sample copy and tags show' },
  { id: 'member', label: 'Member', says: 'A signed-in member of your Space' },
  { id: 'visitor', label: 'Visitor', says: 'Anyone on the open web' },
]

export const VIEW_AS_IDS = VIEW_AS.map((v) => v.id) as readonly ViewAs[]

interface ViewerLens {
  /** The canvas edits (host) or previews (visitor, member). */
  editing: boolean
  /** Readiness tags on the canvas: host only. */
  tags: boolean
  /** The metadata the blocks render with: the host's as is; a viewer line for the other two. */
  metadata: Metadata | undefined
}

/** What the canvas renders with for a view. Pure over the host's metadata; the original is never written. */
export function viewerLens(view: ViewAs, metadata: Metadata | undefined): ViewerLens {
  if (view === 'host') return { editing: true, tags: true, metadata }
  return { editing: false, tags: false, metadata: { ...(metadata ?? {}), viewer: { signedIn: view === 'member', member: view === 'member' } } }
}

export interface HostOnlySection {
  id: string
  type: string
  reason: string
}

/** The sections a visitor never meets on this page, each with the reason: a block type this version cannot draw (kept in
 *  the document, drawn as a placeholder for the host only), or a live role's sample copy with no Space rows behind it. */
export function hostOnlySections(doc: Data, config: Config, metadata: Metadata | undefined, now = new Date()): HostOnlySection[] {
  const out: HostOnlySection[] = []
  for (const section of doc.content) {
    const id = String(section.props?.id ?? '')
    const entry = (config.components as Record<string, { label?: string } | undefined>)[section.type]
    if (!entry) { out.push({ id, type: section.type, reason: 'This block is not available in this version. It is kept as saved and shows nothing on the live page.' }); continue }
    const role = roleOfType(section.type)
    if (role && roleDrawsNothingForVisitor(role, (section.props ?? {}) as Record<string, unknown>, metadata, now)) {
      out.push({ id, type: section.type, reason: `${entry.label ?? section.type} is sample copy and your Space has nothing real for it yet, so visitors see nothing here.` })
    }
  }
  return out
}

/** The document the canvas draws for a view: the host's whole page; for a visitor or a member, the page without the
 *  sections they never meet. The stored document is untouched either way. */
export function viewerDoc(doc: Data, config: Config, view: ViewAs, metadata: Metadata | undefined, now = new Date()): { doc: Data; hostOnly: HostOnlySection[] } {
  if (view === 'host') return { doc, hostOnly: [] }
  const hostOnly = hostOnlySections(doc, config, metadata, now)
  if (!hostOnly.length) return { doc, hostOnly }
  const gone = new Set(hostOnly.map((h) => h.id))
  return { doc: { ...doc, content: doc.content.filter((s) => !gone.has(String(s.props?.id ?? ''))) }, hostOnly }
}
