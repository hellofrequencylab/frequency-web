import Link from 'next/link'
import { Zap } from 'lucide-react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'

// One quiet line in the stream (ADR-231): Vera's system announcements ("X joined
// through Y") render like a group-chat join notice — centered bare text, no card,
// no author chrome, no reaction row. Async server component: it looks up the live
// season Zap count for every member the line mentions, so the notice doubles as a
// tiny scoreboard — the newcomer sees the currency exists, the inviter gets public
// credit next to their number.
export async function SystemLine({ body }: { body: string | null }) {
  if (!body) return null

  const handles = [...body.matchAll(/@([a-zA-Z0-9_]+)/g)].map((m) => m[1])
  let zapsByHandle = new Map<string, number>()
  if (handles.length > 0) {
    const admin = createAdminClient() as unknown as SupabaseClient
    const { data } = await admin
      .from('profiles')
      .select('handle, current_season_zaps')
      .in('handle', handles)
    zapsByHandle = new Map(
      ((data ?? []) as { handle: string; current_season_zaps: number | null }[]).map((p) => [
        p.handle,
        Number(p.current_season_zaps ?? 0),
      ]),
    )
  }

  const parts = body.split(/(@[a-zA-Z0-9_]+)/g)
  return (
    <div className="flex justify-center px-4 py-1 text-center">
      <p className="text-xs leading-relaxed text-muted">
        {parts.map((part, i) => {
          if (!part.startsWith('@')) return <span key={i}>{part}</span>
          const handle = part.slice(1)
          const zaps = zapsByHandle.get(handle)
          return (
            <span key={i} className="whitespace-nowrap">
              <Link
                href={`/people/${handle}`}
                className="font-semibold text-text hover:underline"
              >
                {handle}
              </Link>
              {zaps !== undefined && (
                <span className="ml-1 inline-flex items-center gap-0.5 align-[-1px] text-2xs font-bold text-primary">
                  <Zap className="h-3 w-3 fill-current" aria-hidden />
                  {zaps}
                </span>
              )}
            </span>
          )
        })}
      </p>
    </div>
  )
}
