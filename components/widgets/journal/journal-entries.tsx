import Link from 'next/link'
import Image from 'next/image'
import { NotebookPen, Camera, PenLine } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { relativeTime } from '@/lib/utils'

// Your Journal — the daily-log face of Capture (§6 Phase 3, ADR-155/156). The feed is the
// community's record of lived experience; this is *your* slice of it, your captured moments
// grouped by day. Reads your own posts (notes / photos / posts) — no new store; a Note is just
// post_type='note' on the posts substrate.

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

function dayLabel(iso: string): string {
  const d = new Date(iso)
  const diff = Math.round((startOfDay(new Date()) - startOfDay(d)) / 86_400_000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
}

type Entry = { id: string; body: string | null; media_urls: string[] | null; post_type: string; created_at: string }

// Journal layout module (ADR-270/294): the member's captured moments grouped by day, newest first
// (the feed as a journal). A self-fetching RSC keyed only on the viewer, so it is a clean standalone
// block; renders nothing for a logged-out viewer (the module contract). The first-capture empty
// state is intentionally part of the block, so an operator who places it always shows a member their
// next step, never a blank surface.
export async function JournalEntries() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('id').eq('auth_user_id', user.id).maybeSingle()
  if (!profile) return null

  const admin = createAdminClient()
  const { data } = await admin
    .from('posts')
    .select('id, body, media_urls, post_type, created_at')
    .eq('author_id', profile.id)
    .is('parent_id', null)
    .is('hidden_at', null)
    .order('created_at', { ascending: false })
    .limit(60)

  const entries = (data ?? []) as Entry[]

  if (entries.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-surface p-8 text-center">
        <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-broadcast-bg text-broadcast-strong">
          <Camera className="h-6 w-6" aria-hidden />
        </span>
        <p className="text-sm font-semibold text-text">Nothing captured yet</p>
        <p className="mx-auto mt-1 max-w-xs text-sm text-muted">
          Tap <strong className="text-text">Capture</strong> to log your first moment: a photo, a note, a hello.
        </p>
      </div>
    )
  }

  // Group consecutive entries by calendar day, preserving recency order.
  const days: { label: string; items: Entry[] }[] = []
  for (const e of entries) {
    const label = dayLabel(e.created_at)
    const last = days[days.length - 1]
    if (last && last.label === label) last.items.push(e)
    else days.push({ label, items: [e] })
  }

  return (
    <div className="space-y-6">
      {days.map((day) => (
        <section key={day.label}>
          <h2 className="mb-2 px-1 text-xs font-bold uppercase tracking-wide text-subtle">{day.label}</h2>
          <ul className="space-y-2">
            {day.items.map((e) => {
              const hasPhoto = (e.media_urls?.length ?? 0) > 0
              const Icon = e.post_type === 'note' ? NotebookPen : hasPhoto ? Camera : PenLine
              return (
                <li key={e.id} className="flex gap-3 rounded-2xl border border-border bg-surface p-3">
                  <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-broadcast-bg text-broadcast-strong">
                    <Icon className="h-3.5 w-3.5" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-2xs font-medium uppercase tracking-wide text-subtle">
                      {relativeTime(e.created_at)}
                    </p>
                    {e.body && <p className="mt-0.5 whitespace-pre-wrap text-sm text-text">{e.body}</p>}
                    {hasPhoto && (
                      <div className="mt-2 overflow-hidden rounded-xl border border-border">
                        <Image
                          src={e.media_urls![0]}
                          alt=""
                          width={480}
                          height={320}
                          className="max-h-56 w-full object-cover"
                        />
                      </div>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
      <p className="px-1 text-center text-xs text-subtle">
        Your journal lives in the <Link href="/feed" className="text-primary-strong hover:underline">community’s feed</Link> too. Your record is part of the story.
      </p>
    </div>
  )
}
