import Link from 'next/link'
import { Store } from 'lucide-react'
import { SectionHeader } from '@/components/ui/section-header'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/server'

// SPACE TOOLS ON MY CARD. A Crew member who runs a Space has one card, this one. The business half of it
// (door tag, card readers, Regulars, the Space's own card face) is the Space's Check in page, so this
// section opens that page for each Space the member owns instead of keeping a second card in two places.
// Renders nothing for a member who owns no Space. Copy obeys CONTENT-VOICE: plain, no em dashes.

export async function SpaceTools({ profileId }: { profileId: string }) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('spaces')
    .select('slug, name, brand_name')
    .eq('owner_profile_id', profileId)
    .order('name')
    .limit(10)
  const spaces = data ?? []
  if (spaces.length === 0) return null

  return (
    <section>
      <SectionHeader title="Your Space" count={spaces.length} />
      <p className="mb-3 text-body-sm text-muted">
        This is the same card, with the business tools added. Set the door tag, card readers and your Space card from Check in.
      </p>
      <ul className="space-y-2">
        {spaces.map((s) => (
          <li key={s.slug} className="flex items-center gap-3 rounded-card border border-border bg-surface px-3 py-2.5">
            <Store aria-hidden className="h-5 w-5 shrink-0 text-muted" />
            <p className="min-w-0 grow truncate text-body-sm font-bold text-text">{s.brand_name || s.name}</p>
            <Button asChild size="sm" variant="secondary">
              <Link href={`/spaces/${s.slug}/settings/offerings?tab=checkin`}>Open Check in</Link>
            </Button>
          </li>
        ))}
      </ul>
    </section>
  )
}
