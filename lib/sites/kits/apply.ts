import type { WebsiteSnapshot } from '@/lib/sites/editor/state'
import { RESERVED_WEBSITE_SLUGS, validWebsiteSnapshot } from '@/lib/sites/editor/state'
import type { KitApplyMode, KitPage, SiteKit } from './types'

const MAX_PAGES = 30

type KitApplyResult =
  | { ok: true; snapshot: WebsiteSnapshot; added: string[]; renamed: Record<string, string> }
  | { ok: false; error: string }

/** A kit page as a website page. Every block is flagged `sample` so the editor can show what still needs the owner's words. */
type Defaults = (type: string) => Record<string, unknown> | undefined

function kitPageDoc(page: KitPage, slug: string, defaults?: Defaults): WebsiteSnapshot['pages'][number] {
  return {
    slug, label: page.label, seo: { ...page.seo }, comments: [],
    doc: { root: {}, content: page.blocks.map((b, i) => ({ type: b.type, props: { ...structuredClone(defaults?.(b.type) ?? {}), ...structuredClone(b.props ?? {}), id: `kit-${slug}-${i}`, sample: true } })) },
  }
}

function freeSlug(slug: string, taken: Set<string>): string {
  if (!taken.has(slug) && !RESERVED_WEBSITE_SLUGS.has(slug)) return slug
  for (let n = 1; n < 100; n++) {
    const next = `${slug}-kit${n > 1 ? `-${n}` : ''}`.slice(0, 64)
    if (!taken.has(next) && !RESERVED_WEBSITE_SLUGS.has(next)) return next
  }
  return `${slug.slice(0, 50)}-kit-${taken.size}`
}

/** `defaults` gives each block its registered default props (the editor passes the block config's), so a kit
 *  only states what differs and a block never renders with a field missing. */
/** Pure: the draft a kit would make. Nothing is saved here; the editor previews it, commits it as one
 *  undoable step, and the owner publishes when ready. Comments stay on pages the site already had. */
export function applyKit(draft: WebsiteSnapshot, kit: SiteKit, mode: KitApplyMode, defaults?: Defaults): KitApplyResult {
  let next: WebsiteSnapshot
  const added: string[] = []
  const renamed: Record<string, string> = {}
  if (mode === 'theme') {
    next = { ...structuredClone(draft), theme: kit.theme }
  } else if (mode === 'replace') {
    const pages = kit.pages.map((p) => { added.push(p.slug); return kitPageDoc(p, p.slug, defaults) })
    next = { ...structuredClone(draft), theme: kit.theme, pages, ...(kit.chrome ? { chrome: { ...kit.chrome } } : {}) }
  } else {
    const taken = new Set(draft.pages.map((p) => p.slug))
    const pages = [...structuredClone(draft.pages)]
    for (const p of kit.pages) {
      const slug = freeSlug(p.slug, taken)
      if (slug !== p.slug) renamed[p.slug] = slug
      taken.add(slug); added.push(slug)
      pages.push(kitPageDoc(p, slug, defaults))
    }
    if (pages.length > MAX_PAGES) return { ok: false, error: `This website would have ${pages.length} pages. Remove ${pages.length - MAX_PAGES} before adding this kit.` }
    next = { ...structuredClone(draft), theme: kit.theme, pages }
  }
  if (!validWebsiteSnapshot(next)) return { ok: false, error: 'This kit could not be applied to your website. Nothing was changed.' }
  return { ok: true, snapshot: next, added, renamed }
}
