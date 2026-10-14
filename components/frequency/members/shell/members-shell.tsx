// THE FREQUENCY MEMBER SHELL (design_handoff/frequency/templates/members: shell.js, app.css and the
// Feed prototype Members.dc.html). The chrome every signed-in page wears when SITE_DESIGN is
// 'frequency'; app/(main)/layout.tsx picks it over components/layout/app-shell.tsx, which keeps
// rendering DAWN exactly as before.
//
//   kit root  <div data-kit="members" data-area="…">   (kit-root.tsx; area from the route)
//     skip link, background wash, the ambient glows + grain (ambient.tsx, the kit's .fq-amb)
//     header    the kit's .ap-hdr: wordmark, section pill + .ap-mega menu, search, messages,
//               notifications and Zap (.ap-sheets), avatar
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
import { FqAmbient } from './ambient'
import { FqRailLayout } from './rail-layout'
import { RailFold, RailVaultTab, RailYouTab } from './rail-tabs'
import { FqToastHost } from './toast-host'
import {
  FQ_ACCOUNT_MENU,
  FQ_SHORTCUTS,
  FQ_WORK_GROUP_ICON,
  FQ_WORK_MENU,
  canShow,
  groupRows,
  type FqMenuRow,
  type FqMenuViewer,
} from './nav'
import type { AvailableContext } from '@/lib/context/operator-context'
import { meetsAccess } from '@/lib/nav-areas'
import { SELECTABLE_SKINS } from '@/lib/theme/skins'
import { avatarBg } from './avatar'

type Stats = Promise<DockData | null>

interface FrequencyMembersShellProps {
  profile: { id: string; display_name: string; handle: string; avatar_url: string | null; community_role?: string | null }
  previewVisitor: boolean
  /** Holds Crew (the paid tier), for the "Crew" mark beside the rank. */
  crew: boolean
  /** The viewer's game stats (zaps, gems, streak, rank, current Journey), resolved behind Suspense. */
  stats: Stats
  /** The right rail's open face (right-rail.tsx: the design's panels, then the platform's own). */
  sidebar: React.ReactNode
  /** The right rail's 76px face (right-rail.tsx FrequencyRightMicro): one button per panel. */
  sidebarMicro: React.ReactNode
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
  /** The operator contexts (resolveOperatorContext): one per Space run, plus Admin for staff. */
  availableContexts: AvailableContext[]
  /** The member's skin (Settings, Appearance), for the account menu's theme control. */
  skin: string
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

/** The Vault panel's body (Members.dc.html, 2026-10-14 export): Season standing with the rank chip.
 *  The export also drew Your practices, the seven-day streak and the rank bar here; those now ride at
 *  the top of the open right rail in Stats and streaks (rail-stats.tsx, owner 2026-10-14), so the
 *  Vault keeps to what it is for: standing, the freeze and the store. The tab face still carries
 *  streak, Zaps and Gems at rest, for the folded rail. */
function VaultStanding({ d }: { d: DockData }) {
  const rank = rankOf(d)
  return (
    <>
      <div className="fqm-vault-sec">
        <span className="k">Season standing</span>
        {rank && (
          <span className="fqm-vault-chip">
            <FqIcon name="standing" />
            {rank}
          </span>
        )}
      </div>
      <Link href="/crew" className="fqm-vault-link">
        See your Quest
      </Link>
    </>
  )
}

/** The phone drawer's standing strip: the three numbers the Vault tab carries on a desktop (whose
 *  rails a phone does not show), each a door into the Vault. */
function DrawerStanding({ d }: { d: DockData }) {
  return (
    <Link href="/crew/store" className="fqm-standing" aria-label={`The Vault: ${n(d.streak)} day streak, ${n(d.zaps)} Zaps, ${n(d.vaultGems)} Gems`}>
      <span data-tone="sun">
        <FqIcon name="streak" />
        <b>{n(d.streak)}</b>
        <small>Streak</small>
      </span>
      <span data-tone="violet">
        <FqIcon name="zap" />
        <b>{n(d.zaps)}</b>
        <small>Zaps</small>
      </span>
      <span data-tone="aqua">
        <FqIcon name="gem" />
        <b>{n(d.vaultGems)}</b>
        <small>Gems</small>
      </span>
    </Link>
  )
}

/** The phone drawer's head: the standing strip, then the Journey in progress (the left rail's Keep
 *  learning card, which a phone does not show). */
function DrawerHead({ d }: { d: DockData }) {
  return (
    <>
      <DrawerStanding d={d} />
      {d.arc && (
        <Link href="/journeys" className="fqm-learn fqm-drawer-learn">
          <span className="rl-h">Keep learning</span>
          <b>{d.arc.chain}</b>
          <span className="fqm-bar">
            <i style={{ width: `${d.arc.pct}%` }} />
          </span>
          <small>
            {d.arc.pct}% · {d.arc.step}
          </small>
        </Link>
      )}
    </>
  )
}

export function FrequencyMembersShell(props: FrequencyMembersShellProps) {
  const { profile, crew, stats, navAccess, myFrequency } = props
  const profileHref = `/people/${profile.handle}`
  const role = (profile.community_role ?? 'member') as CommunityRole
  const gateRole: CommunityRole | null = props.previewVisitor ? null : role
  const circles = myFrequency?.circles ?? []
  const shortcuts = FQ_SHORTCUTS.filter((s) => canShow(s, navAccess))
  const badgeFor = (b?: 'messages' | 'notifications') =>
    b === 'messages' ? props.messagesUnread : b === 'notifications' ? Math.max(0, props.unreadCount) : 0

  // ── The avatar menu and the rail-foot work menu (nav.ts, the framework's canon) ────────────────
  const menuViewer: FqMenuViewer = {
    navAccess,
    operatesSpaces: props.operatesSpaces,
    // DAWN's `minAccess: 'host'` rows, on the view-as role.
    host: meetsAccess('host', gateRole),
  }
  const accountGroups = groupRows(FQ_ACCOUNT_MENU, menuViewer, profileHref)
  // Bottom left: each Space the member runs, straight into its console, then the work rows.
  const spaceRows: FqMenuRow[] = props.availableContexts.flatMap((c) =>
    c.kind === 'operator' ? [{ group: 'Your Spaces', label: c.label, href: c.href, icon: 'space' as const }] : [],
  )
  const workGroups = groupRows([...spaceRows, ...FQ_WORK_MENU], menuViewer, profileHref)
  const skins = SELECTABLE_SKINS.map((s) => ({ id: s.id, label: s.label }))

  // ── Left rail ────────────────────────────────────────────────────────────────────────────────────
  const leftFull = (
    <div className="fqm-l-full">
      {/* No avatar + name block up here (owner, 2026-10-14, SCAN-882): the member is already in the
          header's avatar and in the You card at the foot of this rail. The shortcuts open the rail. */}
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
              <span className="fqm-grow">
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
      {/* The folded face drops the avatar at its top too (SCAN-882): the You tab below carries it. */}
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
      {workGroups.length > 0 && (
        <nav className="fqm-work" aria-label="Your work">
          {workGroups.map((g) => {
            const icon = <FqIcon name={FQ_WORK_GROUP_ICON[g.label] ?? 'more'} />
            // A one-row group is a plain row; a group of several opens as the kit's fold.
            if (g.rows.length === 1 && g.rows[0]!.href) {
              return (
                <Link key={g.label} href={g.rows[0]!.href} className="rl-row">
                  {icon}
                  <span>{g.rows[0]!.label}</span>
                </Link>
              )
            }
            return (
              <RailFold key={g.label} label={g.label} icon={icon} defaultOpen={g.label === 'Your Spaces'}>
                {g.rows.map((r) => (
                  <Link key={r.key} href={r.href ?? '#'} className="rl-sub">
                    {r.label}
                  </Link>
                ))}
              </RailFold>
            )
          })}
        </nav>
      )}
      <div className="fqm-you-foot">
        <Link href="/site-map">Site map</Link>
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
  // Both faces come from right-rail.tsx through the layout: the open face draws the design's panels
  // (Get started, Stats and streaks, Today's goals, Your week, the local board, People to know) and then the platform's
  // own, restyled; the micro face is one button per panel. The tab carries the standing.
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
              <WithStats stats={stats}>
                {(d) => {
                  // The design's "Shed · week 6 of 13": the live season and its week; the rank when
                  // there is no season on.
                  const line = d.season
                    ? `${d.season.name} · week ${d.season.week}${d.season.weeks ? ` of ${d.season.weeks}` : ''}`
                    : rankOf(d)
                  return line ? <span className="meta">{line}</span> : null
                }}
              </WithStats>
            </Suspense>
          </div>
          <Suspense fallback={null}>
            <WithStats stats={stats}>{(d) => <VaultStanding d={d} />}</WithStats>
          </Suspense>
          <Suspense fallback={null}>
            <WithStats stats={stats}>
              {(d) => (
                <Link href="/crew/store" className="fqm-vault-row">
                  <span className="fqm-grow">
                    <b>Streak freeze</b>
                    <small>
                      {(d.freezeTokens ?? 0) === 0
                        ? 'None saved. Spend Gems on one.'
                        : `You have ${d.freezeTokens} saved`}
                    </small>
                  </span>
                  <FqIcon name="chevron" />
                </Link>
              )}
            </WithStats>
          </Suspense>
          <Link href="/crew/store" className="btn pa lg">
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
          <div className="fq-wash" aria-hidden />
          <FqAmbient />
          <FqHeader
            profile={profile}
            profileHref={profileHref}
            navAccess={navAccess}
            unreadCount={props.unreadCount}
            messagesUnread={props.messagesUnread}
            streak={stats.then((d) => d?.streak ?? 0)}
            viewer={{ role: gateRole, staffRole: props.staffRole, operatesSpaces: props.operatesSpaces }}
            circles={circles.slice(0, 5).map((c) => ({ key: c.key, label: c.label, href: c.href, notices: c.notices }))}
            accountGroups={accountGroups}
            workGroups={workGroups}
            skins={skins}
            skin={props.skin}
            standing={
              <Suspense fallback={null}>
                <WithStats stats={stats}>{(d) => <DrawerHead d={d} />}</WithStats>
              </Suspense>
            }
          />
          {props.banner}
          <FqRailLayout
            left={{ full: leftFull, micro: leftMicro, tab: leftTab }}
            right={props.sidebar ? { full: props.sidebar, micro: props.sidebarMicro, tab: rightTab } : null}
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
