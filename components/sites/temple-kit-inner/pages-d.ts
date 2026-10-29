import type { KitPage } from '@/lib/sites/kits/types'

// THE TEMPLE KIT INNER PAGES, group D: Shop and Library, as pages of TempleKitInner blocks
// (components/page-editor/blocks/temple-kit-inner-d.tsx). PURE. Words and sample prices are the design's
// (ui_kits/site ShopPage, ResourcesPage); every name and price is a typed value the Space edits. No rating, review
// count or stock number is seeded.

type Block = KitPage['blocks'][number]

const page = (slug: string, label: string, description: string, blocks: Block[]): KitPage => ({ slug, label, seo: { title: label, description }, blocks })

export function templeKitShopPage(): KitPage {
  return page('shop', 'Shop', 'Objects for slow rooms.', [
    { type: 'TempleKitInnerHero', props: { eyebrow: 'The shop', title: 'Objects *for slow rooms.*', lead: 'What we burn, sit on and listen to at the house, made in small batches. Recordings and gift cards too.' } },
    { type: 'TempleKitInnerShop', props: { footnote: 'Free shipping over $120. Members save 10%.', items: [
      { kind: 'Objects', title: 'Beeswax taper candles', meta: 'Set of six, hand dipped', price: '$38', href: '~/contact' },
      { kind: 'Objects', title: 'Linen meditation cushion', meta: 'Buckwheat filled', price: '$96', href: '~/contact' },
      { kind: 'Digital', title: 'Morning breath, the recordings', meta: 'Seven practices to keep', price: '$24', badge: 'Download', href: '~/contact' },
      { kind: 'Gifts', title: 'Gift card', meta: 'Sent by email with your note', price: 'From $50', badge: 'Gift', href: '~/contact' },
    ] } },
  ])
}

export function templeKitLibraryPage(): KitPage {
  return page('library', 'Library', 'Guides, recordings and essays.', [
    { type: 'TempleKitInnerHero', props: { eyebrow: 'Library', title: 'The *library*', lead: 'Planning guides, floor plans, recordings from the great room and essays on keeping the seasons. Most of it is free.' } },
    { type: 'TempleKitInnerLibrary', props: { items: [
      { kind: 'Guides', title: 'Planning a gathering at the house', meta: 'Guide, PDF', ctaLabel: 'Download', href: '~/contact' },
      { kind: 'Templates', title: 'Room layouts for thirty people', meta: 'Floor plans, PDF', ctaLabel: 'Download', href: '~/contact' },
      { kind: 'Recordings', title: 'A long sound bath', meta: 'Recording, audio', price: '$12', ctaLabel: 'Buy', href: '~/contact' },
      { kind: 'Essays', title: 'Keeping the seasons', meta: 'Essay, five minute read', ctaLabel: 'Read', href: '~/contact' },
    ] } },
  ])
}

/** Group D, in menu order. */
export const templeKitInnerPagesD = (): KitPage[] => [templeKitShopPage(), templeKitLibraryPage()]
