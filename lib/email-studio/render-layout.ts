// Read-only compilation seam. Editor saves still use the legacy EntityLayout contract.
import { parseEntityLayout, type EntityLayout } from '@/lib/entity-blocks/layout'
import { hasNativeNodeStorage } from '@/lib/entity-blocks/legacy-write-guard'
import { upgradeLayout, type NodeLayout } from '@/lib/entity-blocks/node-tree'

export type EmailRenderLayout = EntityLayout | NodeLayout
export type EmailRenderDoc = { layout: EmailRenderLayout; subject: string; preheader: string }

/** Keep native placements and bench intact rather than passing object cells through legacy parsing. */
export function parseEmailRenderLayout(raw: unknown): EmailRenderLayout | null {
  return hasNativeNodeStorage(raw) ? upgradeLayout(raw) : parseEntityLayout(raw)
}
