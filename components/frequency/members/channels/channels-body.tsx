import Image from 'next/image'
import Link from 'next/link'
import { EmptyState } from '@/components/ui/empty-state'
import '@/app/themes/active/members-b'
import '@/app/themes/active/members-community'
import { FqIcon } from '@/components/frequency/icon'
import { FqClearLink, FqFacetMenu, FqFindField, hrefWith, type Params } from '@/components/frequency/members/shared/kit-tools'
import { MembersBody, SerifTail } from '@/components/frequency/members/shared/members-body'
import { TuneInButton, TunedInButton } from '@/app/(main)/channels/channel-toggle'
import { NewChannelCompose } from '@/app/(main)/channels/new-channel-compose'
import { CHANNEL_CATEGORY_ICON, FALLBACK_CHANNEL_CATEGORY_ICON } from '@/lib/channels/categories'
import { channelCoverFocusStyle, readChannelCoverFocus } from '@/lib/channels/hero'
import {
  CHANNEL_SORTS,
  CHANNEL_SORT_LABEL,
  activityLine,
  filterChannels,
  parseChannelSort,
  sortChannels,
  threadExcerpt,
  trendingChannels,
  type ForumChannel,
  type ForumIndex,
} from '@/lib/channels/forum-index'
import { relativeTime } from '@/lib/utils'

// THE CHANNELS INDEX, REBUILT AS A FORUM BOARD LIST (LIVE-1028, ADR-1845; design changes item 29).
//
// Before: a photo hero, a stats band and a long grid of identical cards. After: the kit's plain head (no
// photo, the same as Events, Circles and Members), one toolbar (search, Pillar, show, sort), then the
// board. A board reads like a forum: Your Channels first, what is being talked about this fortnight,
// one prompt to start a thread, then every Pillar as a list of rows, each row saying what the Channel is,
// who is tuned in and what the latest thread was. Every control is a URL, so the page stays a Server
// Component and a filtered view is shareable. Unfiltered, a Pillar shows its first rows with a link to the
// rest; a search, a Pillar or a "show" switches to one flat result list.

const PER_PILLAR = 6

export interface ChannelsContent {
  title: string
  body: string | null
  ctaLabel: string | null
  ctaHref: string | null
}

function CoverTile({ c }: { c: ForumChannel }) {
  const Icon = CHANNEL_CATEGORY_ICON[c.category] ?? FALLBACK_CHANNEL_CATEGORY_ICON
  return c.coverImage ? (
    <Image
      src={c.coverImage}
      alt=""
      width={56}
      height={56}
      className="fqm-board-art"
      style={channelCoverFocusStyle(readChannelCoverFocus(c.theme))}
    />
  ) : (
    <span className="fqm-board-art fqm-board-ic" aria-hidden="true">
      <Icon />
    </span>
  )
}

function TuneControl({ c, canToggle }: { c: ForumChannel; canToggle: boolean }) {
  if (!canToggle) return null
  return c.tunedIn ? <TunedInButton channelId={c.id} channelName={c.name} /> : <TuneInButton channelId={c.id} slug={c.slug} />
}

function Row({ c, canToggle, showPillar }: { c: ForumChannel; canToggle: boolean; showPillar: boolean }) {
  const talk = activityLine(c)
  return (
    <li className="fqm-board-row">
      <CoverTile c={c} />
      <div className="fqm-board-main">
        <span className="h3 fqm-board-name">
          <Link href={`/channels/${c.slug}`}>{c.name}</Link>
          {c.hasPinned && <span className="tag fqm-board-tag">Pinned thread</span>}
        </span>
        {c.description && <span className="t2 fqm-board-desc">{threadExcerpt(c.description, 160)}</span>}
        {c.latest ? (
          <span className="meta fqm-board-latest">
            <span className="fqm-board-latest-k">Latest</span> {c.latest.excerpt}
            <span className="fqm-board-latest-by">
              {c.latest.author ? ` ${c.latest.author}, ` : ' '}
              {relativeTime(c.latest.at)}
            </span>
          </span>
        ) : (
          <span className="meta fqm-board-latest">No threads yet. Be the first to start one.</span>
        )}
      </div>
      <div className="fqm-board-side">
        <span className="meta fqm-board-stats">
          {showPillar && c.pillarName ? `${c.pillarName} · ` : ''}
          {c.members.toLocaleString()} tuned in · {c.circles} {c.circles === 1 ? 'Circle' : 'Circles'}
          {talk ? ` · ${talk}` : ''}
        </span>
        <TuneControl c={c} canToggle={canToggle} />
      </div>
    </li>
  )
}

function Trending({ list, canToggle }: { list: ForumChannel[]; canToggle: boolean }) {
  if (list.length === 0) return null
  return (
    <section className="sec" aria-labelledby="fq-ch-trending">
      <div className="sec-h">
        <span id="fq-ch-trending" className="h2">
          Talking about this week
        </span>
        <span className="meta">The Channels with the most new threads</span>
      </div>
      <div className="g3">
        {list.map((c) => (
          <article key={c.id} className="fqm-hot">
            <span className="tag live">{c.recentThreads} new {c.recentThreads === 1 ? 'thread' : 'threads'}</span>
            <span className="h3">
              <Link href={`/channels/${c.slug}`}>{c.name}</Link>
            </span>
            {c.latest && (
              <p className="t2 fqm-hot-quote">
                {c.latest.excerpt}
                <span className="fqm-board-latest-by">
                  {c.latest.author ? ` ${c.latest.author}, ` : ' '}
                  {relativeTime(c.latest.at)}
                </span>
              </p>
            )}
            <span className="row fqm-hot-foot">
              <span className="meta">{c.members.toLocaleString()} tuned in</span>
              <TuneControl c={c} canToggle={canToggle} />
            </span>
          </article>
        ))}
      </div>
    </section>
  )
}

export function FqChannelsBody({
  index,
  params,
  content,
  signedIn,
  canCreate,
}: {
  index: ForumIndex
  params: Params
  content: ChannelsContent
  signedIn: boolean
  canCreate: boolean
}) {
  const { pillars, channels } = index
  const sort = parseChannelSort(params.sort)
  const narrowed = !!(params.q?.trim() || params.pillar || params.show)
  const anyFilter = narrowed || !!params.sort

  const mine = sortChannels(channels.filter((c) => c.tunedIn), sort)
  const trending = trendingChannels(channels, 3)
  const results = sortChannels(filterChannels(channels, params), sort)
  const sections = pillars
    .map((p) => ({ pillar: p, list: sortChannels(channels.filter((c) => c.pillarId === p.id), sort) }))
    .filter((s) => s.list.length > 0)
  const unsorted = sortChannels(channels.filter((c) => !c.pillarId || !pillars.some((p) => p.id === c.pillarId)), sort)
  const startHere = mine[0] ?? trending[0] ?? sortChannels(channels, 'active')[0]
  const pillarOptions = sections.map((s) => ({ value: s.pillar.slug, label: `${s.pillar.name} · ${s.list.length}` }))

  return (
    <MembersBody>
      <div className="head">
        <div>
          <span className="k">Community</span>
          <h1 className="h1">
            <SerifTail text={content.title} />
          </h1>
          <span className="meta">Topics to tune into. Follow a Channel and its conversations reach your feed.</span>
        </div>
        <div className="row wrap">
          {canCreate && (
            <NewChannelCompose
              pillars={pillars.map((p) => ({ id: p.id, name: p.name }))}
              buttonClass="btn pa sm"
            />
          )}
          {content.ctaLabel && content.ctaHref && (
            <a className="btn sm" href={content.ctaHref}>
              {content.ctaLabel}
            </a>
          )}
        </div>
      </div>
      {content.body && <p className="body fqm-intro">{content.body}</p>}

      <div className="fqm-tools">
        <FqFindField action="/channels" value={params.q} placeholder="Search Channels by topic or Pillar" keep={params} />
        <FqFacetMenu label="Pillar" paramKey="pillar" options={pillarOptions} base="/channels" current={params} anyLabel="All Pillars" />
        {signedIn && (
          <FqFacetMenu
            label="Show"
            paramKey="show"
            options={[
              { value: 'tuned', label: 'Tuned in' },
              { value: 'explore', label: 'Not yet tuned in' },
            ]}
            base="/channels"
            current={params}
            anyLabel="Every Channel"
          />
        )}
        <FqFacetMenu
          label="Sort"
          paramKey="sort"
          options={CHANNEL_SORTS.map((s) => ({ value: s, label: CHANNEL_SORT_LABEL[s] }))}
          base="/channels"
          current={params.sort ? params : { ...params, sort: 'active' }}
          clearable={false}
          icon="chart"
        />
        <FqClearLink base="/channels" active={anyFilter} />
      </div>

      {channels.length === 0 ? (
        <EmptyState
          title="No Channels yet."
          description={
            canCreate
              ? 'Start the first one and it appears here, with its threads and the Circles that practice it.'
              : 'Channels appear here as soon as the team sets them up.'
          }
        />
      ) : narrowed ? (
        <section className="sec" aria-label="Results">
          <div className="sec-h">
            <span className="h2">Results</span>
            <span className="meta">
              {results.length} {results.length === 1 ? 'Channel' : 'Channels'}
            </span>
          </div>
          {results.length > 0 ? (
            <ul className="fqm-board">
              {results.map((c) => (
                <Row key={c.id} c={c} canToggle={signedIn} showPillar />
              ))}
            </ul>
          ) : (
            <EmptyState
              variant="no-results"
              title="No Channels match."
              description="Try fewer words, another Pillar, or start the Channel you were looking for."
              action={
                <Link className="btn sm" href="/channels">
                  See every Channel
                </Link>
              }
            />
          )}
        </section>
      ) : (
        <>
          {signedIn && (
            <section className="sec" aria-labelledby="fq-ch-mine">
              <div className="sec-h">
                <span id="fq-ch-mine" className="h2">
                  Your Channels
                </span>
                <span className="meta">{mine.length > 0 ? 'Where you are tuned in' : 'Nothing tuned in yet'}</span>
              </div>
              {mine.length > 0 ? (
                <ul className="fqm-board">
                  {mine.map((c) => (
                    <Row key={c.id} c={c} canToggle showPillar />
                  ))}
                </ul>
              ) : (
                <div className="soft stack">
                  <span className="h3">Tune in to a Channel and it lives here.</span>
                  <span className="t2">Its threads reach your feed, and the Circles that practice it show up first.</span>
                </div>
              )}
            </section>
          )}

          <Trending list={trending} canToggle={signedIn} />

          {startHere && (
            <div className="soft row wrap sec fqm-start">
              <span className="grow stack fqm-gap-sm">
                <span className="h3">Have something to say?</span>
                <span className="t2">
                  {signedIn
                    ? `Open a Channel and start a thread. ${startHere.name} is a good place to begin.`
                    : 'Sign in to tune in to a Channel and start a thread.'}
                </span>
              </span>
              <Link className="btn pa" href={signedIn ? `/channels/${startHere.slug}` : '/sign-in?next=%2Fchannels'}>
                {signedIn ? 'Start a thread' : 'Sign in to join in'}
              </Link>
            </div>
          )}

          {sections.map(({ pillar, list }) => {
            const shown = list.slice(0, PER_PILLAR)
            return (
              <section key={pillar.id} className="sec" id={`channel-${pillar.slug}`} aria-labelledby={`fq-ch-${pillar.slug}`}>
                <div className="sec-h">
                  <span id={`fq-ch-${pillar.slug}`} className="h2">
                    {pillar.name}
                  </span>
                  <span className="meta">{pillar.description ?? `${list.length} Channels`}</span>
                </div>
                <ul className="fqm-board">
                  {shown.map((c) => (
                    <Row key={c.id} c={c} canToggle={signedIn} showPillar={false} />
                  ))}
                </ul>
                {list.length > shown.length && (
                  <Link className="btn txt sm fqm-more" href={hrefWith('/channels', params, { pillar: pillar.slug })}>
                    See all {list.length} in {pillar.name}
                    <FqIcon name="arrow" />
                  </Link>
                )}
              </section>
            )
          })}

          {unsorted.length > 0 && (
            <section className="sec" aria-labelledby="fq-ch-other">
              <div className="sec-h">
                <span id="fq-ch-other" className="h2">
                  More Channels
                </span>
                <span className="meta">Not yet sorted into a Pillar</span>
              </div>
              <ul className="fqm-board">
                {unsorted.map((c) => (
                  <Row key={c.id} c={c} canToggle={signedIn} showPillar={false} />
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </MembersBody>
  )
}
