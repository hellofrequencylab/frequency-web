import { CreditCard, Nfc } from 'lucide-react'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import { CardFaceEditor } from '@/components/member-cards/card-face-editor'
import { formatCardNumber } from '@/lib/member-cards/face'
import { listSpaceCards, memberCardsEnabled, readCardStats, readSpaceFace } from '@/lib/member-cards/store'
import { loyaltyOwnerGate } from '@/lib/loyalty/store'
import type { Space } from '@/lib/spaces/types'

// MEMBER CARDS, the Space side (LIVE-1282, ADR-1874, docs/LOYALTY.md "Member cards"). Lives in the
// Check-in panel beside Regulars and Counter scanners because a member card is the same member_cards
// row a counter scanner reads. Two things here: the Space's card FACE (what a tap on a card registered
// to this Space opens, set with the shared editor), with the one-line cardholder perk any Space may
// offer on any plan, and the list of cards registered to the Space. No new module, panel or menu row
// (MENU-CONTRACT). While SCANNER_DEVICES_ENABLED is off the section says so and shows nothing to edit.
//
// The gate is the loyalty owner gate every face write runs behind (canEditProfile, or a janitor): a
// manager without edit rights sees nothing here, and a staff previewer sees the editor read-only, the
// way the sibling sections disable their forms. Copy obeys CONTENT-VOICE, no em dashes.

const EDITION = { founders: 'Founders edition', crew: 'Crew edition' } as const

export async function MemberCardsSection({ space, staffViewing }: { space: Space; staffViewing: boolean }) {
  if (!memberCardsEnabled()) {
    return (
      <section>
        <SectionHeader title="Your Space card" />
        <EmptyState
          icon={CreditCard}
          title="Member cards are not open yet."
          description="A numbered Frequency card your team taps on any phone. You choose what it opens: your Space page, your contact card or one link."
        />
      </section>
    )
  }

  if (!(await loyaltyOwnerGate(space.id))) return null

  const [face, stats, cards] = await Promise.all([
    readSpaceFace(space.id),
    readCardStats({ kind: 'space', spaceId: space.id }),
    listSpaceCards(space.id),
  ])
  const shown = cards.find((c) => c.active) ?? cards[0] ?? null

  return (
    <section className="space-y-6">
      <div>
        <SectionHeader title="Your Space card" />
        <p className="text-body-sm text-muted">
          Cards registered to your Space open what you choose here. Your cardholder perk shows on your Space page to anyone who
          holds a Frequency card.
        </p>
      </div>

      <CardFaceEditor
        owner={{ kind: 'space', spaceId: space.id, slug: space.slug }}
        name={space.brandName ?? space.name}
        avatarUrl={space.brandLogoUrl}
        cardNumber={shown?.cardNumber ?? null}
        initialFace={face}
        stats={stats}
        readOnly={staffViewing}
      />

      <div>
        <h3 className="mb-2 text-body font-bold text-text">
          Cards registered to your Space <span className="font-normal text-muted">· {cards.length}</span>
        </h3>
        {cards.length === 0 ? (
          <p className="text-body-sm text-muted">
            None yet. Frequency writes cards for your team at a Frequency event or a visit, and they show up here.
          </p>
        ) : (
          <ul className="space-y-2">
            {cards.map((c) => (
              <li key={c.id} className="flex items-center gap-3 rounded-card border border-border bg-surface px-3 py-2.5">
                <Nfc aria-hidden className="h-5 w-5 shrink-0 text-muted" />
                <div className="min-w-0 grow">
                  <p className="text-body-sm font-bold tabular-nums text-text">
                    {formatCardNumber(c.cardNumber) ?? 'Card'} <span className="font-normal text-muted">· {EDITION[c.edition]}</span>
                  </p>
                  <p className="text-meta text-muted">
                    {c.lastUsedAt ? `Last tapped ${day(c.lastUsedAt)}` : `Added ${day(c.createdAt)}`}
                  </p>
                </div>
                <span
                  className={
                    c.active
                      ? 'rounded-pill bg-success-bg px-2 py-0.5 text-2xs font-semibold text-success'
                      : 'rounded-pill bg-surface-elevated px-2 py-0.5 text-2xs font-semibold text-muted'
                  }
                >
                  {c.active ? 'On' : 'Off'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

function day(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
