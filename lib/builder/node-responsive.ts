// THE STORED FORM OF A BLOCK'S BREAKPOINT OVERRIDES (PROG-E5). The inspector edits one value bag per device
// (InspectorDeviceValues). The document stores desktop as the node's `content` and tablet / phone as the node's
// sparse `responsive` bags. These two functions are the whole translation, so the inspector model stays the only
// place that decides inheritance and the node stays the only thing persisted.

import type { BlockNode } from '@/lib/entity-blocks/node-tree'
import { resolveInspectorValue, type InspectorDeviceValues } from './inspector-model'
import type { BuilderDevice } from './state'

/** A node as the inspector's per-device values: desktop from `content`, tablet and phone from `responsive`. */
export function nodeDeviceValues(node: Pick<BlockNode, 'content' | 'responsive'>): InspectorDeviceValues<Record<string, unknown>> {
  const out: Record<string, Readonly<Record<string, unknown>>> = { desktop: node.content ?? {} }
  if (node.responsive?.tablet) out.tablet = node.responsive.tablet
  if (node.responsive?.phone) out.phone = node.responsive.phone
  return out
}

/** Per-device values back onto a node. Empty device bags are not stored, so a reset leaves no residue. */
export function withDeviceValues<N extends BlockNode>(node: N, values: InspectorDeviceValues<Record<string, unknown>>): N {
  const next: N = { ...node }
  const desktop = values.desktop
  if (desktop && Object.keys(desktop).length) next.content = { ...desktop }
  else delete next.content
  const responsive: NonNullable<BlockNode['responsive']> = {}
  for (const device of ['tablet', 'phone'] as const) {
    const bag = values[device]
    if (bag && Object.keys(bag).length) responsive[device] = { ...bag }
  }
  if (Object.keys(responsive).length) next.responsive = responsive
  else delete next.responsive
  return next
}

/** The content a viewport draws: desktop content with that device's overrides laid over it. Only the editor
 *  canvas calls this; public renderers keep drawing `content`. */
export function resolveNodeContent(node: Pick<BlockNode, 'content' | 'responsive'>, device: BuilderDevice): Record<string, unknown> {
  const values = nodeDeviceValues(node)
  const keys = new Set([...Object.keys(node.content ?? {}), ...Object.keys(node.responsive?.[device as 'tablet' | 'phone'] ?? {})])
  const out: Record<string, unknown> = {}
  for (const key of keys) {
    const { value } = resolveInspectorValue(values, device, key)
    if (value !== undefined) out[key] = value
  }
  return out
}
