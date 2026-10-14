import type { Config, Data } from '@/lib/page-editor/types'
import type { WebsiteSnapshot } from './state'

// THE PUBLISH MODAL'S CHECKS (design_handoff/frequency/templates/admin/Page Editor.html: "Every image has alt
// text", "Page title and description set"). PURE reads of the draft the editor already holds: nothing is
// saved, validated or blocked here. A failed check is a warning beside Publish, never a gate.
//
// ALT TEXT. A block (or an item of a block's array field) is image-bearing when its field definitions carry
// an `alt` field, the editor's convention beside every image field. It is missing alt text when one of its
// image-like fields holds an address and the `alt` value is empty. Nested blocks (slots) are walked too.

const IMAGE_KEY = /image|img|src|photo|picture|poster|media|logo|avatar|cover/i
const ADDRESS = /^(https?:|\/|data:image)/i

type FieldMap = Record<string, { type?: string; arrayFields?: FieldMap } | undefined>
type Block = { type: string; props: Record<string, unknown> }

function isBlock(value: unknown): value is Block {
  return !!value && typeof value === 'object' && typeof (value as Block).type === 'string' && !!(value as Block).props && typeof (value as Block).props === 'object'
}

function hasImage(values: Record<string, unknown>, fields: FieldMap): boolean {
  return Object.keys(fields).some((key) => key !== 'alt' && IMAGE_KEY.test(key) && typeof values[key] === 'string' && ADDRESS.test((values[key] as string).trim()))
}

function emptyAlt(values: Record<string, unknown>): boolean {
  return typeof values.alt !== 'string' || values.alt.trim() === ''
}

/** One count per image with an address and no alt text. */
function countIn(values: Record<string, unknown>, fields: FieldMap): number {
  let missing = 0
  if (fields.alt && hasImage(values, fields) && emptyAlt(values)) missing += 1
  for (const [key, field] of Object.entries(fields)) {
    if (field?.type !== 'array' || !field.arrayFields || !Array.isArray(values[key])) continue
    for (const item of values[key] as unknown[]) {
      if (item && typeof item === 'object') missing += countIn(item as Record<string, unknown>, field.arrayFields)
    }
  }
  return missing
}

function walk(blocks: unknown[], config: Config, seen: Set<unknown>): number {
  let missing = 0
  for (const block of blocks) {
    if (!isBlock(block) || seen.has(block)) continue
    seen.add(block)
    const fields = (config.components[block.type]?.fields ?? {}) as FieldMap
    missing += countIn(block.props, fields)
    for (const value of Object.values(block.props)) {
      if (Array.isArray(value) && value.some(isBlock)) missing += walk(value, config, seen)
    }
  }
  return missing
}

/** Images in this document that carry an address but no alt text. */
export function missingAltText(doc: Data, config: Config): number {
  return walk(doc.content as unknown[], config, new Set())
}

export interface PublishCheck {
  ok: boolean
  text: string
}

/** The modal's checks over every page in the draft, in the design's words when they pass. */
export function publishChecks(pages: { label: string; doc: Data; seo: { title: string; description: string } }[], config: Config, options: { otherChanged?: string[] } = {}): PublishCheck[] {
  const altMissing = pages.reduce((sum, p) => sum + missingAltText(p.doc, config), 0)
  // A blank title falls back to "Page | Site" on the live page, so only a missing description is a gap.
  const noSeo = pages.filter((p) => !p.seo.description.trim()).map((p) => p.label)
  return [
    altMissing === 0
      ? { ok: true, text: 'Every image has alt text' }
      : { ok: false, text: `${altMissing} ${altMissing === 1 ? 'image needs' : 'images need'} alt text` },
    noSeo.length === 0
      ? { ok: true, text: 'Page title and description set' }
      : { ok: false, text: `Add a search description to ${noSeo.length <= 3 ? noSeo.join(', ') : `${noSeo.length} pages`}` },
    // The design's third check: publishing sends the whole website, so OTHER pages' unpublished changes go live
    // too. Said as a warning, never a gate. Only when the caller names them (the Frequency modal).
    ...(options.otherChanged?.length ? [{ ok: false, text: `${options.otherChanged.length <= 3 ? options.otherChanged.join(', ') : `${options.otherChanged.length} other pages`} ${options.otherChanged.length === 1 ? 'page has' : 'have'} unpublished changes that go live too` }] : []),
  ]
}

/** What a draft holds that its published version does not, as the change log's human labels (the Frequency
 *  publish modal and badge). The editor seeds its log with these when it opens on unpublished work, then adds
 *  each edit's own label ("Edited Hero") as it happens. Comments never count: they are not published. */
export function pendingChangeLabels(draft: WebsiteSnapshot, published: WebsiteSnapshot | null): string[] {
  const labels: string[] = []
  for (const page of draft.pages) {
    const live = published?.pages.find((p) => p.slug === page.slug)
    if (!live || JSON.stringify({ ...page, comments: [] }) !== JSON.stringify(live)) labels.push(`Updated ${page.label}`)
  }
  for (const page of published?.pages ?? []) if (!draft.pages.some((p) => p.slug === page.slug)) labels.push(`Removed page ${page.label}`)
  if (JSON.stringify(draft.pages.map(({ slug, label }) => ({ slug, label }))) !== JSON.stringify(published?.pages.map(({ slug, label }) => ({ slug, label })))) labels.push('Navigation')
  if (JSON.stringify(draft.chrome) !== JSON.stringify(published?.chrome)) labels.push('Header and footer')
  if (JSON.stringify(draft.brand) !== JSON.stringify(published?.brand)) labels.push('Brand settings')
  if (draft.theme !== published?.theme) labels.push('Theme')
  return labels
}
