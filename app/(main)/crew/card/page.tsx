import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CreditCard, Nfc } from 'lucide-react'
import { FocusTemplate } from '@/components/templates'
import { EmptyState } from '@/components/ui/empty-state'
import { SectionHeader } from '@/components/ui/section-header'
import { Button } from '@/components/ui/button'
import { CardFaceEditor } from '@/components/member-cards/card-face-editor'
import { requireProfileId } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { readCardStage } from '@/lib/member-cards/stage'
import { isCrewMember, listMyCards, memberCardsEnabled, readCardStats, readMemberFace } from '@/lib/member-cards/store'
import { readBadgeState } from '@/lib/devices/badges'
import { loadRootSpaceId } from '@/lib/spaces/store'
import { parseVcard } from '@/lib/vcard'
import { MyCardsList } from './my-cards-list'
import { RequestCardButton } from './request-card-button'

export const dynamic = 'force-dynamic'

// Personal member surface: titled for the tab, kept out of the index (/crew is also robots-disallowed
// and sign-in protected in proxy.ts).
export const metadata = { title: 'My card', robots: { index: false } }

// MY CARD (/crew/card, LIVE-1282, ADR-1874, docs/LOYALTY.md "Member cards"). A member card is a
// numbered NTAG215 card that always holds one /c/<token> link; the face set here decides what a phone
// tap opens. The editor works before a card exists, so a member can set it up in advance. Getting a
// card is a Crew perk: a Crew member with none asks for one here (staff write it at an event or a
// visit), anyone else gets one line pointing at /upgrade. Holding a card needs no tier, so a lapsed
// member keeps the editor and the on/off switches. While the scanner switch is off the page says
// cards are not open yet. Copy obeys CONTENT-VOICE: plain, no em dashes.

export default async function MyCardPage() {
  const profileId = await requireProfileId()

  if (!memberCardsEnabled()) {
    return (
      <Shell>
        <EmptyState
          icon={CreditCard}
          title="Member cards are not open yet."
          description="A numbered Frequency card you tap on any phone. You choose what it opens: your page, your contact card or one link. Cards come with Crew."
        />
      </Shell>
    )
  }

  const supabase = await createClient()
  const { data: me } = await supabase
    .from('profiles')
    .select('handle, display_name, avatar_url, vcard')
    .eq('id', profileId)
    .maybeSingle()
  if (!me?.handle) notFound()

  const [face, stats, cards, stageLabel] = await Promise.all([
    readMemberFace(profileId),
    readCardStats({ kind: 'member', profileId }),
    listMyCards(profileId),
    readCardStage(profileId),
  ])
  const vcard = parseVcard(me.vcard)
  const name = me.display_name || me.handle
  // The preview draws the newest card that is on, or the newest at all.
  const shown = cards.find((c) => c.active) ?? cards[0] ?? null

  return (
    <Shell>
      <div className="space-y-8">
        <CardFaceEditor
          owner={{ kind: 'member', handle: me.handle }}
          name={name}
          avatarUrl={me.avatar_url}
          stageLabel={stageLabel}
          cardNumber={shown?.cardNumber ?? null}
          initialFace={face}
          stats={stats}
          contact={{ title: vcard.title, phone: vcard.phone, email: vcard.email, website: vcard.website }}
        />

        <section>
          <SectionHeader title="Your cards" count={cards.length} />
          {cards.length > 0 ? (
            <>
              <p className="mb-3 text-body-sm text-muted">
                Switch a card off if you lose it. Pause above covers every card at once.
              </p>
              <MyCardsList cards={cards} />
            </>
          ) : (
            <GetYourCard profileId={profileId} />
          )}
        </section>
      </div>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <FocusTemplate
      width="wide"
      back={{ href: '/crew', label: 'My Quest' }}
      title={
        <span className="flex items-center gap-2">
          <Nfc className="h-5 w-5 text-primary-strong" aria-hidden /> My card
        </span>
      }
      description="Your Frequency member card. Choose what a tap opens, see who saved you, and pause it if it goes missing."
    >
      {children}
    </FocusTemplate>
  )
}

/** No card yet: Crew asks for one; everyone else learns cards come with Crew. */
async function GetYourCard({ profileId }: { profileId: string }) {
  if (!(await isCrewMember(profileId))) {
    return (
      <div className="rounded-card border border-border bg-surface-elevated/60 p-4">
        <p className="text-body-sm text-text">Member cards come with Crew.</p>
        <p className="mt-1 text-meta text-muted">You can set up your card above now, and it is ready the day it is written.</p>
        <Button asChild size="sm" className="mt-3">
          <Link href="/upgrade">See Crew</Link>
        </Button>
      </div>
    )
  }
  const rootId = await loadRootSpaceId()
  const requested = rootId ? (await readBadgeState(rootId, profileId)) === 'requested' : false
  return (
    <div className="rounded-card border border-border bg-surface p-4 lift-1">
      <h3 className="text-body font-bold text-text">Get your card</h3>
      <p className="mt-1 text-body-sm text-muted">
        Your card is part of Crew. Frequency staff write it for you at a Frequency event or a visit. Ask now and it is on the list
        when you get there. Set it up above and it opens what you chose from the first tap.
      </p>
      <div className="mt-3">
        <RequestCardButton requested={requested} />
      </div>
    </div>
  )
}
