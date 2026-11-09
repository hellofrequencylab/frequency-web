// READINESS (BLD-204, docs/EDITOR-NEXT.md#bld-204; spec docs/design/frequency-builder-v3/block-editor-spec.md §4). One
// model feeds the Publish ring and its count, the tags on the canvas, the outline and the Publish sheet. PURE: no React.
//
// What it finds, over every page (publishing sends the whole website):
//   • sample words: a section a starter kit placed that the owner has not touched (`sample: true`). Publishing it
//     needs an explicit keep, because the owner may keep them on purpose, once;
//   • null numbers: a figure that says what it counts but has no number. These hold Publish until they are filled;
//   • missing alt text: an image with an address and no description (a warning);
//   • missing SEO: a page with no search description (a warning).
// The checks themselves live in lib/sites/editor/publish-checks.ts, which the current editor's Publish modal reads too.

import type { Config, Data } from '@/lib/page-editor/types'
import type { WebsiteSnapshot } from '@/lib/sites/editor/state'
import { missingAltText, sectionNullNumbers } from '@/lib/sites/editor/publish-checks'

type ReadinessKind = 'sample' | 'number' | 'alt' | 'seo'

export interface ReadinessItem {
  kind: ReadinessKind
  pageSlug: string
  pageLabel: string
  /** The section to select, or null for a page-level item (SEO). */
  sectionId: string | null
  /** Owner words for the issue, one line. */
  say: string
}

export interface Readiness {
  items: ReadinessItem[]
  /** The number on the ring. */
  count: number
  /** clear: publish. warn: publish, the sheet lists what could be better. keep: sample words need an explicit keep.
   *  blocked: a figure has no number, and Publish waits for it. */
  gate: 'clear' | 'warn' | 'keep' | 'blocked'
}

/** The tag a section wears on the canvas, or none. Sample words win: one tag per section. */
export const TAG_SAY: Record<'sample' | 'number', string> = { sample: 'Sample words · not yours yet', number: 'Needs a number' }

const ORDER: Record<ReadinessKind, number> = { number: 0, sample: 1, alt: 2, seo: 3 }

type Page = Pick<WebsiteSnapshot['pages'][number], 'slug' | 'label' | 'doc' | 'seo'>

/** The readiness of a draft: every item in page order, then section order, then kind. */
export function readiness(pages: readonly Page[], config: Config, options: { liveFigures?: boolean } = {}): Readiness {
  const items: ReadinessItem[] = []
  for (const page of pages) {
    const at = (kind: ReadinessKind, sectionId: string | null, say: string) => items.push({ kind, pageSlug: page.slug, pageLabel: page.label, sectionId, say })
    for (const block of page.doc.content) {
      const id = String(block.props.id ?? '')
      const name = String(config.components[block.type]?.label ?? block.type).replace(/\*/g, '')
      const found: [ReadinessKind, string][] = []
      if (block.props.sample === true) found.push(['sample', `${name}: sample words, not yours yet`])
      const numbers = sectionNullNumbers(block as { type: string; props: Record<string, unknown> }, options)
      if (numbers > 0) found.push(['number', `${name}: ${numbers === 1 ? 'a figure needs' : `${numbers} figures need`} a number`])
      const alt = missingAltText({ root: {}, content: [block] } as unknown as Data, config)
      if (alt > 0) found.push(['alt', `${name}: ${alt === 1 ? 'a photo needs' : `${alt} photos need`} a description`])
      found.sort((a, b) => ORDER[a[0]] - ORDER[b[0]]).forEach(([kind, say]) => at(kind, id, say))
    }
    if (!page.seo?.description?.trim()) at('seo', null, `${page.label}: add a search description`)
  }
  const has = (kind: ReadinessKind) => items.some((i) => i.kind === kind)
  const gate = has('number') ? 'blocked' : has('sample') ? 'keep' : items.length ? 'warn' : 'clear'
  return { items, count: items.length, gate }
}

/** Whether Publish may go now. Sample words go only with the owner's explicit keep; a missing number never goes. */
export function canPublish(r: Readiness, keep = false): boolean {
  return r.gate === 'clear' || r.gate === 'warn' || (r.gate === 'keep' && keep)
}

/** The canvas tags for one page: section id to its tag. */
export function readinessTags(r: Readiness, pageSlug: string): Record<string, string> {
  const tags: Record<string, string> = {}
  for (const item of r.items) {
    if (item.pageSlug !== pageSlug || !item.sectionId || (item.kind !== 'sample' && item.kind !== 'number')) continue
    if (!tags[item.sectionId] || item.kind === 'sample') tags[item.sectionId] = TAG_SAY[item.kind]
  }
  return tags
}

/** Clicking the count steps through the items: the one after `current`, wrapping to the first. */
export function nextReadinessItem(r: Readiness, current: number): number {
  return r.items.length ? (current + 1) % r.items.length : -1
}

/** Editing any slot or item makes the section the owner's (§4): the patch also clears `sample`. */
export function ownEdit(props: Record<string, unknown> | undefined, patch: Record<string, unknown>): Record<string, unknown> {
  return props?.sample === true && !('sample' in patch) ? { ...patch, sample: false } : patch
}
