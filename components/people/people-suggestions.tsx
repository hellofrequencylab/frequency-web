import { createAdminClient } from '@/lib/supabase/admin'
import { SectionHeader } from '@/components/ui/section-header'
import { PersonCard } from '@/components/cards/person-card'
import { isOnline } from '@/lib/presence'
import { getPeopleSuggestions, suggestionReason } from '@/lib/people-suggestions'

// "People you may know" — Community directory section (BUILD-LIST P5). A small
// lane of members the viewer isn't connected to yet, ranked by REAL signals only
// (shared active circles, mutual accepted connections — lib/people-suggestions).
// Every card carries its honest "why" line; with no genuine suggestions it
// renders nothing at all (no empty state). Designed to sit behind <Suspense>
// (PAGE-FRAMEWORK §5) so the graph queries never block the directory shell.
export async function PeopleSuggestions({ authUserId }: { authUserId: string }) {
  const admin = createAdminClient()
  const { data: me } = await admin
    .from('profiles')
    .select('id')
    .eq('auth_user_id', authUserId)
    .maybeSingle()
  if (!me) return null

  const suggestions = await getPeopleSuggestions(me.id, 6)
  if (suggestions.length === 0) return null

  return (
    <section aria-label="People you may know" className="mb-8">
      <SectionHeader title="People you may know" count={suggestions.length} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {suggestions.map((s) => (
          <PersonCard
            key={s.id}
            handle={s.handle}
            displayName={s.displayName}
            avatarUrl={s.avatarUrl}
            online={isOnline(s.lastSeenAt)}
            meta={<span className="text-muted">{suggestionReason(s)}</span>}
          />
        ))}
      </div>
    </section>
  )
}
