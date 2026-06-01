import { notFound } from 'next/navigation'
import Image from 'next/image'
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
  post:      'bg-surface-elevated text-muted dark:bg-surface-elevated dark:text-subtle',
  poll:      'bg-signal-bg text-signal-strong',
  challenge: 'bg-warning-bg text-warning dark:bg-warning-bg dark:text-warning',
  article:   'bg-primary-bg text-primary-strong dark:bg-primary-bg dark:text-primary-strong',
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
      .is('hidden_at', null)
      .maybeSingle(),
    user
      ? admin.from('profiles').select('id').eq('auth_user_id', user.id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const dispatch = dispatchRes.data
  if (!dispatch) notFound()

  const myProfileId = myProfileRes.data?.id ?? null

  // Audience name, likes, comments, poll options. All parallel
  const [audienceRes, likesRes, myLikeRes, commentsRes, pollOptionsRes] = await Promise.all([
    (async () => {
      const table: 'circles' | 'hubs' | 'nexuses' =
        dispatch.audience_scope === 'circle' ? 'circles' :
        dispatch.audience_scope === 'hub'    ? 'hubs'    : 'nexuses'
      const { data } = await admin.from(table).select('name').eq('id', dispatch.audience_id).maybeSingle()
      return data?.name ?? ''
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

  const audienceName = audienceRes as string
  const likeCount  = likesRes.count ?? 0
  const hasLiked   = !!myLikeRes.data
  const comments   = (commentsRes.data ?? []) as unknown as {
    id: string
    body: string
    created_at: string
    author: { id: string; display_name: string; handle: string; avatar_url: string | null }
  }[]
  const rawOptions = (pollOptionsRes.data ?? []) as unknown as {
    id: string
    label: string
    position: number
    dispatch_poll_votes: { count: number }[]
  }[]

  // Resolve poll vote count and user's vote
  const pollOptions = rawOptions.map((o) => ({
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
      .in('option_id', pollOptions.map((o) => o.id))
      .maybeSingle()
    myVotedOptionId = myVote?.option_id ?? null
  }

  const author     = dispatch.author as unknown as { display_name: string; avatar_url: string | null } | null
  const linkedTask = dispatch.linked_task as unknown as { name: string; task_type: string; zaps_value: number } | null
  const pubDate    = new Date(dispatch.published_at ?? dispatch.created_at)
  const dispType   = dispatch.dispatch_type ?? 'post'

  return (
    <div>

      {/* Back */}
      <Link
        href="/broadcast"
        className="inline-flex items-center gap-1.5 text-xs text-subtle hover:text-primary-strong transition-colors mb-8"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to Broadcast
      </Link>

      {/* ── DISPATCH HEADER ─────────────────────────────────── */}
      <article>
        {/* Eyebrow */}
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <div className="flex items-center gap-1.5">
            <Megaphone className="w-4 h-4 text-primary-strong" />
            <span className="text-xs font-black uppercase tracking-[0.15em] text-primary-strong">
              {dispatch.audience_scope} dispatch
            </span>
          </div>
          {audienceName && (
            <>
              <span className="text-subtle/60">·</span>
              <span className="text-xs font-semibold text-muted">{audienceName}</span>
            </>
          )}
          <span className={`text-[11px] px-2 py-0.5 rounded-md font-semibold ${TYPE_COLORS[dispType]}`}>
            {TYPE_LABELS[dispType] ?? dispType}
          </span>
        </div>

        {/* Title */}
        <h1 className="text-4xl font-black leading-[1.1] text-text mb-5">
          {dispatch.title}
        </h1>

        {/* Rule */}
        <div className="flex items-center gap-3 mb-5">
          <div className="h-[3px] w-12 bg-primary rounded-full" />
          <div className="h-[3px] flex-1 bg-surface-elevated rounded-full" />
        </div>

        {/* Author + date */}
        <div className="flex items-center gap-3 mb-8">
          {author?.avatar_url ? (
            <Image src={author.avatar_url} alt={author.display_name} width={32} height={32} className="w-8 h-8 rounded-full object-cover" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-primary-bg flex items-center justify-center text-xs font-bold text-primary-strong">
              {getInitials(author?.display_name ?? '?')}
            </div>
          )}
          <div>
            <p className="text-xs font-semibold text-text">{author?.display_name}</p>
            <p className="text-[11px] text-subtle">
              {pubDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              {' · '}
              {relativeTime(dispatch.published_at ?? dispatch.created_at)}
            </p>
          </div>
        </div>

        {/* Body */}
        <DispatchBody body={dispatch.body} />

        {/* Poll voting. Only when type=poll and options exist */}
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
          <div className="mt-10 rounded-2xl border-2 border-warning bg-warning-bg/20 shadow-sm px-5 py-4">
            <div className="flex items-center gap-2 mb-1">
              <Zap className="w-4 h-4 text-primary" />
              <span className="text-xs font-black uppercase tracking-[0.12em] text-warning">
                Challenge linked to this dispatch
              </span>
            </div>
            <p className="text-sm font-bold text-text mb-1">{linkedTask.name}</p>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted capitalize">{linkedTask.task_type}</span>
              <div className="flex items-center gap-2">
                <span className="text-sm font-black text-primary">{linkedTask.zaps_value} zaps</span>
                <Link
                  href="/crew"
                  className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-white hover:bg-primary-hover transition-colors"
                >
                  Complete challenge →
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* ── Engagement bar ───────────────────────────────── */}
        <div className="mt-10 pt-6 border-t border-border">
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
