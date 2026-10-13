// THE FREQUENCY MEMBER SHELL (design_handoff/frequency/templates/members: shell.js, app.css and the
// Feed prototype Members.dc.html). The chrome every signed-in page wears when SITE_DESIGN is
// 'frequency'; app/(main)/layout.tsx picks it over components/layout/app-shell.tsx, which keeps
// rendering DAWN exactly as before.
//
//   kit root  <div data-kit="members" data-area="…">   (kit-root.tsx; area from the route)
//     skip link, background wash + grain
//     header    animated wordmark, section pill + mega menu, search, messages, notifications, Zap, avatar
//     banner    the announcement bar slot, unchanged
//     rail grid left rail · <main id="main"> · right rail, resizable and collapsible (rail-layout.tsx)
//     footer    "Frequency · Community Collective"
//     toast     the kit's .ap-toast host
//
// A Server Component. The client islands are the header, the rail geometry, the two rail tabs, the kit
// root and the toast host; everything they show is rendered here from the data the layout already
// reads (viewer, counts, My Frequency, the game stats, railFor), and nothing is sample data.

import Link from 'next/link'
import { Suspense } from 'react'
import { FqIcon } from '@/components/frequency/icon'
import { MindlessProvider } from '@/components/on-air/mindless'
import { MovementProvider } from '@/components/on-air/movement'
import type { DockData } from '@/components/sidebar/game-stats-dock'
import type { CommunityRole } from '@/components/sidebar/right-sidebar'
import type { MyFrequency } from '@/lib/nav/my-frequency'
import type { ChromeOverrides } from '@/lib/layout/page-chrome'
import type { AppOverrides } from '@/lib/apps/overrides'
import type { Capability } from '@/lib/core/capabilities'
import type { WebRole } from '@/lib/core/roles'
import type { StaffRole } from '@/lib/staff'
import { RANK_LABELS } from '@/lib/season-ranks'
import { getInitials } from '@/lib/utils'
import { MembersKitRoot } from './kit-root'
import { FqHeader } from './header'
import { FqRailLayout } from './rail-layout'
import { RailVaultTab, RailYouTab } from './rail-tabs'
import { FqToastHost } from './toast-host'
import { FQ_SHORTCUTS, FQ_YOU_LINKS, canShow, resolveHref } from './nav'
import { avatarBg } from './avatar'

type Stats = Promise<DockData | null>

export interface FrequencyMembersShellProps {
  profile: { id: string; display_name: string; handle: string; avatar_url: string | null; community_role?: string | null }
  previewVisitor: boolean
  /** Holds Crew (the paid tier), for the "Crew" mark beside the rank. */
  crew: boolean
  /** The viewer's game stats (zaps, gems, streak, rank, current Journey), resolved behind Suspense. */
  stats: Stats
  /** The right rail's panels (components/sidebar/right-sidebar.tsx), already behind Suspense. */
  sidebar: React.ReactNode
  banner: React.ReactNode
  unreadCount: number
  messagesUnread: number
  navAccess?: Record<string, string>
  myFrequency: MyFrequency | null
  operatesSpaces: boolean
  staffRole: StaffRole | null
  webRole: WebRole
  caps: Capability[]
  appOverrides?: AppOverrides
  chromeOverrides?: ChromeOverrides
  children: React.ReactNode
}

function Avatar({ url, name, size }: { url: string | null; name: string; size: number }) {
  return (
    <span className="fqm-av" style={{ width: size, height: size, ...avatarBg(url) }} aria-hidden>
      {url ? null : getInitials(name)}
    </span>
  )
}

/** Renders from the stats once they resolve; nothing when they fail. */
async function WithStats({ stats, children }: { stats: Stats; children: (d: DockData) => React.ReactNode }) {
  const d = await stats
  return d ? <>{children(d)}</> : null
}

function rankOf(d: DockData): string | null {
  return d.rank ? RANK_LABELS[d.rank] : null
}

const n = (v: number) => v.toLocaleString('en-US')

export function FrequencyMembersShell(props: FrequencyMembersShellProps) {
  const { profile, crew, stats, navAccess, myFrequency } = props
  const profileHref = `/people/${profile.handle}`
  const role = (profile.community_role ?? 'member') as CommunityRole
  const gateRole: CommunityRole | null = props.previewVisitor ? null : role
  const circles = myFrequency?.circles ?? []
  const spaces = myFrequency?.spaces ?? []
  const shortcuts = FQ_SHORTCUTS.filter((s) => canShow(s, navAccess))
  const badgeFor = (b?: 'messages' | 'notifications') =>
    b === 'messages' ? props.messagesUnread : b === 'notifications' ? Math.max(0, props.unreadCount) : 0

  // ── Left rail ────────────────────────────────────────────────────────────────────────────────────
  const leftFull = (
    <div className="fqm-l-full">
      <Link href={profileHref} className="fqm-me-row">
        <Avatar url={profile.avatar_url} name={profile.display_name} size={44} />
        <span style={{ minWidth: 0 }}>
          <b>{profile.display_name}</b>
          <span className="fqm-me-tags">
            <Suspense fallback={null}>
              <WithStats stats={stats}>
                {(d) => (rankOf(d) ? <span className="fqm-glass-chip">{rankOf(d)}</span> : null)}
              </WithStats>
            </Suspense>
            {crew && <span className="fq-iri-text on-light fqm-crew">Crew</span>}
          </span>
        </span>
      </Link>
      <nav className="fqm-sc" aria-label="Shortcuts">
        {shortcuts.map((s) => {
          const count = badgeFor(s.badge)
          return (
            <Link key={s.label} href={s.href}>
              <FqIcon name={s.icon} />
              <span>{s.label}</span>
              {count > 0 && <small aria-label={`${count} new`}>{count}</small>}
            </Link>
          )
        })}
      </nav>
      {circles.length > 0 && (
        <div className="fqm-group">
          <span className="fqm-group-h">Your Circles</span>
          {circles.slice(0, 5).map((c) => (
            <Link key={c.key} href={c.href} className="fqm-circle">
              <span className="fqm-circle-orb" data-live={c.notices > 0 ? '' : undefined} aria-hidden>
                {getInitials(c.label).slice(0, 1)}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <b>{c.label}</b>
                {c.notices > 0 && <small>{c.notices} new</small>}
              </span>
            </Link>
          ))}
        </div>
      )}
      <Suspense fallback={null}>
        <WithStats stats={stats}>
          {(d) =>
            d.arc ? (
              <Link href="/journeys" className="fqm-learn">
                <span className="fqm-group-h">Keep learning</span>
                <b>{d.arc.chain}</b>
                <span className="fqm-bar">
                  <i style={{ width: `${d.arc.pct}%` }} />
                </span>
                <small>
                  {d.arc.pct}% · {d.arc.step}
                </small>
              </Link>
            ) : null
          }
        </WithStats>
      </Suspense>
    </div>
  )

  const leftMicro = (
    <>
      <Link href={profileHref} aria-label={`Your profile, ${profile.display_name}`} data-tip={profile.display_name} data-tip-sub={crew ? 'Crew' : ''}>
        <Avatar url={profile.avatar_url} name={profile.display_name} size={44} />
      </Link>
      <nav aria-label="Shortcuts">
        {shortcuts.map((s) => {
          const count = badgeFor(s.badge)
          return (
            <Link key={s.label} href={s.href} className="fqm-mi" aria-label={s.label} data-tip={s.label} data-tip-sub={count > 0 ? `${count} new` : ''}>
              <FqIcon name={s.icon} />
              {count > 0 && <i />}
            </Link>
          )
        })}
      </nav>
      {circles.length > 0 && <span className="fqm-divider" aria-hidden />}
      {circles.slice(0, 5).map((c) => (
        <Link key={c.key} href={c.href} className="fqm-circle-orb" data-live={c.notices > 0 ? '' : undefined} aria-label={c.label} data-tip={c.label} data-tip-sub={c.notices > 0 ? `${c.notices} new` : ''}>
          {getInitials(c.label).slice(0, 1)}
        </Link>
      ))}
      <Suspense fallback={null}>
        <WithStats stats={stats}>
          {(d) =>
            d.arc ? (
              <Link href="/journeys" className="fqm-ring" style={{ '--p': d.arc.pct } as React.CSSProperties} aria-label={`${d.arc.chain}, ${d.arc.pct}% done`} data-tip={d.arc.chain} data-tip-sub={`${d.arc.pct}% · ${d.arc.step}`}>
                <span>
                  <FqIcon name="program" />
                </span>
              </Link>
            ) : null
          }
        </WithStats>
      </Suspense>
    </>
  )

  const standingLine = (
    <Suspense fallback={crew ? 'Crew' : null}>
      <WithStats stats={stats}>{(d) => [rankOf(d), crew ? 'Crew' : null].filter(Boolean).join(' · ')}</WithStats>
    </Suspense>
  )

  const youPanel = (
    <>
      <Link href={profileHref} className="fqm-you-head">
        <Avatar url={profile.avatar_url} name={profile.display_name} size={46} />
        <span>
          <b>{profile.display_name}</b>
          <small>
            <Suspense fallback={null}>
              <WithStats stats={stats}>{(d) => (rankOf(d) ? `${rankOf(d)} · ` : '')}</WithStats>
            </Suspense>
            {crew && (
              <>
                <span className="fq-iri-text on-light">Crew</span>
                {' · '}
              </>
            )}
            @{profile.handle}
          </small>
        </span>
      </Link>
      <div className="fqm-you-links">
        {FQ_YOU_LINKS.filter((l) => canShow(l, navAccess) && !(crew && l.href === '/upgrade')).map((l) => (
          <Link key={l.label} href={resolveHref(l.href, profileHref)}>
            <FqIcon name={l.icon} />
            {l.label}
          </Link>
        ))}
      </div>
      <div className="fqm-run">
        <b>What you run</b>
        {spaces.length > 0 ? (
          <div className="fqm-run-list">
            {spaces.map((s) => (
              <Link key={s.key} href={s.href}>
                {s.label}
                {s.notices > 0 ? ` · ${s.notices} new` : ''}
              </Link>
            ))}
          </div>
        ) : (
          <p>Nothing yet.</p>
        )}
        <Link href="/circles/new">Start a Circle →</Link>
      </div>
      <div className="fqm-you-foot">
        <Link href="/settings">Settings</Link>
        <Link href="/help">Help</Link>
      </div>
    </>
  )

  const leftTab = (
    <RailYouTab
      label={`You, ${profile.display_name}`}
      face={
        <>
          <Avatar url={profile.avatar_url} name={profile.display_name} size={34} />
          <span>
            <span>You</span>
            <small>{standingLine}</small>
          </span>
        </>
      }
      microFace={<Avatar url={profile.avatar_url} name={profile.display_name} size={34} />}
      panel={youPanel}
    />
  )

  // ── Right rail ───────────────────────────────────────────────────────────────────────────────────
  // The open face is the existing rail panels (railFor decides where it shows, unchanged). The micro
  // face and the tab carry the viewer's real standing; the prototype's sample panels (Your week,
  // Today's goals, the local leaderboard, People to know) have no data source yet.
  const rightMicro = (
    <Suspense fallback={null}>
      <WithStats stats={stats}>
        {(d) => (
          <>
            <button type="button" className="fqm-rmi" data-fqm-expand="" aria-label={`Day streak ${d.streak}. Open the rail`} data-tip="Day streak" data-tip-sub={`${n(d.streak)} days`}>
              <FqIcon name="streak" />
              {n(d.streak)}
            </button>
            <button type="button" className="fqm-rmi" data-fqm-expand="" aria-label={`${d.zaps} Zaps this season. Open the rail`} data-tip="Zaps this season" data-tip-sub={`⚡ ${n(d.zaps)}`}>
              <FqIcon name="zap" />
              {n(d.zaps)}
            </button>
            <button type="button" className="fqm-rmi" data-fqm-expand="" aria-label={`${d.vaultGems} Gems to spend. Open the rail`} data-tip="Gems to spend" data-tip-sub={`💎 ${n(d.vaultGems)}`}>
              <FqIcon name="gem" />
              {n(d.vaultGems)}
            </button>
          </>
        )}
      </WithStats>
    </Suspense>
  )

  const rightTab = (
    <RailVaultTab
      label="The Vault"
      face={
        <Suspense fallback={<span>The Vault</span>}>
          <WithStats stats={stats}>
            {(d) => (
              <>
                <span>
                  <span className="fqm-live-dot fq-breathe" aria-hidden />
                  {n(d.streak)}
                </span>
                <span>⚡ {n(d.zaps)}</span>
                <span>💎 {n(d.vaultGems)}</span>
              </>
            )}
          </WithStats>
        </Suspense>
      }
      microFace={
        <Suspense fallback={<span>⚡</span>}>
          <WithStats stats={stats}>{(d) => <span>⚡ {n(d.zaps)}</span>}</WithStats>
        </Suspense>
      }
      panel={
        <>
          <div className="fqm-vault-h">
            <b>The Vault</b>
            <Suspense fallback={null}>
              <WithStats stats={stats}>{(d) => (rankOf(d) ? <span className="meta">{rankOf(d)}</span> : null)}</WithStats>
            </Suspense>
          </div>
          <Suspense fallback={null}>
            <WithStats stats={stats}>
              {(d) => (
                <div className="fqm-vault-nums">
                  <span>
                    <b>{n(d.zaps)}</b>
                    <small>⚡ Zaps</small>
                  </span>
                  <span>
                    <b>{n(d.vaultGems)}</b>
                    <small>💎 Gems</small>
                  </span>
                  <span>
                    <b>{n(d.streak)}</b>
                    <small>Day streak</small>
                  </span>
                </div>
              )}
            </WithStats>
          </Suspense>
          <Link href="/crew/store" className="btn pa">
            Open the Vault
          </Link>
        </>
      }
    />
  )

  const footer = (
    <footer className="ap-foot">
      <span>Frequency · Community Collective</span>
      <span className="ap-sp" />
      <Link href="/help">Help</Link>
      <Link href="/settings">Settings</Link>
    </footer>
  )

  return (
    <MindlessProvider>
      <MovementProvider>
        <MembersKitRoot profileHref={profileHref}>
          <a className="fqm-skip" href="#main">
            Skip to content
          </a>
          <div className="fq-wash" aria-hidden>
            <div className="fq-grain" />
          </div>
          <FqHeader
            profile={profile}
            profileHref={profileHref}
            navAccess={navAccess}
            unreadCount={props.unreadCount}
            messagesUnread={props.messagesUnread}
            streak={stats.then((d) => d?.streak ?? 0)}
            viewer={{ role: gateRole, staffRole: props.staffRole, operatesSpaces: props.operatesSpaces }}
          />
          {props.banner}
          <FqRailLayout
            left={{ full: leftFull, micro: leftMicro, tab: leftTab }}
            right={props.sidebar ? { full: props.sidebar, micro: rightMicro, tab: rightTab } : null}
            footer={footer}
            chromeOverrides={props.chromeOverrides}
            admin={{ role: gateRole, staffRole: props.staffRole, webRole: props.webRole, caps: props.caps, appOverrides: props.appOverrides }}
          >
            {props.children}
          </FqRailLayout>
          <FqToastHost />
        </MembersKitRoot>
      </MovementProvider>
    </MindlessProvider>
  )
}
