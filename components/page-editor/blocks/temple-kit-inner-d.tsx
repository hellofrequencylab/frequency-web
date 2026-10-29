import type { ComponentConfig } from '@/lib/page-editor/types'
import { TempleKitShelfBoard, type ShelfItem } from '@/components/sites/temple-kit-inner/shelf-board'
import { arr, area, block, cls, hrefOf, image, img, str, text, type Props } from './temple-kit-inner'

// ── The Temple Theme Kit inner-page blocks, group D (Shop and Library) ─────────────────────────────────────────
// Same family as groups A to C: tki-* classes, tokens only, scoped to the site render. Both blocks draw what the
// Space types (name, kind, price, link); the kind tabs are made from the kinds it uses. No rating, review count or
// stock number is seeded: those are the Space's own facts. An empty price in the Library reads as free.

function shelf(p: Props, metadata: Props | undefined, mode: 'shop' | 'library', pad?: string, vis?: string) {
  const items: ShelfItem[] = arr(p.items)
    .map((x) => ({
      kind: str(x.kind), title: str(x.title), meta: str(x.meta), price: str(x.price), badge: str(x.badge), cover: img(x.image) ?? img(p.fallback),
      href: str(x.href) ? hrefOf(str(x.href), metadata) : null, ctaLabel: str(x.ctaLabel) || (str(x.price) ? 'Buy' : 'Download'),
    }))
    .filter((i) => i.title)
  if (items.length === 0) return null
  return (
    <section data-tki={mode} className={cls('tki-section', mode === 'shop' ? 'tki-shop' : 'tki-library', pad, vis)}>
      <TempleKitShelfBoard items={items} mode={mode} allLabel={str(p.allLabel) || 'All'} freeLabel={str(p.freeLabel) || 'Free'} countLabel={str(p.countLabel) || (mode === 'shop' ? 'items' : 'on the shelves')} />
      {str(p.footnote) && <p className="tki-footnote">{str(p.footnote)}</p>}
    </section>
  )
}

const ShopBlock = ({ p, metadata, pad, vis }: { p: Props; metadata?: Props; pad?: string; vis?: string }) => shelf(p, metadata, 'shop', pad, vis)
const LibraryBlock = ({ p, metadata, pad, vis }: { p: Props; metadata?: Props; pad?: string; vis?: string }) => shelf(p, metadata, 'library', pad, vis)

const shared = { allLabel: text('Label for all'), countLabel: text('Word after the count'), footnote: area('Line under the shelf'), fallback: image }

export const templeKitInnerDComponents: Record<string, ComponentConfig> = {
  TempleKitInnerShop: block('Temple shop', {
    ...shared,
    items: {
      type: 'array', label: 'Products',
      arrayFields: { kind: text('Kind', 'Like: Objects, Digital or Gifts. Kinds become the filter tabs.'), title: text('Name'), meta: text('Line under the name'), price: text('Price', 'Typed as you want it read, like $38 or From $50.'), badge: text('Badge on the photo'), image, href: text('Link') },
    },
  }, { allLabel: 'All', countLabel: 'items', footnote: '', fallback: '', items: [] }, ShopBlock),
  TempleKitInnerLibrary: block('Temple library', {
    ...shared, freeLabel: text('Word for no price'),
    items: {
      type: 'array', label: 'Shelf',
      arrayFields: { kind: text('Kind', 'Like: Guides, Templates, Recordings or Essays. Kinds become the filter tabs.'), title: text('Name'), meta: text('Line beside the name', 'Like: PDF, 24 pages.'), price: text('Price', 'Leave empty for free.'), ctaLabel: text('Button'), href: text('Link') },
    },
  }, { allLabel: 'All', countLabel: 'on the shelves', freeLabel: 'Free', footnote: '', fallback: '', items: [] }, LibraryBlock),
}
