import { createAdminClient } from '@/lib/supabase/admin'

// A page-layout module (ADR-270): the latest profiles to join. Self-fetching RSC;
// returns null when there's nothing to show. Public profile data only.
export async function NewestMembers() {
  const db = createAdminClient()
  const { data, error } = await db
    .from('profiles')
    .select('id, display_name, handle, avatar_url')
    .order('created_at', { ascending: false })
    .limit(6)

  if (error || !data || data.length === 0) return null

  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <p className="text-2xs font-semibold uppercase tracking-wide text-subtle">Newest members</p>
      <ul className="mt-3 space-y-2">
        {data.map((member) => {
          const name = member.display_name || member.handle || 'Member'
          return (
            <li key={member.id} className="flex items-center gap-2">
              {member.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={member.avatar_url}
                  alt=""
                  className="h-7 w-7 shrink-0 rounded-full object-cover"
                />
              ) : (
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-border text-2xs font-semibold uppercase text-muted">
                  {name.slice(0, 1)}
                </span>
              )}
              <span className="truncate text-xs text-text">{name}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
