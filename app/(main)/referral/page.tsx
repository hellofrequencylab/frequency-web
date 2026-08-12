// The member-facing referral + Circle-starter contest hub (Beta phase P3). Your
// invite link, your counts, what each one pays, and the leaderboard. Composes the kit
// (DashboardTemplate + StatCard + SectionHeader + EmptyState). The whole surface is
// INERT behind platform_flags.beta_referral_contest: when the contest is off, the route
// 404s (it does not exist for members yet).
//
// THE PAGE ONLY CLAIMS WHAT THE CODE DOES (owner ruling, 2026-08-12). TWO published
// prizes came down under that ruling, both for the same reason: the code that granted
// them was deleted with the beta program.
//   1. The free-membership prize for the top referrers (awardReferralWinners, reached
//      only from the deleted lib/beta/graduation.ts).
//   2. The Founding-Member perk at 3 activated invites. reward_kind 'founding_perk' had
//      zero writers left in the repo, so the card, the progress bar, and the
//      foundingPerkEarned / toFoundingPerk fields behind them are gone too.
// Nothing was owed either time: the flag is FALSE in production, beta_referrals holds 0
// rows, and reward_grants holds 0 founding_perk rows.
//
// What remains is what still pays out for real, and the numbers come from the code that
// grants them: ZAP_AMOUNTS.referral_activated per activated invite (lib/zaps) and
// CIRCLE_STARTER_ZAPS per Circle-starter milestone, plus the leaderboard standing. Do
// not restate a reward on this page unless a live code path grants it.

import { notFound, redirect } from 'next/navigation'
import Image from 'next/image'
import { Sparkles, Trophy, Users, Zap } from 'lucide-react'
import { DashboardTemplate } from '@/components/templates/dashboard-template'
import { StatCard } from '@/components/ui/stat-card'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import { getCallerProfile } from '@/lib/auth'
import { ZAP_AMOUNTS } from '@/lib/zaps'
import {
  betaReferralContestEnabled,
  getContestLeaderboard,
  getMemberContestProgress,
  CIRCLE_STARTER_THRESHOLD,
  CIRCLE_STARTER_ZAPS,
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

  return (
    <DashboardTemplate
      eyebrow="Beta contest"
      title="Bring people in"
      description="Invite friends and start Circles. Both pay Zaps, and the leaderboard shows where everyone stands."
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

        {/* What the contest pays. Every number here reads from the constant the granting
            code uses, so the copy cannot claim a payout the ledger does not make. */}
        <div className="rounded-card border border-border bg-surface p-4 lift-1">
          <h2 className="flex items-center gap-2 text-body-sm font-bold text-text">
            <Zap className="h-4 w-4 text-primary-strong" aria-hidden /> What you earn
          </h2>
          <ul className="mt-2 space-y-1.5 text-body-sm text-muted">
            <li>
              <span className="font-semibold text-text">
                {ZAP_AMOUNTS.referral_activated} Zaps
              </span>{' '}
              for every friend who joins and takes a real first action.
            </li>
            <li>
              <span className="font-semibold text-text">{CIRCLE_STARTER_ZAPS} Zaps</span> when a
              Circle you started reaches {CIRCLE_STARTER_THRESHOLD} active members.
            </li>
          </ul>
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
