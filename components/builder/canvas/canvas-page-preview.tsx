'use client'

// THE WHOLE PAGE IN THE FRAME (PROG-E6E). Until now the frame drew only the selected block. This draws every block of
// the page as the page holds it: row by row, a two-column row side by side at its split (even, wide left, wide right),
// and on the Phone frame one column, as a phone shows it. Each block draws the words the selected device resolves to.
// A hidden block keeps its place, faded and marked, so it can still be picked. Tapping a block selects it for the
// inspector, and the selected block is drawn through `renderSelected` (the spacing handles). The frame is an iframe
// with no stylesheet, so everything here is inline.

import type { CSSProperties, ReactNode } from 'react'
import type { BuilderDevice } from '@/lib/builder/state'
import type { InspectorFieldView } from '@/lib/builder/inspector-fields'
import type { LayerTree, RowSplit } from '@/lib/builder/canvas-tree'
import { resolveNodeContent } from '@/lib/builder/node-responsive'
import type { BlockNode } from '@/lib/entity-blocks/node-tree'

/** One block the frame can draw: its name, its fields (to know which hold words) and its stored bags. */
export type PreviewBlock = { title: string; fields: readonly InspectorFieldView[]; node: Pick<BlockNode, 'content' | 'responsive'> }

/** Word fields may hold inline marks (bold, links); the frame shows the words only. Tags are dropped until none is
 *  left, so a tag split around another (`<scr<b>ipt>`) cannot survive one pass. The result is only ever a React
 *  text child, which is escaped on render. */
export function plainWords(value: unknown): string {
  if (typeof value !== 'string') return ''
  let words = value
  for (let prev = ''; prev !== words; ) {
    prev = words
    words = words.replace(/<[^>]*>/g, '')
  }
  return words.trim()
}

/** A block's words as the frame draws them on a device: the headline (`title` when the block has one) large, the
 *  other word fields as plain lines, and the block's name when it has no words yet. */
export function BlockWords({ block, device }: { block: PreviewBlock; device: BuilderDevice }) {
  const resolved = resolveNodeContent(block.node, device)
  const words = block.fields.filter((f) => f.kind === 'text' || f.kind === 'textarea')
  const headline = words.find((f) => f.key === 'title')?.key ?? words[0]?.key
  return (
    <>
      {words.length === 0 && <p style={{ margin: '4px 0', fontWeight: 700 }}>{block.title}</p>}
      {words.map((f) => f.key === headline
        ? <p key={f.key} style={{ margin: '4px 0', fontSize: device === 'phone' ? 24 : 32, fontWeight: 700 }}>{plainWords(resolved[f.key]) || block.title}</p>
        : plainWords(resolved[f.key]) ? <p key={f.key} style={{ margin: 0 }}>{plainWords(resolved[f.key])}</p> : null)}
    </>
  )
}

/** The CSS grid columns a row's split draws at, or one column on a phone. */
export function previewColumns(split: RowSplit | undefined, count: number, device: BuilderDevice): string {
  if (device === 'phone' || count < 2) return 'minmax(0, 1fr)'
  if (split === 'lead') return 'minmax(0, 2fr) minmax(0, 1fr)'
  if (split === 'sidebar') return 'minmax(0, 1fr) minmax(0, 2fr)'
  return `repeat(${count}, minmax(0, 1fr))`
}

const PICK: CSSProperties = {
  display: 'block', width: '100%', minHeight: 44, padding: 8, boxSizing: 'border-box', textAlign: 'left',
  font: 'inherit', color: 'inherit', background: 'transparent', border: '1px dashed transparent', borderRadius: 8, cursor: 'pointer',
}

export function CanvasPagePreview({
  tree, blocks, device, selectedId, onSelect, renderSelected,
}: {
  tree: LayerTree
  blocks: ReadonlyMap<string, PreviewBlock>
  device: BuilderDevice
  selectedId: string | null
  onSelect: (nid: string) => void
  /** Draws the selected block's words with its own tools around them. */
  renderSelected: (words: ReactNode) => ReactNode
}) {
  return (
    <div data-page-preview="" style={{ display: 'grid', gap: 24 }}>
      {tree.map((row) => (
        <section key={row.id} data-preview-row={row.id} aria-label={row.label} style={{ display: 'grid', gap: 16, gridTemplateColumns: previewColumns(row.split, row.columns.length, device) }}>
          {row.columns.map((stack, col) => (
            <div key={col} data-preview-column={col} style={{ display: 'grid', gap: 12, alignContent: 'start', minWidth: 0 }}>
              {stack.map((layer) => {
                const block = blocks.get(layer.id)
                if (!block) return null
                const words = <BlockWords block={block} device={device} />
                const tag = layer.hidden ? <span style={{ font: '12px/1.4 system-ui, sans-serif', opacity: 0.8 }}>Hidden on the page</span> : null
                if (layer.id === selectedId) {
                  return (
                    <div key={layer.id} data-preview-block={layer.id} data-selected="" style={{ outline: '2px solid currentColor', outlineOffset: 4, borderRadius: 8, opacity: layer.hidden ? 0.6 : 1 }}>
                      {tag}
                      {renderSelected(words)}
                    </div>
                  )
                }
                return (
                  <button key={layer.id} type="button" data-preview-block={layer.id} aria-label={`Edit ${layer.label}${layer.hidden ? ', hidden' : ''}`} onClick={() => onSelect(layer.id)} style={{ ...PICK, opacity: layer.hidden ? 0.45 : 1 }}>
                    {tag}
                    {words}
                  </button>
                )
              })}
            </div>
          ))}
        </section>
      ))}
    </div>
  )
}
