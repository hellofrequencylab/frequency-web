// THE HOME PAGE BODY under the Frequency design: templates/website/Home.html, section by section, in the
// "site" kit's markup plus Home's own styles (.pa-home in app/themes/frequency/site-pages-a.css).
//
//   01 Hero       the Browse / Host switch, the location pill, the two-sided headline, the signature ticker
//   02 Fold       the vision told over a pinned stage of photos, ending in the two path doors
//   03 Story      four chapters per side (Find, Show up, Come back, Pass it on), with "Live this week"
//   04 Features   six ways to be in the room / six things you can make
//   05 Weave      how both sides' steps thread together (client island, ./weave.tsx)
//   06 Manifesto  "Sacred, not serious."
//   Dock          the Browse / Host switch, pinned once the hero has gone
//
// The owner's call (2026-10-13): under Frequency, `/` renders the design's content, not the published
// page-editor document. DAWN still renders that document; app/page.tsx picks between them.
//
// SIDES. Every two-sided line renders both halves (`.p-only` / `.e-only`); the kit root's `data-side`,
// owned by the shell lane, hides one. The Browse / Host buttons carry `data-set` for the shell to act on.
//
// SAMPLE DATA REPLACED (../shared/data.ts): the hero pill's "San Diego · 48 Circles and events this week",
// the Find chapter's map, the "Live this week" strip and its map read the real calendar and the Spaces
// directory; with eight or more events a second strip runs the other way, as the design's does. The
// design's "212 people checked in at a Circle near you last week" has no public figure
// behind it; the stat shows the network's active Circle count instead, and drops out if that read fails.

import '@/app/themes/frequency/site-pages-a.css'
import type { CSSProperties, ReactNode } from 'react'
import Link from 'next/link'
import { FqIcon, type FqIconName } from '@/components/frequency/icon'
import { getActiveCircleCount, getRankedSpaces, getWhatsOn, type SiteEvent } from '../shared/data'
import { feature, SITE } from '../shared/links'
import { Acts, aura, Chapter, LocPill, photo, WhatsOnList } from '../shared/parts'
import { HomeMotion } from './home-motion'
import { Weave } from './weave'
import { WEAVE } from './weave-data'

const SIG = 'Gather like it matters.'

/** The fold's floating photos: [file, data-d depth, position + size]. Verbatim from the design. */
const FOLD_PHOTOS: [string, number, CSSProperties][] = [
  ['day-park-yoga.jpg', 1.4, { left: '4%', top: '14%', width: 'clamp(150px,17vw,260px)', aspectRatio: '3/4' }],
  ['night-string-lights-web.jpg', 0.7, { right: '6%', top: '8%', width: 'clamp(170px,20vw,300px)', aspectRatio: '4/3' }],
  ['gathering-03.jpg', 1.9, { left: '12%', bottom: '6%', width: 'clamp(140px,15vw,230px)', aspectRatio: '1' }],
  ['day-meditation-circle.jpg', 1.1, { right: '12%', bottom: '10%', width: 'clamp(150px,16vw,240px)', aspectRatio: '3/4' }],
  ['gathering-05.jpg', 2.4, { left: '40%', top: '4%', width: 'clamp(110px,11vw,170px)', aspectRatio: '1' }],
  ['night-yoga-rave-web.jpg', 1.6, { left: '46%', bottom: '2%', width: 'clamp(120px,12vw,190px)', aspectRatio: '4/3' }],
]

const FEATS: { icon: FqIconName; name: string; vp: string; ve: string; pp: string; pe: string }[] = [
  { icon: 'circle', name: 'Circle', vp: 'You join', ve: 'You run', pp: 'A small group around one thing. The faces start to know yours.', pe: 'Your steady place. Members, a time, a door.' },
  { icon: 'event', name: 'Event', vp: 'You go', ve: 'You throw', pp: 'One-off gatherings worth staying out for.', pe: 'Tickets, a guest list and refunds in one place.' },
  { icon: 'program', name: 'Program', vp: 'You move through', ve: 'You design', pp: 'A few weeks with the same group, start to finish.', pe: 'A path your Circle walks together, step by step.' },
  { icon: 'host', name: 'Experience', vp: 'You host', ve: 'You hand off', pp: 'Open your living room, garden or local park.', pe: 'Regulars running gatherings under your Space.' },
  { icon: 'checkin', name: 'Check-in', vp: 'You arrive', ve: 'You remember', pp: 'Scan at the door. Zaps for being there.', pe: 'Everyone who came, kept in your contact list.' },
  { icon: 'membership', name: 'Membership', vp: 'You belong', ve: 'You sustain', pp: 'Your spot, saved whenever you come.', pe: 'Recurring support that drops people into their Circle.' },
]

/** Both halves of a two-sided line. */
function Sided({ p, e }: { p: ReactNode; e: ReactNode }) {
  return (
    <>
      <span className="p-only">{p}</span>
      <span className="e-only">{e}</span>
    </>
  )
}

function LiveCard({ ev, hidden }: { ev: SiteEvent; hidden?: boolean }) {
  return (
    <Link className="lv-c" href={ev.href} aria-hidden={hidden || undefined} tabIndex={hidden ? -1 : undefined}>
      <span className="lv-i">
        <FqIcon name={ev.icon} />
      </span>
      <span className="lv-t">
        <small>{ev.when}</small>
        <b>{ev.title}</b>
        {ev.where && <em>{ev.where}</em>}
      </span>
      <i>{ev.tag}</i>
    </Link>
  )
}

export async function FrequencyHome() {
  const [on, ranked, circles] = await Promise.all([getWhatsOn(12), getRankedSpaces(6), getActiveCircleCount()])
  const weekLine = on.thisWeek > 0 ? `${on.thisWeek} ${on.thisWeek === 1 ? 'event' : 'events'} this week` : null
  const strip = on.events.slice(0, 8)
  // The strip scrolls as a seamless loop (the track is two copies, translated -50%). With only a few
  // events a loop just repeats them in view, so a short list sits still instead.
  const loop = strip.length >= 4
  const strip2 = on.events.length >= 8 ? [...on.events.slice(4), ...on.events.slice(0, 4)].slice(0, 8) : []
  const listTitle = on.city ? `This week in ${on.city}` : 'Coming up'

  return (
    <div className="pa-page pa-home" data-motion-scope style={{ display: 'contents' }}>
      <HomeMotion />

      <section className="hero" data-time="night" data-night="uv" data-energy="charge" data-screen-label="01 Hero">
        <div className="bg p" />
        <div className="bg e" />
        <div className="fq-aura" style={aura(0.3)} />
        <div className="shade" />
        <div className="fq-grain" />
        <div className="wrap">
          <div className="h-top">
            <div className="h-ctl">
              <div className="sw big" role="group" aria-label="Browse or host">
                <span className="thumb" />
                <button type="button" data-set="p" aria-pressed="true">
                  Browse Community
                </button>
                <button type="button" data-set="e" aria-pressed="false">
                  Host Community
                </button>
              </div>
              <LocPill href={SITE.join} city={on.city} line={weekLine} />
            </div>
          </div>
          <div className="h-main">
            <h1 className="h-xl">
              <Sided
                p={
                  <>
                    Find local groups and events <em className="fq-iri-text">near you.</em>
                  </>
                }
                e={
                  <>
                    Host local events and groups people <em className="fq-iri-text">come back to.</em>
                  </>
                }
              />
            </h1>
            <div className="h-foot">
              <div className="lede">
                <p className="p-only">
                  A hundred contacts. No one to call on a Tuesday. Frequency is where you find the people near you, and
                  keep finding them, around something you like doing. Free to join, and built to get you off your
                  phone.
                </p>
                <p className="e-only">
                  Studios, cafés, coaches, clubs and venues: every Space is making an experience. Frequency puts your
                  Circles and events on the calendar your town reads, remembers who came, and gives them a reason to
                  come back.
                </p>
              </div>
              <div className="ctas">
                <Link className="btn fq-iri-btn p-only" href={SITE.people}>
                  Find your Circle
                </Link>
                <a className="btn btn-ghost fq-iri-rim p-only" href="#weave">
                  See how it works
                </a>
                <Link className="btn fq-iri-btn e-only" href={SITE.spaces}>
                  Open your Space
                </Link>
                <a className="btn btn-ghost fq-iri-rim e-only" href="#weave">
                  See how it works
                </a>
              </div>
            </div>
          </div>
          <div className="h-sig" role="text" aria-label={SIG}>
            <div className="h-sig-track" aria-hidden="true">
              {[0, 1].map((run) => (
                <span className="h-sig-run" key={run}>
                  {[0, 1, 2, 3].map((i) => (
                    <span key={i} style={{ display: 'contents' }}>
                      <span className="fill">{SIG}</span>
                      <span className="fq-logo-icon fq-iridescent" />
                    </span>
                  ))}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="fold" id="fold" data-screen-label="02 Vision + choose your path">
        <div className="fold-stage">
          {FOLD_PHOTOS.map(([file, d, style]) => (
            <div className="fl-ph" data-d={d} style={style} key={file}>
              {/* eslint-disable-next-line @next/next/no-img-element -- decorative, sized by .fl-ph img */}
              <img loading="lazy" decoding="async" src={photo(file)} alt="" />
            </div>
          ))}
          <div className="fl-shade" />
          <div className="fl-txt fl-first" data-in="-1 -.5" data-out=".14 .2">
            <span className="label" style={{ justifyContent: 'center' }}>
              <b>Frequency</b>The vision
            </span>
            <p className="fl-big">
              Somewhere in your town, people are gathering <em className="fq-iri-text">on purpose.</em>
            </p>
          </div>
          <div className="fl-txt" data-in=".18 .26" data-out=".36 .42">
            <p className="fl-big">A Thursday Circle. A community table. A night that runs late.</p>
          </div>
          <div className="fl-txt" data-in=".38 .45" data-out=".5 .56">
            <p className="fl-big">
              Frequency is how they find each other, and why they keep <em className="fq-iri-text">coming back.</em>
            </p>
          </div>
          <div className="fl-fork" data-in=".54 .62">
            <span className="label" style={{ justifyContent: 'center' }}>
              <b>Your move</b>Choose your path
            </span>
            <h2 className="h-l" style={{ textAlign: 'center', margin: '18px auto 0' }}>
              Where do you come in?
            </h2>
            <div className="pds">
              <div className="pdw l">
                <span className="pdg" />
                <button type="button" className="pd l" data-set="p" data-go="story">
                  {/* eslint-disable-next-line @next/next/no-img-element -- decorative backdrop, sized by .pd img */}
                  <img loading="lazy" decoding="async" src={photo('day-parachute-play.jpg')} alt="" />
                  <span className="dk">Path one</span>
                  <b>I’m looking for an experience.</b>
                  <span className="dp">Find a Circle, a night, a few weeks with the same people. Free, forever.</span>
                  <span className="dg">Start here →</span>
                </button>
              </div>
              <div className="pdw r">
                <span className="pdg" />
                <button type="button" className="pd r" data-set="e" data-go="story">
                  {/* eslint-disable-next-line @next/next/no-img-element -- decorative backdrop, sized by .pd img */}
                  <img loading="lazy" decoding="async" src={photo('gathering-07.jpg')} alt="" />
                  <span className="dk">Path two</span>
                  <b>I want to host an experience.</b>
                  <span className="dp">Studios, cafés, clubs and hosts. Make the thing people come back for.</span>
                  <span className="dg">Start here →</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="sec" id="story" style={{ paddingBottom: 0 }} data-screen-label="03 Story">
        <div className="fq-aura" style={aura(0.25)} />
        <div className="wrap">
          <div className="label">
            <b>The story</b>
            <Sided p="Told from your side of the door" e="Told from behind the door" />
          </div>
        </div>

        <Chapter label="03a Find">
          <div>
            <span className="n">
              01 · <Sided p="Find" e="Be found" />
            </span>
            <h2 className="h-l">
              <Sided p="See what’s happening near you." e="Land where your town looks." />
            </h2>
            <p className="body-l p-only">
              One calendar for your town. Circles you can keep coming back to, events, programs, experiences. Pick
              something you like doing and a time you’re free.
            </p>
            <p className="body-l e-only">
              Open a Space for free and post what you run. It lands on the calendar your whole town reads, ranked by how
              often you gather, never by who paid.
            </p>
            <Acts
              className="p-only"
              items={[
                { href: SITE.peopleNear, icon: 'pin', title: 'Set your town', sub: 'See what meets near you' },
                { href: SITE.peopleNear, icon: 'event', title: 'Browse this week', sub: 'Circles, events, programs' },
                { href: SITE.people, icon: 'circle', title: 'Pick a Circle', sub: 'Same people, same time' },
              ]}
            />
            <Acts
              className="e-only"
              items={[
                { href: SITE.spaces, icon: 'space', title: 'Open your Space', sub: 'Free, takes ten minutes' },
                { href: feature('f-page'), icon: 'page', title: 'Set up your page', sub: 'Change it yourself, anytime' },
                { href: feature('f-events-s'), icon: 'event', title: 'Post your first experience', sub: 'A Circle, an event or a program' },
              ]}
            />
          </div>
          <div className="chap-map">
            <div className="p-only" style={{ height: '100%' }}>
              <WhatsOnList mode="people" title={listTitle} events={on.events.slice(0, 6)} ok={on.ok} emptyHref={SITE.spaces} style={{ height: '100%' }} />
            </div>
            <div className="e-only" style={{ height: '100%' }}>
              <WhatsOnList
                mode="spaces"
                title={ranked.city ? `Spaces near you in ${ranked.city}` : 'Spaces on Frequency'}
                spaces={ranked.spaces}
                ok={ranked.ok}
                emptyHref={SITE.join}
                style={{ height: '100%' }}
              />
            </div>
          </div>
        </Chapter>

        <Chapter label="03b Show up" rev>
          <div className="photo fq-iri-rim" data-px=".08">
            {/* eslint-disable-next-line @next/next/no-img-element -- the kit sizes .photo img */}
            <img loading="lazy" decoding="async" className="p-only" src={photo('day-parachute-play.jpg')} alt="Adults playing with a parachute in a park" />
            {/* eslint-disable-next-line @next/next/no-img-element -- the kit sizes .photo img */}
            <img loading="lazy" decoding="async" className="e-only" src={photo('gathering-07.jpg')} alt="Guests arriving at a local venue" />
          </div>
          <div>
            <span className="n">
              02 · <Sided p="Show up" e="Open the door" />
            </span>
            <h2 className="h-l">
              <Sided p="Walk in. Check in." e="Know who came." />
            </h2>
            <p className="body-l p-only">
              Scan at the door and you’re counted. Being in the room is the only thing that earns Zaps here. Scrolling
              all evening earns nothing.
            </p>
            <p className="body-l e-only">
              One QR at the door remembers everyone who walked in. First-timers get flagged, so you can say hi before
              they slip out.
            </p>
            <Acts
              className="p-only"
              items={[
                { href: feature('f-events'), icon: 'ticket', title: 'RSVP to an event', sub: 'Or just turn up' },
                { href: feature('f-checkin'), icon: 'checkin', title: 'Check in at the door', sub: '+25 Zaps for being there' },
                { href: SITE.peopleFirstNight, icon: 'contacts', title: 'Meet your Circle', sub: 'See who else came' },
              ]}
            />
            <Acts
              className="e-only"
              items={[
                { href: feature('f-doorqr'), icon: 'qr', title: 'Print your door QR', sub: 'One code for every experience' },
                { href: feature('f-tickets'), icon: 'ticket', title: 'Run your guest list', sub: 'Tickets, refunds, walk-ins' },
                { href: feature('f-firsttimers'), icon: 'nudge', title: 'Greet first-timers', sub: 'Nudges while they’re still in the room' },
              ]}
            />
          </div>
        </Chapter>

        <div className="lv" data-time="night" data-night="uv" data-energy="charge" data-screen-label="03x This week">
          <div className="fq-aura" style={aura(0.4)} />
          <div className="fq-grain" />
          <span className="rings big" data-px="-.18" aria-hidden="true" />
          <div className="wrap lv-head">
            <div>
              <span className="lv-live">
                <i className="fq-breathe" />
                Live this week
              </span>
              <h2 className="h-l">
                <Sided
                  p={
                    <>
                      This week, <em className="fq-iri-text">near you.</em>
                    </>
                  }
                  e={
                    <>
                      What your town is <em className="fq-iri-text">looking for.</em>
                    </>
                  }
                />
              </h2>
            </div>
            <div className="lv-stat">
              {circles !== null && (
                <>
                  <b data-count={circles}>{circles.toLocaleString('en-US')}</b>
                  <span>active Circles on Frequency right now</span>
                </>
              )}
              <Link className="btn fq-iri-btn p-only" href={SITE.peopleNear}>
                Browse this week
              </Link>
              <Link className="btn fq-iri-btn e-only" href={SITE.spaces}>
                Put yours on the calendar
              </Link>
            </div>
          </div>
          <div className="wrap" style={{ position: 'relative', zIndex: 1, marginBottom: 28 }}>
            <WhatsOnList mode="people" title={listTitle} events={on.events} ok={on.ok} emptyHref={SITE.spaces} style={{ height: 'min(560px,72vh)' }} />
          </div>
          {strip.length > 0 && (
            <div className={loop ? 'lv-row' : 'lv-row still'}>
              <div className="lv-track">
                {strip.map((ev) => (
                  <LiveCard key={ev.id} ev={ev} />
                ))}
                {loop && strip.map((ev) => <LiveCard key={`${ev.id}-loop`} ev={ev} hidden />)}
              </div>
            </div>
          )}
          {/* The design's second strip runs the other way, starting further into the week. Only when there
              are enough real events that the two rows do not read as one list twice. */}
          {strip2.length > 0 && (
            <div className="lv-row rev" aria-hidden="true">
              <div className="lv-track">
                {[...strip2, ...strip2].map((ev, i) => (
                  <LiveCard key={`${ev.id}-r${i}`} ev={ev} hidden />
                ))}
              </div>
            </div>
          )}
        </div>

        <Chapter label="03c Come back">
          <div>
            <span className="n">
              03 · <Sided p="Come back" e="Bring them back" />
            </span>
            <h2 className="h-l">
              <Sided p="Same people, same time." e="Give them a rhythm." />
            </h2>
            <p className="body-l p-only">
              Keep coming and the faces start to know yours. One week you’re new, a month later someone saves you a spot.
            </p>
            <p className="body-l e-only">
              Ongoing Circles, programs people move through together, memberships that drop them straight into their
              group. Experiences that repeat are the ones that hold.
            </p>
            <Acts
              className="p-only"
              items={[
                { href: SITE.people, icon: 'circle', title: 'Join a Circle', sub: 'A place to keep coming back' },
                { href: feature('f-programs'), icon: 'program', title: 'Start a program', sub: 'Six weeks, same group' },
                { href: feature('f-zaps'), icon: 'zap', title: 'Keep your streak', sub: 'Zaps for showing up again' },
              ]}
            />
            <Acts
              className="e-only"
              items={[
                { href: feature('f-circles-s'), icon: 'circle', title: 'Run a Circle', sub: 'The heartbeat of a Space' },
                { href: feature('f-programs-s'), icon: 'program', title: 'Build a program', sub: 'A path your Circle walks together' },
                { href: feature('f-memberships'), icon: 'membership', title: 'Sell memberships', sub: 'Members land in their Circle' },
              ]}
            />
          </div>
          <div className="photo fq-iri-rim" data-px=".08">
            {/* eslint-disable-next-line @next/next/no-img-element -- the kit sizes .photo img */}
            <img loading="lazy" decoding="async" className="p-only" src={photo('day-meditation-circle.jpg')} alt="A circle of people sitting together outdoors" />
            {/* eslint-disable-next-line @next/next/no-img-element -- the kit sizes .photo img */}
            <img loading="lazy" decoding="async" className="e-only" src={photo('gathering-09.jpg')} alt="A regular group mid-session at a studio" />
          </div>
        </Chapter>

        <Chapter label="03d Pass it on" rev>
          <div className="photo fq-iri-rim" data-px=".08">
            {/* eslint-disable-next-line @next/next/no-img-element -- the kit sizes .photo img */}
            <img loading="lazy" decoding="async" className="p-only" src={photo('day-beach-hoop.jpg')} alt="Someone dancing on the beach" />
            {/* eslint-disable-next-line @next/next/no-img-element -- the kit sizes .photo img */}
            <img loading="lazy" decoding="async" className="e-only" src={photo('night-yoga-rave-web.jpg')} alt="A full room at night" />
          </div>
          <div>
            <span className="n">
              04 · <Sided p="Pass it on" e="Grow" />
            </span>
            <h2 className="h-l">
              <Sided p="Bring someone. Then host." e="Rise by how often you gather." />
            </h2>
            <p className="body-l p-only">
              The best nights get passed along. Keep coming and someone will ask you to host. That’s how a town gets a
              scene it didn’t have last year.
            </p>
            <p className="body-l e-only">
              Your standing climbs every time your community meets. Hand a Circle to a regular and you’re running two
              experiences. When someone we bring you buys, we take a small share. Your own regulars, you keep all of it.
            </p>
            <Acts
              className="p-only"
              items={[
                { href: feature('f-invites'), icon: 'message', title: 'Invite a friend', sub: 'Invites anyone can open' },
                { href: feature('f-host'), icon: 'host', title: 'Host an experience', sub: 'Your living room counts' },
                { href: feature('f-host'), icon: 'circle', title: 'Start a Circle', sub: 'Become somebody’s regular' },
              ]}
            />
            <Acts
              className="e-only"
              items={[
                { href: feature('f-standing'), icon: 'standing', title: 'Watch your standing', sub: 'Earned, never bought' },
                { href: feature('f-handoff'), icon: 'host', title: 'Hand a Circle to a regular', sub: 'Grow without burning out' },
                { href: SITE.pricing, icon: 'gem', title: 'See how it pays', sub: '0% on your own regulars' },
              ]}
            />
          </div>
        </Chapter>
      </section>

      <section className="sec" id="features" data-screen-label="04 Every feature is an experience">
        <div className="wrap">
          <div className="label">
            <b>What’s inside</b>Every feature is an experience
          </div>
          <h2 className="h-l" style={{ marginTop: 24, maxWidth: '18ch' }}>
            <Sided p="Six ways to be in the room." e="Six things you can make." />
          </h2>
          <div className="feats6">
            {FEATS.map((f) => (
              <div className="fx" key={f.name}>
                <span className="ic">
                  <FqIcon name={f.icon} />
                </span>
                <h3>{f.name}</h3>
                <span className="v p-only">{f.vp}</span>
                <span className="v e-only">{f.ve}</span>
                <p className="p-only">{f.pp}</p>
                <p className="e-only">{f.pe}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="sec" id="weave" style={{ background: 'var(--fq-bg-sunken)' }} data-screen-label="05 The weave">
        <div className="fq-aura" style={aura(0.3)} />
        <div className="wrap">
          <div className="label">
            <b>How it weaves</b>People and experiences, one loop
          </div>
          <h2 className="h-l" style={{ marginTop: 24, maxWidth: '20ch' }}>
            Every step on one side is a step on the other.
          </h2>
          <p className="body-l" style={{ marginTop: 22 }}>
            Hover a step to follow the thread. Toggle sides to change who’s telling it.
          </p>
          <Weave stages={WEAVE} />
        </div>
      </section>

      <section className="closer" data-time="night" data-night="uv" data-energy="charge" data-screen-label="06 Manifesto">
        <div className="bg" />
        <div className="fq-aura" style={aura(0.35)} />
        <div className="shade" />
        <div className="fq-grain" />
        <div className="wrap">
          <p className="label" style={{ justifyContent: 'center', color: 'var(--fq-text-muted)' }}>
            Build circles, not walls
          </p>
          <h2 className="h-xl" style={{ marginTop: 22 }}>
            Sacred, <em className="fq-iri-text">not serious.</em>
          </h2>
          <p
            style={{
              color: 'var(--fq-text-body)',
              fontSize: 'clamp(var(--fq-text-h4),1.7vw,var(--fq-text-h3))',
              lineHeight: 1.55,
              maxWidth: '46ch',
              margin: '28px auto 0',
            }}
          >
            The quiet morning and the loud night. The community table and the dance floor. Different communities, same
            reason: being with your people, on purpose. We measure success by who showed up this week.
          </p>
          <div className="ctas">
            <Link className="btn fq-iri-btn" href={SITE.people}>
              Find your Circle
            </Link>
            <Link className="btn btn-ghost fq-iri-rim" href={SITE.spaces}>
              Open your Space
            </Link>
          </div>
        </div>
      </section>

      {/* The dock: the Browse / Host switch, pinned to the bottom once the hero has scrolled away (the
          shell's FX loop toggles `.on`). */}
      <div className="dock">
        <div className="sw" role="group" aria-label="Browse or host">
          <span className="thumb" />
          <button type="button" data-set="p" aria-pressed="true">
            <i />
            Browse Community
          </button>
          <button type="button" data-set="e" aria-pressed="false">
            <i />
            Host Community
          </button>
        </div>
      </div>
    </div>
  )
}
