import Link from 'next/link'
import { FqIcon, type FqIconName } from '@/components/frequency/icon'
import { MembersBody } from '@/components/frequency/members/shared/members-body'
import { createClient } from '@/lib/supabase/server'
import { getVaultData } from '@/lib/vault/vault-data'
import { getCurrentSeason } from '@/lib/seasons'
import { getPracticeStreak } from '@/lib/practice-streak'
import { ledgerLabel } from '@/lib/economy/ledger'
import { RANK_LABELS, RANK_ORDER, rankIndex } from '@/lib/season-ranks'
import { getAchievementsData } from '@/app/(main)/crew/gamification-actions'
import { getTrophyCase } from '@/lib/quest/trophies'
import { TrophyCase } from '@/components/quest/trophy-case'
import { VaultStore } from '@/components/widgets/vault/vault-store'

// THE VAULT under Frequency (design_handoff/frequency/templates/members/The Vault.html):
//
//   head        You · The Vault / the season and the days left in it
//   three tiles Zaps this season (and the Gems they roll into), spendable Gems, the practice streak
//   columns     where this season's Zaps came from · how you earn (the live zap_config / gem_config) ·
//               Awards · Trophies · the Vault Store itself   |   the Store's shelves, the rank track
//
// Every figure is read: Zaps are profiles.current_season_zaps, Gems the spendable balance the Store
// charges against, the streak lib/practice-streak, the source breakdown this season's zap_transactions,
// the earn tables the live config rows. The Store grid and Gift Gems are the same components (and the
// same server actions) the DAWN Vault mounts.
//
// Under DAWN the Vault is module-driven (PageModules, the operator's Layout editor). This body is the
// reference's fixed arrangement, so the Layout editor does not reorder it while Frequency is on.

/** Zaps roll into Gems FLAT at 5:1 at season end, floor division (docs/NAMING.md, reset_season()). */
const ZAPS_PER_GEM = 5

const SOURCE_ICON: Record<string, FqIconName> = {
  event_attend: 'checkin',
  event_host: 'host',
  practice_logged: 'breath',
  practice_logged_light: 'breath',
  practice_logged_heavy: 'breath',
  practice_claim: 'breath',
  expression_challenge: 'standing',
  journey_finished: 'trophy',
  circle_start: 'circle',
  circle_activate: 'circle',
  invite_accepted: 'invite',
  referral_activated: 'invite',
  streak_milestone: 'streak',
}

type ConfigRow = { action_type: string; amount: number; daily_cap: number | null; description: string | null }

function daysLeft(endsAt: string | null | undefined): number | null {
  if (!endsAt) return null
  const ms = Date.parse(endsAt) - Date.now()
  return Number.isFinite(ms) && ms > 0 ? Math.ceil(ms / 86_400_000) : null
}

function earnLabel(r: ConfigRow): string {
  return r.description?.trim() || ledgerLabel(r.action_type)
}

export async function VaultBody() {
  const d = await getVaultData()
  if (!d || !d.profileId) return null
  const profileId = d.profileId

  const supabase = await createClient()
  const season = await getCurrentSeason()
  const [streak, sourceRows, zapCfg, gemCfg, awards, trophies] = await Promise.all([
    getPracticeStreak(profileId),
    // This season's Zaps by source. RLS is owner-only on zap_transactions (ADR-174).
    season?.starts_at
      ? supabase
          .from('zap_transactions')
          .select('action_type, amount')
          .eq('profile_id', profileId)
          .gte('created_at', season.starts_at)
          .limit(2000)
          .then((r) => (r.data as { action_type: string; amount: number }[] | null) ?? [])
      : Promise.resolve([] as { action_type: string; amount: number }[]),
    // The earn tables are public config (RLS "public read"), the same rows the award engines pay.
    supabase
      .from('zap_config')
      .select('action_type, zaps_amount, daily_cap, description, is_active')
      .eq('is_active', true)
      .order('zaps_amount', { ascending: false })
      .then((r) =>
        ((r.data as { action_type: string; zaps_amount: number; daily_cap: number | null; description: string | null }[] | null) ?? []).map(
          (x): ConfigRow => ({ action_type: x.action_type, amount: x.zaps_amount, daily_cap: x.daily_cap, description: x.description }),
        ),
      ),
    supabase
      .from('gem_config')
      .select('action_type, gems_amount, daily_cap, description, is_active')
      .eq('is_active', true)
      .order('gems_amount', { ascending: false })
      .then((r) =>
        ((r.data as { action_type: string; gems_amount: number; daily_cap: number | null; description: string | null }[] | null) ?? []).map(
          (x): ConfigRow => ({ action_type: x.action_type, amount: x.gems_amount, daily_cap: x.daily_cap, description: x.description }),
        ),
      ),
    getAchievementsData(),
    getTrophyCase(profileId),
  ])

  // Group this season's grants by source, biggest first.
  const bySource = new Map<string, { count: number; total: number }>()
  for (const r of sourceRows) {
    if (!r.amount || r.amount <= 0) continue
    const s = bySource.get(r.action_type) ?? { count: 0, total: 0 }
    s.count += 1
    s.total += r.amount
    bySource.set(r.action_type, s)
  }
  const sources = [...bySource.entries()].sort((a, b) => b[1].total - a[1].total)
  const sourceTotal = sources.reduce((n, [, s]) => n + s.total, 0)

  const left = daysLeft(season?.ends_at)
  const seasonLine = season
    ? [season.name ?? `Season ${season.season_number}`, left !== null ? `ends in ${left} ${left === 1 ? 'day' : 'days'}` : null]
        .filter(Boolean)
        .join(' · ')
    : 'Between seasons'

  const achievements = [...awards.achievements].sort((a, b) => Number(b.earned) - Number(a.earned))
  const currentRank = rankIndex(d.rank)

  return (
    <MembersBody>
      <div className="head">
        <div>
          <span className="k">You · The Vault</span>
          <h1 className="h1">
            The <span className="serif">Vault.</span>
          </h1>
          <span className="meta">{seasonLine}</span>
        </div>
        <div className="row wrap">
          <Link className="btn sm" href="/crew/store/ledger">
            How you earned
          </Link>
          <Link className="btn sm" href="/crew/leaderboard">
            Leaderboard
          </Link>
        </div>
      </div>

      <div className="g3">
        <div className="panel stack">
          <span className="k">Zaps</span>
          <span className="num">⚡ {d.zaps.toLocaleString()}</span>
          <span className="t2">Earned by showing up. Resets each season.</span>
          <span className="t2">
            Rolls into 💎 {Math.floor(d.zaps / ZAPS_PER_GEM).toLocaleString()} at season end
          </span>
        </div>
        <div className="panel stack">
          <span className="k">Gems</span>
          <span className="num">💎 {d.balance.toLocaleString()}</span>
          <span className="t2">Kept across seasons. Spend them here.</span>
        </div>
        <div className="panel stack">
          <span className="k">Streak</span>
          <span className="num">
            {streak.current} {streak.current === 1 ? 'day' : 'days'}
          </span>
          <span className="t2">
            {streak.freezeTokens} {streak.freezeTokens === 1 ? 'freeze' : 'freezes'} left. Your best is {streak.longest}.
          </span>
        </div>
      </div>

      <div className="ap-cols sec">
        <div>
          <div className="sec-h">
            <span className="h2">Where your Zaps came from</span>
            <span className="meta">This season</span>
          </div>
          {sources.length === 0 ? (
            <div className="empty">
              <p className="why">Nothing yet this season. Check in at a gathering or log a practice.</p>
            </div>
          ) : (
            <div className="list">
              {sources.map(([action, s]) => (
                <div key={action}>
                  <span className="ic">
                    <FqIcon name={SOURCE_ICON[action] ?? 'zap'} />
                  </span>
                  <span className="grow stack mc-gap-8">
                    <span className="row">
                      <span className="t1 grow">{ledgerLabel(action)}</span>
                      <span className="t2">{s.count} ×</span>
                      <span className="t1 mc-amount">⚡ {s.total.toLocaleString()}</span>
                    </span>
                    <span className="meter">
                      <i style={{ width: `${sourceTotal > 0 ? Math.round((s.total / sourceTotal) * 100) : 0}%` }} />
                    </span>
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="sec-h sec">
            <span className="h2">How you earn</span>
            <span className="meta">Showing up earns ⚡ · online care earns 💎</span>
          </div>
          <div className="g2">
            <div className="panel">
              <span className="k">Zaps · real world</span>
              <div className="list mc-top-8">
                {zapCfg.map((r) => (
                  <div key={r.action_type}>
                    <span className="t1 grow">{earnLabel(r)}</span>
                    <span className="t2">⚡ {r.amount}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="panel">
              <span className="k">Gems · online, capped daily</span>
              <div className="list mc-top-8">
                {gemCfg.map((r) => (
                  <div key={r.action_type}>
                    <span className="t1 grow">{earnLabel(r)}</span>
                    <span className="t2">
                      💎 {r.amount}
                      {r.daily_cap ? ` · ${r.daily_cap} a day` : ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div id="awards" className="sec-h sec">
            <span className="h2">Awards</span>
            <span className="meta">
              {awards.stats.earned} of {awards.stats.total}
            </span>
          </div>
          {achievements.length === 0 ? (
            <div className="empty">
              <p className="why">No Awards yet. Join a Circle, share a post, show up.</p>
            </div>
          ) : (
            <div className="g4">
              {achievements.map((a) => {
                const secret = a.is_secret && !a.earned
                return (
                  <div key={a.id} className={a.earned ? 'stack mc-award' : 'stack mc-award mc-locked'}>
                    <span className="mc-medal">
                      <FqIcon name={secret ? 'shield' : 'award'} />
                    </span>
                    <span className="t1">{secret ? 'Secret' : a.name}</span>
                    <span className="t2">{secret ? 'Keep exploring to find it.' : a.description}</span>
                  </div>
                )
              })}
            </div>
          )}

          {trophies.totalTrophies > 0 && (
            <>
              <div className="sec-h sec">
                <span className="h2">Trophies</span>
                <span className="meta">Every Journey you finish stays here</span>
              </div>
              <TrophyCase seasons={trophies.seasons} totalTrophies={trophies.totalTrophies} currentSeason={d.seasonNumber} />
            </>
          )}

          <div id="store" className="sec-h sec">
            <span className="h2">Vault Store</span>
            <span className="meta">💎 {d.balance.toLocaleString()} to spend</span>
          </div>
          <VaultStore />
        </div>

        <aside className="side">
          <div className="panel stack">
            <span className="k">Vault Store</span>
            <div className="list">
              <div>
                <span className="ic">
                  <FqIcon name="gem" />
                </span>
                <span className="grow">
                  <span className="t1 mc-block">Profile cosmetics</span>
                  <span className="t2">Borders and flair icons</span>
                </span>
              </div>
              <div>
                <span className="ic">
                  <FqIcon name="crew" />
                </span>
                <span className="grow">
                  <span className="t1 mc-block">Custom titles</span>
                  <span className="t2">Shown on your profile</span>
                </span>
              </div>
              <div>
                <span className="ic">
                  <FqIcon name="award" />
                </span>
                <span className="grow">
                  <span className="t1 mc-block">Collectible badges</span>
                  <span className="t2">Some are season exclusives</span>
                </span>
              </div>
              <div>
                <span className="ic">
                  <FqIcon name="membership" />
                </span>
                <span className="grow">
                  <span className="t1 mc-block">Membership credits</span>
                  <span className="t2">Redeem for free months</span>
                </span>
              </div>
            </div>
            <a className="btn sm pa" href="#store">
              Open the Store
            </a>
            <span className="t2">Gift Gems to another member from the Store.</span>
          </div>
          <div className="soft stack">
            <span className="k">Rank · earned by finishing Journeys</span>
            <div className="row mc-gap-6">
              {RANK_ORDER.map((r, i) => (
                <span key={r} className="grow stack mc-gap-6">
                  <span className={i <= currentRank ? 'mc-step on' : 'mc-step'} />
                  <span className={i === currentRank ? 't2 mc-strong' : 't2'}>{RANK_LABELS[r]}</span>
                </span>
              ))}
            </div>
            <span className="t2">
              {d.finished} {d.finished === 1 ? 'Journey' : 'Journeys'} finished this season.
            </span>
          </div>
        </aside>
      </div>
    </MembersBody>
  )
}
