import { notFound } from 'next/navigation'
import { CreditCard, Nfc } from 'lucide-react'
import { FocusTemplate } from '@/components/templates'
import { EmptyState } from '@/components/ui/empty-state'
import { requireProfileId } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { memberCardsEnabled } from '@/lib/member-cards/store'
import { MyCardSection } from '@/components/member-cards/my-card-section'
import { SpaceTools } from './space-tools'

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
  const { data: me } = await supabase.from('profiles').select('handle').eq('id', profileId).maybeSingle()
  if (!me?.handle) notFound()

  return (
    <Shell>
      <div className="space-y-8">
        <MyCardSection profileId={profileId} />
        <SpaceTools profileId={profileId} />
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
