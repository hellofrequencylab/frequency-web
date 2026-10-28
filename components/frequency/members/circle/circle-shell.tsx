import Link from 'next/link'
import { richParagraphs } from '@/lib/page-editor/richtext'
import type { ReactNode } from 'react'
import '@/app/themes/active/members-b'
import '@/app/themes/active/members-community'
import '@/app/themes/active/members-circle'
import type { CircleChannelChip } from '@/lib/circles/page-facts'
import { FqIcon } from '@/components/frequency/icon'
import { FqAvatar } from '@/components/frequency/members/shared/avatar'
import { FqCircleTabs } from '@/components/frequency/members/circle/circle-tabs'

// CIRCLE, FREQUENCY SHELL (templates/circles/Circles.dc.html). The Circle's route-group layout keeps
// every read and gate it had (draft 404, entry verdict, capabilities, tabs) and hands this file the
// pieces: the cover with its title, facts and buttons, the Meetups panel, the sticky tab pill over the
// real tab ROUTES (Feed, What's Happening, Members, Circle Stats), and the side column. The tab
// bodies render as `children`.

/** The middle word of a name of three or more words is set in the serif: the page's one soft phrase. */
function titleWithSerif(name: string): ReactNode {
  const words = name.trim().split(/\s+/)
  if (words.length < 3) return name
  const at = Math.floor(words.length / 2)
  return words.map((w, i) => (
    <span key={`${w}-${i}`}>
      {i > 0 ? ' ' : ''}
      {i === at ? <span className="serif">{w}</span> : w}
    </span>
  ))
}

export function FqCircleShell({
  notices,
  coverImage,
  badge,
  channels = [],
  name,
  subline,
  rhythm = null,
  hostedBy = null,
  invite,
  primary,
  admin,
  sister,
  meetups = null,
  tabs,
  tabBase,
  tabTools,
  about,
  agreements = [],
  hostLine,
  memberCount,
  memberCap,
  faces = [],
  place = null,
  meetLine = null,
  hostPanel = null,
  spaceLink = null,
  children,
}: {
  notices: ReactNode
  coverImage: string | null
  /** The cover's one badge: "6 here this week" with the breathing dot, or the Circle's own status. */
  badge?: { text: string; live: boolean } | null
  /** Up to three Channels, the primary first. */
  channels?: CircleChannelChip[]
  name: string
  subline: string
  /** The host's written rhythm ("Tue and Fri mornings"). */
  rhythm?: string | null
  hostedBy?: ReactNode
  /** QR & Share, the Circle's invite door. */
  invite: ReactNode
  /** Create (members) or Join (visitors), or the Full marker. */
  primary: ReactNode
  /** Edit and Manage, for a manager only. */
  admin: ReactNode
  /** The sister-Circle offer. */
  sister: ReactNode
  /** The Meetups panel (a client component the layout fills with the viewer's own answers). */
  meetups?: ReactNode
  tabs: { href: string; label: string; count?: number }[]
  tabBase?: string
  /** Boost and the quiet Leave menu, under the tab bar at the right. */
  tabTools: ReactNode
  about: string | null
  /** The host's written agreements, "How we do it". */
  agreements?: string[]
  hostLine: ReactNode
  memberCount: number
  memberCap: number
  /** Up to six of the roster, for "Who's here". */
  faces?: { id: string; name: string; avatarUrl: string | null }[]
  /** "Bird Rock, La Jolla" or "Meets online". */
  place?: string | null
  /** The one plain sentence under the place. */
  meetLine?: string | null
  /** Host-only side panels (health). */
  hostPanel?: ReactNode
  /** The Space that owns this Circle: a small "Part of" pill over the cover, linking to the Space. */
  spaceLink?: { href: string; name: string } | null
  children: ReactNode
}) {
  const open = Math.max(0, memberCap - memberCount)
  const title = titleWithSerif(name)
  const tags = channels.slice(0, 3)
  const hasTools = !!tabTools
  return (
    <div className="fqc">
      <Link className="meta fqm-back" href="/circles">
        ← Circles
      </Link>
      <div className="fqm-notices">{notices}</div>

      <section
        className="fqm-cl-hero fqc-cover"
        style={coverImage ? { backgroundImage: `url('${coverImage}')` } : undefined}
      >
        {badge && (
          <span className={badge.live ? 'fqc-badge live' : 'fqc-badge'}>{badge.text}</span>
        )}
        {spaceLink && (
          <Link className="fqc-space-pill" href={spaceLink.href}>
            Part of {spaceLink.name}
          </Link>
        )}
        <div className="fqm-cl-in">
          <div className="stack">
            {tags.length > 0 && (
              <ul className="fqc-tags">
                {tags.map((c) => (
                  <li key={c.id}>{c.name}</li>
                ))}
              </ul>
            )}
            <h1 className="h1">{title}</h1>
            <div className="fqc-facts">
              {rhythm && <span>{rhythm}</span>}
              {subline && <span className="fqm-cl-sub">{subline}</span>}
              {hostedBy && <span>{hostedBy}</span>}
            </div>
          </div>
          <div className="row wrap fqc-actions">
            {invite}
            {primary}
            {admin}
          </div>
        </div>
      </section>

      {meetups}

      {tabs.length > 0 && <FqCircleTabs tabs={tabs} label="Circle sections" baseHref={tabBase ?? tabs[0].href} />}
      {hasTools && <div className="row fqc-tools">{tabTools}</div>}

      <div className="fqc-cols">
        <div className="fqc-main">
          <div className="fqm-pane">{children}</div>
        </div>
        <aside className="fqc-side">
          {sister}
          {hostPanel}
          {about && (
            <div className="panel stack">
              <span className="k">About</span>
              <div className="body fqm-about stack">{richParagraphs(about)}</div>
              {agreements.length > 0 && (
                <>
                  <span className="k">How we do it</span>
                  <ul className="fqc-agree">
                    {agreements.map((a) => (
                      <li key={a}>
                        <FqIcon name="check" />
                        {a}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {hostLine && <span className="t2">{hostLine}</span>}
            </div>
          )}
          {!about && agreements.length > 0 && (
            <div className="panel stack">
              <span className="k">How we do it</span>
              <ul className="fqc-agree">
                {agreements.map((a) => (
                  <li key={a}>
                    <FqIcon name="check" />
                    {a}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {(place || meetLine) && (
            <div className="panel stack">
              <span className="k">How we meet</span>
              {coverImage && place && (
                <div className="fqc-meet-photo" style={{ backgroundImage: `url('${coverImage}')` }} role="img" aria-label={place}>
                  <span className="fqc-pin">
                    <FqIcon name="pin" />
                    {place}
                  </span>
                </div>
              )}
              {!coverImage && place && (
                <span className="t1 fqc-place">
                  <FqIcon name="pin" />
                  {place}
                </span>
              )}
              {meetLine && <span className="t2">{meetLine}</span>}
            </div>
          )}
          <div className="panel stack">
            <div className="fqc-side-head">
              <span className="k">Who&apos;s here</span>
              <span className="t2">{memberCount}</span>
            </div>
            {faces.length > 0 && (
              <span className="faces">
                {faces.map((f) => (
                  <FqAvatar key={f.id} url={f.avatarUrl} name={f.name} size="m" />
                ))}
              </span>
            )}
            <span className="t2">
              {open > 0
                ? `${open} ${open === 1 ? 'seat' : 'seats'} open of ${memberCap}.`
                : 'Every seat is taken.'}
            </span>
            {!about && hostLine && <span className="t2">{hostLine}</span>}
          </div>
          {tags.length > 0 && (
            <div className="panel stack">
              <span className="k">Channels</span>
              <ul className="fqc-channels">
                {tags.map((c) => (
                  <li key={c.id}>
                    <span className="fq-icon-tile">
                      <FqIcon name="tag" />
                    </span>
                    <span>
                      <span className="t1 fqm-block">{c.name}</span>
                      {c.primary && <span className="t2">Primary</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
