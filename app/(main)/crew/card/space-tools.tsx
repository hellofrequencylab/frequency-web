import { Suspense } from 'react'
import Link from 'next/link'
import { SectionHeader } from '@/components/ui/section-header'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/server'
import { getSpaceById } from '@/lib/spaces/store'
import { MemberCardsSection } from '@/app/(main)/spaces/[slug]/settings/checkin/member-cards-section'

// THE BUSINESS HALF OF MY CARD (LIVE-1302, owner ruling 2026-10-22: "One editor, business extras"). A Crew
// member who runs a Space gets that Space's own card here, with the same editor, cardholder perk and
// per-card switches as the Space's Check in "Cards" page, so the card reads the same in either place.
// The door tools (door code, Regulars, card readers) stay on Check in, one link away. A member who runs
// no Space sees nothing here: the Crew version only. Copy obeys CONTENT-VOICE: plain, no em dashes.

export async function SpaceTools({ profileId }: { profileId: string }) {
  const supabase = await createClient()
  const { data } = await supabase.from('spaces').select('id').eq('owner_profile_id', profileId).order('name').limit(3)
  const spaces = (await Promise.all((data ?? []).map((s) => getSpaceById(s.id)))).filter((s) => s !== null)
  if (spaces.length === 0) return null

  return (
    <div className="space-y-10">
      {spaces.map((space) => (
        <section key={space.id} className="space-y-3">
          <SectionHeader title={space.brandName ?? space.name} />
          <Suspense fallback={<div className="h-64 animate-pulse rounded-card bg-surface-elevated/50" />}>
            <MemberCardsSection space={space} staffViewing={false} />
          </Suspense>
          <Button asChild size="sm" variant="secondary">
            <Link href={`/spaces/${space.slug}/settings/offerings?tab=checkin`}>Door code, Regulars and readers</Link>
          </Button>
        </section>
      ))}
    </div>
  )
}
