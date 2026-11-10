import type { Doc } from 'yjs'
import type { EntityKind } from '../entity-blocks/registry'
import type { NodeLayout } from '../entity-blocks/node-tree'
import { snapshotForStorage } from './snapshot'

type DraftSnapshotPlan =
  | { status: 'ready'; baseRevision: number; nextRevision: number; tree: NodeLayout }
  | { status: 'conflict'; currentRevision: number }
  | { status: 'invalid-revision' | 'invalid-document' }

/** Prepare a candidate tree without editing the document. The writer must still compare the
 * stored revision to baseRevision in the same operation that writes the candidate.
 */
export function planDraftSnapshot({
  doc, kind, baseRevision, currentRevision,
}: {
  doc: Doc
  kind: EntityKind
  baseRevision: number
  currentRevision: number
}): DraftSnapshotPlan {
  if (
    !Number.isSafeInteger(baseRevision) || baseRevision < 0 ||
    !Number.isSafeInteger(currentRevision) || currentRevision < 0
  ) return { status: 'invalid-revision' }

  if (baseRevision !== currentRevision) return { status: 'conflict', currentRevision }
  if (currentRevision === Number.MAX_SAFE_INTEGER) return { status: 'invalid-revision' }

  const snapshot = snapshotForStorage(doc, kind)
  return snapshot
    ? { status: 'ready', baseRevision, nextRevision: currentRevision + 1, tree: snapshot.tree }
    : { status: 'invalid-document' }
}
