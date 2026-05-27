import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { ArrowLeft, Zap, Megaphone } from 'lucide-react'
import { relativeTime, getInitials } from '@/lib/utils'
import { DispatchBody } from './dispatch-body'

interface Props {
  params: Promise<{ id: string }>
}

export default async function DispatchDetailPage({ params }: Props) {
  const { id } = await params
  const admin = createAdminClient()

  const { data: dispatch } = await admin
    .from('dispatches')
    .select(`
      id, title, body, audience_scope, audience_id, status, published_at, created_at,
      author:profiles!author_id ( id, display_name, avatar_url, community_role ),
      linked_task:crew_tasks!linked_task_id ( id, name, points_value, task_type )
    `)
    .eq('id', id)
    .eq('status', 'published')
    .maybeSingle()

  if (!dispatch) notFound()

  // Get the audience name
  const admin2 = createAdminClient()
  let audienceName = ''
  if (dispatch.audience_scope === 'circle') {
    const { data } = await admin2.from('circles').select('name').eq('id', dispatch.audience_id).maybeSingle()
    audienceName = data?.name ?? ''
  } else if (dispatch.audience_scope === 'hub') {
    const { data } = await admin2.from('hubs').select('name').eq('id', dispatch.audience_id).maybeSingle()
    audienceName = data?.name ?? ''
  } else if (dispatch.audience_scope === 'nexus') {
    const { data } = await admin2.from('nexuses').select('name').eq('id', dispatch.audience_id).maybeSingle()
    audienceName = data?.name ?? ''
  }

  const author     = dispatch.author as any
  const linkedTask = dispatch.linked_task as any
  const pubDate    = new Date(dispatch.published_at ?? dispatch.created_at)

  return (
    <div className="px-6 py-8 max-w-2xl mx-auto">

      {/* Back */}
      <Link
        href="/broadcast"
        className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-indigo-500 transition-colors mb-8"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to Broadcast
      </Link>

      {/* ── DISPATCH HEADER — street-team aesthetic ──────── */}
      <article>
        {/* Eyebrow */}
        <div className="flex items-center gap-3 mb-4">
          <div className="flex items-center gap-1.5">
            <Megaphone className="w-4 h-4 text-indigo-500" />
            <span className="text-xs font-black uppercase tracking-[0.15em] text-indigo-500">
              {dispatch.audience_scope} dispatch
            </span>
          </div>
          {audienceName && (
            <>
              <span className="text-gray-300 dark:text-gray-700">·</span>
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">{audienceName}</span>
            </>
          )}
        </div>

        {/* Title — heavy, zine-style */}
        <h1 className="text-4xl font-black leading-[1.1] text-gray-900 dark:text-gray-50 mb-5">
          {dispatch.title}
        </h1>

        {/* Thick rule — mimics a torn newspaper column line */}
        <div className="flex items-center gap-3 mb-5">
          <div className="h-[3px] w-12 bg-indigo-500 rounded-full" />
          <div className="h-[3px] flex-1 bg-gray-100 dark:bg-gray-800 rounded-full" />
        </div>

        {/* Author + date */}
        <div className="flex items-center gap-3 mb-8">
          {author?.avatar_url ? (
            <img src={author.avatar_url} alt={author.display_name} className="w-8 h-8 rounded-full object-cover" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-950 flex items-center justify-center text-xs font-bold text-indigo-600 dark:text-indigo-400">
              {getInitials(author?.display_name ?? '?')}
            </div>
          )}
          <div>
            <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">{author?.display_name}</p>
            <p className="text-[11px] text-gray-400">
              {pubDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              {' · '}
              {relativeTime(dispatch.published_at ?? dispatch.created_at)}
            </p>
          </div>
        </div>

        {/* ── Body (markdown rendered) ───────────────────── */}
        <DispatchBody body={dispatch.body} />

        {/* ── Linked Challenge CTA ───────────────────────── */}
        {linkedTask && (
          <div className="mt-10 rounded-xl border-2 border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/20 px-5 py-4">
            <div className="flex items-center gap-2 mb-1">
              <Zap className="w-4 h-4 text-amber-500" />
              <span className="text-xs font-black uppercase tracking-[0.12em] text-amber-600 dark:text-amber-400">
                Challenge linked to this dispatch
              </span>
            </div>
            <p className="text-sm font-bold text-gray-900 dark:text-gray-50 mb-1">{linkedTask.name}</p>
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500 capitalize">{linkedTask.task_type}</span>
              <div className="flex items-center gap-2">
                <span className="text-sm font-black text-amber-500">{linkedTask.points_value} pts</span>
                <Link
                  href="/crew"
                  className="inline-flex items-center gap-1 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-600 transition-colors"
                >
                  Complete challenge →
                </Link>
              </div>
            </div>
          </div>
        )}
      </article>
    </div>
  )
}
