// THE SNAPSHOT BOUNDARY — E0 task 18 (docs/EDITOR-E0.md §7).
//
// The server cannot reject a CRDT edit, so an invalid intermediate state is normal. Validation
// therefore lives HERE, where a Yjs document becomes something stored or published: the plain tree
// is read off the doc and run through `sanitizeNodeLayout`. A doc that sanitizes to nothing yields
// `null` and the caller keeps the previous draft. `page_versions` stores the returned tree, never
// Yjs state. Editor only: no visitor bundle may import this.

import type * as Y from 'yjs'
import type { EntityKind } from '../entity-blocks/layout'
import type { NodeLayout } from '../entity-blocks/node-tree'
import { sanitizeNodeLayout } from '../entity-blocks/node-ops'
import { serializeLayout } from './node-ydoc'

interface DraftSnapshot {
  /** The sanitized tree, safe to store as the draft or to freeze into a page version. */
  tree: NodeLayout
}

/** The sanitized tree for `doc`, or null when nothing valid can be read (keep the previous draft). */
export function snapshotForStorage(doc: Y.Doc, kind: EntityKind): DraftSnapshot | null {
  const tree = sanitizeNodeLayout(serializeLayout(doc), kind)
  return tree ? { tree } : null
}
