import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { ArrowLeft, Zap, Megaphone } from 'lucide-react'
import { relativeTime, getInitials } from '@/lib/utils'
import { DispatchBody } from './dispatch-body'
import { LikeButton } from './like-button'
import { CommentSection } from './comment-section'
import { PollSection } from './poll-section'

interface Props {
  params: Promise<{ id: string }>
}

const TYPE_LABELS: Record<string, string> = {
  post:      'Post',
  poll:      'Poll',
  challenge: 'Challenge',
  article:   'Article',
}

const TYPE_COLORS: Record<string, string> = {
  post:      'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
  poll:      'bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-300',
  challenge: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  article:   'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300',
}

export default async function DispatchDetailPage({ params }: Props) {
  const { id } = await params
  const admin   = createAdminClient()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [dispatchRes, myProfileRes] = await Promise.all([
    admin
      .from('dispatches')
      .select(`
        id, title, body, audience_scope, audience_id, status, dispatch_type, published_at, created_at,
        author:profiles!author_id ( id, display_name, handle, avatar_url, community_role ),
        linked_task:crew_tasks!linked_task_id ( id, name, zaps_value, task_type )
      `)
      .eq('id', id)
      .eq('status', 'published')
      .maybeSingle(),
    user
      ? admin.from('profiles').select('id').eq('auth_user_id', user.id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const dispatch = dispatchRes.data
  if (!dispatch) notFound()

  const myProfileId = myProfileRes.data?.id ?? null

  // Audience name, likes, comments, poll options — all parallel
  let audienceName = ''
  const [_audience, likesRes, myLikeRes, commentsRes, pollOptionsRes] = await Promise.all([
    (async () => {
      const table =
        dispatch.audience_scope === 'circle' ? 'circles' :
        dispatch.audience_scope === 'hub'    ? 'hubs'    : 'nexuses'
      const { data } = await admin.from(table as any).select('name').eq('id', dispatch.audience_id).maybeSingle()
      audienceName = (data as any)?.name ?? ''
    })(),
    admin.from('dispatch_likes').select('id', { count: 'exact', head: true }).eq('dispatch_id', id),
    myProfileId
      ? admin.from('dispatch_likes').select('id').eq('dispatch_id', id).eq('profile_id', myProfileId).maybeSingle()
      : Promise.resolve({ data: null }),
    admin
      .from('dispatch_comments')
      .select(`id, body, created_at, author:profiles!author_id ( id, display_name, handle, avatar_url )`)
      .eq('dispatch_id', id)
      .order('created_at', { ascending: true })
      .limit(100),
    dispatch.dispatch_type === 'poll'
      ? admin
          .from('dispatch_poll_options')
          .select('id, label, position, dispatch_poll_votes(count)')
          .eq('dispatch_id', id)
          .order('position')
      : Promise.resolve({ data: [] }),
  ])

  const likeCount  = likesRes.count ?? 0
  const hasLiked   = !!myLikeRes.data
  const comments   = (commentsRes.data ?? []) as any[]
  const rawOptions = (pollOptionsRes.data ?? []) as any[]

  // Resolve poll vote count and user's vote
  const pollOptions = rawOptions.map((o: any) => ({
    id:        o.id,
    label:     o.label,
    position:  o.position,
    voteCount: (o.dispatch_poll_votes?.[0]?.count ?? 0) as number,
  }))

  let myVotedOptionId: string | null = null
  if (myProfileId && pollOptions.length > 0) {
    const { data: myVote } = await admin
      .from('dispatch_poll_votes')
      .select('option_id')
      .eq('profile_id', myProfileId)
      .in('option_id', pollOptions.map((o: any) => o.id))
      .maybeSingle()
    myVotedOptionId = myVote?.option_id ?? null
  }

  const author     = dispatch.author as any
  const linkedTask = dispatch.linked_task as any
  const pubDate    = new Date(dispatch.published_at ?? dispatch.created_at)
  const dispType   = dispatch.dispatch_type ?? 'post'

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

      {/* ── DISPATCH HEADER ─────────────────────────────────── */}
      <article>
        {/* Eyebrow */}
        <div className="flex items-center gap-3 mb-4 flex-wrap">
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
          <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${TYPE_COLORS[dispType]}`}>
            {TYPE_LABELS[dispType] ?? dispType}
          </span>
        </div>

        {/* Title */}
        <h1 className="text-4xl font-black leading-[1.1] text-gray-900 dark:text-gray-50 mb-5">
          {dispatch.title}
        </h1>

        {/* Rule */}
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

        {/* Body */}
        <DispatchBody body={dispatch.body} />

        {/* Poll voting — only when type=poll and options exist */}
        {dispType === 'poll' && pollOptions.length > 0 && (
          <PollSection
            dispatchId={id}
            options={pollOptions}
            myVotedOptionId={myVotedOptionId}
            isLoggedIn={!!myProfileId}
          />
        )}

        {/* Linked Challenge CTA */}
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
                <span className="text-sm font-black text-amber-500">{(linkedTask as any).zaps_value} zaps</span>
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

        {/* ── Engagement bar ───────────────────────────────── */}
        <div className="mt-10 pt-6 border-t border-gray-100 dark:border-gray-800">
          <LikeButton
            dispatchId={id}
            initialCount={likeCount}
            initialLiked={hasLiked}
            isLoggedIn={!!myProfileId}
          />
        </div>

        {/* ── Comments ─────────────────────────────────────── */}
        <div className="mt-8">
          <CommentSection
            dispatchId={id}
            comments={comments}
            myProfileId={myProfileId}
          />
        </div>
      </article>
    </div>
  )
}
