// The member-facing referral + Circle-starter contest hub (Beta phase P3). Your
// invite link, your count + progress, the leaderboard, and how close you are to the
// Founding-Member perk. Composes the kit (DashboardTemplate + StatCard + SectionHeader
// + EmptyState). The whole surface is INERT behind platform_flags.beta_referral_contest:
// when the contest is off, the route 404s (it does not exist for members yet).

import { notFound, redirect } from 'next/navigation'
import Image from 'next/image'
import { Gift, Sparkles, Trophy, Users, Zap } from 'lucide-react'
import { DashboardTemplate } from '@/components/templates/dashboard-template'
import { StatCard } from '@/components/ui/stat-card'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import { ProgressTrack } from '@/components/ui/progress-track'
import { getCallerProfile } from '@/lib/auth'
import {
  betaReferralContestEnabled,
  getContestLeaderboard,
  getMemberContestProgress,
  CIRCLE_STARTER_THRESHOLD,
  FOUNDING_PERK_MIN_REFERRALS,
  type ContestLeaderboardRow,
} from '@/lib/beta/referral-contest'
import { getInviteLink } from '@/app/(main)/invite-actions'
import { ReferralLinkCard } from './copy-link'
import { avatarSrc, avatarFocusStyle } from '@/lib/images/avatar-focus'

export const dynamic = 'force-dynamic'

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const chars = (parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')
  return (chars || name.slice(0, 2) || '??').toUpperCase()
}

export default async function ReferralHubPage() {
  // INERT until the operator turns the contest on. No flag = no page.
  if (!(await betaReferralContestEnabled())) notFound()

  const me = await getCallerProfile()
  if (!me) redirect('/sign-in?next=/referral')

  const [progress, leaderboard, invite] = await Promise.all([
    getMemberContestProgress(me.id),
    getContestLeaderboard(25),
    getInviteLink(),
  ])
  const inviteUrl = 'url' in invite ? invite.url : null

  const foundingCopy = progress.foundingPerkEarned
    ? 'You earned Founding-Member perks. Nice work.'
    : `${progress.toFoundingPerk} more activated ${
        progress.toFoundingPerk === 1 ? 'friend' : 'friends'
      } to earn Founding-Member perks.`

  return (
    <DashboardTemplate
      eyebrow="Beta contest"
      title="Bring people in"
      description="Invite friends and start Circles. Every friend who takes a real first action counts, and every Circle you grow to ten members counts. The top referrers win free membership when we open the doors."
      stats={
        <>
          <StatCard label="Activated invites" value={progress.activatedReferrals} icon={Users} />
          <StatCard
            label="Circles started"
            value={progress.circleStarts}
            icon={Sparkles}
            detail={`${CIRCLE_STARTER_THRESHOLD}+ active members each`}
          />
          <StatCard label="Contest score" value={progress.score} icon={Zap} />
          <StatCard
            label="Your rank"
            value={progress.rank ? `#${progress.rank}` : 'Not yet'}
            icon={Trophy}
          />
        </>
      }
    >
      <div className="space-y-8">
        <ReferralLinkCard url={inviteUrl} />

        {/* Progress toward the Founding-Member perk (3+ activated invites). */}
        <div className="rounded-2xl border border-border bg-surface p-4 lift-1">
          <h2 className="flex items-center gap-2 text-body-sm font-bold text-text">
            <Gift className="h-4 w-4 text-primary-strong" aria-hidden /> Founding-Member perks
          </h2>
          <p className="mt-1 text-body-sm text-muted">{foundingCopy}</p>
          <ProgressTrack
            value={progress.activatedReferrals}
            max={FOUNDING_PERK_MIN_REFERRALS}
            size="lg"
            animate
            className="mt-3 w-full"
            label={`${progress.activatedReferrals} of ${FOUNDING_PERK_MIN_REFERRALS} referrals toward the Founding-Member perks`}
          />
          {progress.pendingReferrals > 0 && (
            <p className="mt-2 text-meta text-subtle">
              {progress.pendingReferrals} invited{' '}
              {progress.pendingReferrals === 1 ? 'person has' : 'people have'} not taken a first
              action yet. Only activated invites count.
            </p>
          )}
        </div>

        {/* The leaderboard. */}
        <section>
          <SectionHeader title="Leaderboard" count={leaderboard.length || undefined} />
          {leaderboard.length === 0 ? (
            <EmptyState
              icon={Trophy}
              title="No one on the board yet"
              description="Be the first. Share your link and start a Circle to take the lead."
            />
          ) : (
            <ol className="space-y-1.5">
              {leaderboard.map((row) => (
                <LeaderRow key={row.profileId} row={row} isMe={row.profileId === me.id} />
              ))}
            </ol>
          )}
        </section>
      </div>
    </DashboardTemplate>
  )
}

function LeaderRow({ row, isMe }: { row: ContestLeaderboardRow; isMe: boolean }) {
  const medal = row.rank === 1 ? '🥇' : row.rank === 2 ? '🥈' : row.rank === 3 ? '🥉' : null
  return (
    <li
      className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 ${
        isMe ? 'bg-primary-bg ring-1 ring-primary/30' : 'bg-surface-elevated/50'
      }`}
    >
      <span className="w-8 shrink-0 text-center text-body-sm font-bold tabular-nums text-muted">
        {medal ?? `#${row.rank}`}
      </span>
      {row.avatarUrl ? (
        <Image
          src={avatarSrc(row.avatarUrl)}
          alt={row.displayName}
          width={36}
          height={36}
          className="h-9 w-9 shrink-0 rounded-pill object-cover"
          style={avatarFocusStyle(row.avatarUrl)}
        />
      ) : (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-pill bg-primary-bg text-meta font-semibold text-primary-strong">
          {initials(row.displayName)}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-body-sm font-semibold text-text">
          {row.displayName}
          {isMe && <span className="ml-1.5 text-meta font-medium text-primary-strong">You</span>}
        </p>
        <p className="truncate text-meta text-subtle">
          {row.activatedReferrals} invited · {row.circleStarts} Circle
          {row.circleStarts === 1 ? '' : 's'}
        </p>
      </div>
      <span className="shrink-0 text-body-sm font-bold tabular-nums text-text">{row.score}</span>
    </li>
  )
}
