import Link from 'next/link'
import { Hash } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'

// A page-layout module (ADR-270): public channels to browse. Self-fetching RSC;
// returns null when there's nothing to show. Public channels only.
export async function PopularChannels() {
  const db = createAdminClient()
  const { data, error } = await db
    .from('channels')
    .select('id, name')
    .eq('is_public', true)
    .limit(6)

  if (error || !data || data.length === 0) return null

  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <p className="text-2xs font-semibold uppercase tracking-wide text-subtle">Channels</p>
      <ul className="mt-3 space-y-1">
        {data.map((channel) => (
          <li key={channel.id}>
            <Link
              href={`/channels/${channel.id}`}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-text hover:bg-border"
            >
              <Hash className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
              <span className="truncate">{channel.name}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
