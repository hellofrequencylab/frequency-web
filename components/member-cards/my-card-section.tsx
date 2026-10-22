import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { SectionHeader } from '@/components/ui/section-header'
import { Button } from '@/components/ui/button'
import { CardFaceEditor } from '@/components/member-cards/card-face-editor'
import { MyCardsList } from '@/components/member-cards/my-cards-list'
import { RequestCardButton } from '@/components/member-cards/request-card-button'
import { readCardStage } from '@/lib/member-cards/stage'
import { isCrewMember, listMyCards, readCardStats, readMemberFace } from '@/lib/member-cards/store'
import { readBadgeState } from '@/lib/devices/badges'
import { loadRootSpaceId } from '@/lib/spaces/store'
import { parseVcard } from '@/lib/vcard'

// THE ONE CREW CARD (LIVE-1282, ADR-1874). A member has a single card: its face editor, its cards and the
// ask for one. It renders the same on My card (/crew/card) and at the top of a Space's Check in page, so a
// Crew member who opens a Space manages one card in both places. The business half (door code, readers,
// the Space's own card) is role based and sits beside it where the viewer manages a Space. Returns null
// for a viewer with no handle. Copy obeys CONTENT-VOICE: plain, no em dashes.

export async function MyCardSection({ profileId }: { profileId: string }) {
  const supabase = await createClient()
  const { data: me } = await supabase
    .from('profiles')
    .select('handle, display_name, avatar_url, vcard')
    .eq('id', profileId)
    .maybeSingle()
  if (!me?.handle) return null

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
