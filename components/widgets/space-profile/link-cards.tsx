import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import type { SpaceProfileContext } from '@/lib/spaces/profile-modules'
import { resolvePickedIds } from '@/lib/entity-blocks/block-content'
import {
  blockDataList,
  linkCardKind,
  LINK_CARD_KIND_LABEL,
  type BlockDataItem,
} from '@/lib/entity-blocks/block-data-sources'
import { isSellingLinkCard } from '@/lib/spaces/spotlight'
import { spaceCanTakePayments } from '@/lib/pricing/payments-gate'
import { Eyebrow } from '@/components/page-editor/blocks/kit'
import { ModuleSection } from './section'

// LINK CARDS (the Space Spotlight, LIVE-852): the link-in-bio buttons. Each card is ONE thing the Space
// offers (a product, a Journey, an event, a membership, the Book or Contact door), resolved from the Space's
// live data by listLinkCards and linking into the flow that already handles it, so a booking, a sale or a
// message still lands in the console. The picker chooses which cards show, in the owner's order; nothing
// chosen shows the first few. On a free Space only Book and Contact show (LIVE-854). FAIL-SAFE: no linkable
// item, no section.

/** How many cards show when the owner has not picked any. */
const DEFAULT_CARD_COUNT = 6

/** The card's title: the picker label without its "Kind: " prefix. */
function cardTitle(item: BlockDataItem): string {
  const kind = linkCardKind(item.id)
  const prefix = kind ? `${LINK_CARD_KIND_LABEL[kind]}: ` : ''
  return prefix && item.label.startsWith(prefix) ? item.label.slice(prefix.length) : item.label
}

export async function LinkCardsBlock({
  space,
  header,
  featuredIds,
}: {
  space: SpaceProfileContext
  header?: { eyebrow?: string; heading?: string }
  featuredIds?: string[]
}) {
  // A free Space shows only the free cards (Book, Contact): selling cards need a plan that takes payments
  // (lib/spaces/spotlight.ts isSellingLinkCard). Fail-closed, like the payments gate it reads.
  const [items, canSell] = await Promise.all([blockDataList('linkCards', space.id), spaceCanTakePayments(space.id)])
  const all = items.filter((it) => it.href && (canSell || !isSellingLinkCard(it.id)))
  const chosen = featuredIds ?? []
  const ids = resolvePickedIds(chosen, all.map((it) => it.id))
  const byId = new Map(all.map((it) => [it.id, it]))
  const cards = (chosen.length ? ids : ids.slice(0, DEFAULT_CARD_COUNT))
    .map((id) => byId.get(id))
    .filter((it): it is BlockDataItem => Boolean(it))
  if (cards.length === 0) return null

  return (
    <ModuleSection anchor="links">
      {(header?.eyebrow || header?.heading) && (
        <div className="mb-4 text-center">
          {header.eyebrow && <Eyebrow>{header.eyebrow}</Eyebrow>}
          {header.heading && <h2 className="text-card-title font-bold text-text">{header.heading}</h2>}
        </div>
      )}
      <ul className="space-y-3">
        {cards.map((item) => {
          const kind = linkCardKind(item.id)
          return (
            <li key={item.id}>
              <Link
                href={item.href!}
                className="flex items-center gap-3 rounded-card border border-border bg-surface p-3 transition-colors hover:border-primary hover:bg-primary-bg/30"
              >
                {item.image && (
                  <Image
                    src={item.image}
                    alt=""
                    width={56}
                    height={56}
                    className="h-14 w-14 shrink-0 rounded-lg object-cover"
                  />
                )}
                <span className="min-w-0 flex-1">
                  {kind && <span className="eyebrow block text-primary-strong">{LINK_CARD_KIND_LABEL[kind]}</span>}
                  <span className="block truncate text-body font-semibold text-text">{cardTitle(item)}</span>
                </span>
                {item.price && <span className="shrink-0 text-body-sm font-semibold text-muted">{item.price}</span>}
                <ArrowRight className="h-4 w-4 shrink-0 text-muted" aria-hidden />
              </Link>
            </li>
          )
        })}
      </ul>
    </ModuleSection>
  )
}
