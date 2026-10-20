import { hasNativeNodeStorage } from './legacy-write-guard'
import { sanitizeNodeLayout } from './node-ops'
import type { NodeLayout } from './node-tree'
import type { EntityKind } from './registry'

// THE ONE-TIME NODE BACKFILL DECISION (E0 task 15). One stored layout in, one verdict out: leave it,
// convert it, or say it cannot be converted. Pure, so the script that walks the database and the test that
// pins the behaviour share it. Re-running over its own output is a no-op: a document that already carries
// node storage is `skip`, and a converted one is native by construction.

export type BackfillVerdict =
  | { action: 'skip'; reason: 'empty' | 'already-native' }
  | { action: 'invalid' }
  | { action: 'convert'; next: NodeLayout }

export function backfillLayout(stored: unknown, kind: EntityKind): BackfillVerdict {
  if (stored == null) return { action: 'skip', reason: 'empty' }
  if (hasNativeNodeStorage(stored)) return { action: 'skip', reason: 'already-native' }
  const next = sanitizeNodeLayout(stored, kind)
  return next ? { action: 'convert', next } : { action: 'invalid' }
}
