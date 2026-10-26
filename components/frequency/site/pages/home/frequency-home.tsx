// THE HOME PAGE BODY under the Frequency design: templates/website/Home.html, section by section, in the
// "site" kit's markup plus Home's own styles (.pa-home in app/themes/frequency/site-pages-a.css).
//
//   01 Hero       the Browse / Host switch, the location pill, the shared brand headline, the signature ticker
//   02 Fold       the vision told over a pinned stage of photos, ending in the two path doors
//   03 Story      four chapters per side (Find, Show up, Come back, Pass it on), with "Live this week"
//   04 Features   six ways to be in the room / six things you can make
//   05 Weave      how both sides' steps thread together (client island, ./weave.tsx)
//   03y Beta      the beta announcement band: free until December 1, founding members, one Join the beta button
//   06 Manifesto  "Sacred, not serious."
//   Dock          the Browse / Host switch and Join the beta, pinned once the hero has gone
//
// THE BETA (owner, 2026-10-14, since moved to December 1 by the 2026-10-19 ruling; OPENING_DATE_LABEL in lib/site.ts is the one date, year included): "We're in beta until January 1, let's announce that and do clear calls to
// action into our beta sign up. Each feature CTA leads to the same beta intake flow." So the hero carries
// the beta pill and ONE primary (Join the beta), a band after the story says it again, and every feature
// CTA on this page (the chapter Acts, the path doors, the "Live this week" host button, the closer, the
// dock) goes to SITE.join, the three-step beta entry at /join. Anchors that only move down this page
// ("See how it works") and "Browse this week" (it opens the real list) stay navigation.
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

import '@/app/themes/active/site-pages-a'
import type { CSSProperties, ReactNode } from 'react'
import Link from 'next/link'
import { OPENING_DATE_LABEL } from '@/lib/site'
import { homeFaq } from '@/lib/marketing/quick-answers'
import { FqIcon, type FqIconName } from '@/components/frequency/icon'
import { getActiveCircleCount, getRankedSpaces, getWhatsOn, type SiteEvent } from '../shared/data'
import { SITE } from '../shared/links'
import { Acts, aura, Chapter, LocPill, photo, WhatsOnList } from '../shared/parts'
import { HomeMotion } from './home-motion'
import { Weave } from './weave'
import { WEAVE } from './weave-data'

const SIG = 'Gather like it matters.'

/** The shared beta label keeps the pill, band and closer on the same date. */
const BETA_UNTIL = OPENING_DATE_LABEL
const BETA_CTA = 'Join the beta'

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
  { icon: 'circle', name: 'Circle', vp: 'You join', ve: 'You run', pp: 'A small group around one activity, with its own meeting times.', pe: 'Choose a time and invite people to meet regularly.' },
  { icon: 'event', name: 'Event', vp: 'You go', ve: 'You throw', pp: 'Find a one-off gathering you’d like to try.', pe: 'Greet guests and manage tickets. Paid tickets start at Business.' },
  { icon: 'program', name: 'Program', vp: 'You move through', ve: 'You design', pp: 'Follow the program’s sessions and meeting dates.', pe: 'A path your Circle walks together, step by step.' },
  { icon: 'host', name: 'Experience', vp: 'You host', ve: 'You hand off', pp: 'Open your living room, garden or local park.', pe: 'Regulars running gatherings under your Space.' },
  { icon: 'checkin', name: 'Check-in', vp: 'You arrive', ve: 'You remember', pp: 'Follow the check-in instructions at the door.', pe: 'See who checked in and welcome them by name.' },
  { icon: 'membership', name: 'Membership', vp: 'You belong', ve: 'You sustain', pp: 'Join a Space with a recurring membership.', pe: 'Offer a recurring membership with clearly listed benefits.' },
]

/** Both halves of a two-sided line. */
// The space between the two sides is for readers of the text alone (crawlers, screen readers reading
// both): the kit CSS hides one side, so on screen it costs nothing, and without it the home H1 was
// indexed as one run-on sentence ("...near you.Host local events...").
function Sided({ p, e }: { p: ReactNode; e: ReactNode }) {
  return (
    <>
      <span className="p-only">{p}</span>{' '}
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
      {/* SCAN-1120: the hero photo is a CSS background, which the browser only discovers after the
          stylesheet parses. React hoists this link into <head> so the LCP image starts fetching with
          the document. Only the default side (experiences) is preloaded; the other is a stored choice. */}
      <link rel="preload" as="image" href="/brand/frequency/broll/yoga-rave-uv-swirl-web.jpg" fetchPriority="high" />

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
            <Link className="beta-pill" href={SITE.join}>
              <i className="fq-breathe" aria-hidden="true" />
              <span>
                Free while in beta <em aria-hidden="true">·</em> through {BETA_UNTIL}
              </span>
            </Link>
            <h1 className="h-xl">
              Build circles, <em className="fq-iri-text">not walls.</em>
            </h1>
            <div className="h-foot">
              <div className="lede">
                <p className="p-only">
                  Find local groups and community events near you. Try a walk, a class or a regular Circle.
                  Pick something you like doing and a time you’re free. Free to join.
                </p>
                <p className="e-only">
                  Give your community a place to find the next class, Circle or gathering. Open a Space, share your
                  dates, and keep in touch with the people who come.
                </p>
              </div>
              {/* One primary for both sides: the beta entry is one door for people and Spaces. */}
              <div className="ctas">
                <Link className="btn fq-iri-btn" href={SITE.join}>
                  {BETA_CTA}
                </Link>
                <a className="btn btn-ghost fq-iri-rim" href="#weave">
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
              {/* A fold photo is never wider than 300px, so it is served from photos/sm (640px, ~50KB) and the
                  1600px original only to a screen that asks for more. Six full-size decodes were what made
                  the pinned stage stutter and arrive late on a phone. */}
              {/* eslint-disable-next-line @next/next/no-img-element -- decorative, sized by .fl-ph img */}
              <img
                loading="lazy"
                decoding="async"
                src={photo(`sm/${file}`)}
                srcSet={`${photo(`sm/${file}`)} 640w, ${photo(file)} 1600w`}
                sizes="(max-width:760px) 180px, 300px"
                alt=""
              />
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
              Find a gathering near you. Try a Thursday. <em className="fq-iri-text">Come back if it feels right.</em>
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
                <Link className="pd l" href={SITE.join}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- decorative backdrop, sized by .pd img */}
                  <img loading="lazy" decoding="async" src={photo('day-parachute-play.jpg')} alt="" />
                  <span className="dk">Path one</span>
                  <b>I’m looking for an experience.</b>
                  <span className="dp">Find a local Circle, a walk or a night out. Choose a gathering to try. Free to join.</span>
                  <span className="dg">{BETA_CTA} →</span>
                </Link>
              </div>
              <div className="pdw r">
                <span className="pdg" />
                <Link className="pd r" href={SITE.join}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- decorative backdrop, sized by .pd img */}
                  <img loading="lazy" decoding="async" src={photo('gathering-07.jpg')} alt="" />
                  <span className="dk">Path two</span>
                  <b>I want to host an experience.</b>
                  <span className="dp">Studios, cafés, clubs and hosts. Share your next gathering and invite people along.</span>
                  <span className="dg">{BETA_CTA} →</span>
                </Link>
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
              <Sided p="See what’s happening near you." e="Help people find your next gathering." />
            </h2>
            <p className="body-l p-only">
              One calendar for your town. Circles you can keep coming back to, events, programs, experiences. Pick
              something you like doing and a time you’re free.
            </p>
            <p className="body-l e-only">
              Open a Space for free and post your next class, Circle or event. People can find your dates on the
              local calendar and visit your page to learn more.
            </p>
            <Acts
              className="p-only"
              items={[
                { href: SITE.join, icon: 'pin', title: 'Join to set your town', sub: 'See what meets near you' },
                { href: SITE.join, icon: 'event', title: 'Join to browse this week', sub: 'Circles, events, programs' },
                { href: SITE.join, icon: 'circle', title: 'Join to pick a Circle', sub: 'Check the group’s meeting times' },
              ]}
            />
            <Acts
              className="e-only"
              items={[
                { href: SITE.join, icon: 'space', title: 'Join to open your Space', sub: 'Add your name and next gathering' },
                { href: SITE.join, icon: 'page', title: 'Join to set up your page', sub: 'Change it yourself, anytime' },
                { href: SITE.join, icon: 'event', title: 'Join to post your first experience', sub: 'A Circle, an event or a program' },
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
              Scan an eligible QR code when you arrive and follow the check-in confirmation.
            </p>
            <p className="body-l e-only">
              Invite people to scan your QR code when they arrive. See who checked in and who’s new, so you can
              welcome first-timers by name.
            </p>
            <Acts
              className="p-only"
              items={[
                { href: SITE.join, icon: 'ticket', title: 'Join to RSVP to an event', sub: 'Check the entry details' },
                { href: SITE.join, icon: 'checkin', title: 'Join to check in at the door', sub: 'See your check-in record' },
                { href: SITE.join, icon: 'contacts', title: 'Join to meet your Circle', sub: 'Find a time to meet again' },
              ]}
            />
            <Acts
              className="e-only"
              items={[
                { href: SITE.join, icon: 'qr', title: 'Join to print your door QR', sub: 'One code for every experience' },
                { href: SITE.join, icon: 'ticket', title: 'Join to run your guest list', sub: 'Paid tickets start at Business' },
                { href: SITE.join, icon: 'nudge', title: 'Join to greet first-timers', sub: 'Read their check-in history' },
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
                      Gatherings on <em className="fq-iri-text">your local calendar.</em>
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
              <Link className="btn fq-iri-btn e-only" href={SITE.join}>
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
              <Sided p="A regular time to gather." e="Give them a rhythm." />
            </h2>
            <p className="body-l p-only">
              A regular Circle gives you a time and place to meet again. Try a Thursday walk or a weekly class,
              and take your time getting to know the people there.
            </p>
            <p className="body-l e-only">
              Set a regular time for your Circle, plan a program people can follow together, or offer a membership.
              Give people a clear way to find the next date.
            </p>
            <Acts
              className="p-only"
              items={[
                { href: SITE.join, icon: 'circle', title: 'Join to find a Circle', sub: 'A place to keep coming back' },
                { href: SITE.join, icon: 'program', title: 'Join to start a program', sub: 'Check the sessions and dates' },
                { href: SITE.join, icon: 'zap', title: 'Join to follow your Circle', sub: 'See activity through the season' },
              ]}
            />
            <Acts
              className="e-only"
              items={[
                { href: SITE.join, icon: 'circle', title: 'Join to run a Circle', sub: 'The heartbeat of a Space' },
                { href: SITE.join, icon: 'program', title: 'Join to build a program', sub: 'A path your Circle walks together' },
                { href: SITE.join, icon: 'membership', title: 'Join to sell memberships', sub: 'Set out the included benefits' },
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
            <img loading="lazy" decoding="async" className="e-only" src={photo('night-yoga-rave-web.jpg')} alt="People gathering at night" />
          </div>
          <div>
            <span className="n">
              04 · <Sided p="Pass it on" e="Grow" />
            </span>
            <h2 className="h-l">
              <Sided p="Bring someone. Then host." e="Invite someone to host with you." />
            </h2>
            <p className="body-l p-only">
              Know someone who’d like the next gathering? Send them an invitation. If you want to host, start with
              a walk, a shared meal or a Circle of your own.
            </p>
            <p className="body-l e-only">
              Share the hosting with a regular, or invite another local group to gather with you. Paid Space plans
              and introduction fees are separate. Your own bookings carry no network fee, plus card processing.
            </p>
            <Acts
              className="p-only"
              items={[
                { href: SITE.join, icon: 'message', title: 'Join to invite a friend', sub: 'Invites anyone can open' },
                { href: SITE.join, icon: 'host', title: 'Join to host an experience', sub: 'Your living room counts' },
                { href: SITE.join, icon: 'circle', title: 'Join to start a Circle', sub: 'Choose a time to meet again' },
              ]}
            />
            <Acts
              className="e-only"
              items={[
                { href: SITE.join, icon: 'standing', title: 'Join to watch your standing', sub: 'Earned, never bought' },
                { href: SITE.join, icon: 'host', title: 'Join to hand a Circle to a regular', sub: 'Share the next gathering' },
                { href: SITE.join, icon: 'gem', title: 'Join to see how it pays', sub: '0% on your regulars, plus card processing' },
              ]}
            />
          </div>
        </Chapter>
      </section>

      <section className="sec beta-band" id="beta" data-time="night" data-night="uv" data-energy="charge" data-screen-label="03y Beta">
        <div className="fq-aura" style={aura(0.35)} />
        <div className="fq-grain" />
        <div className="wrap">
          <div className="bb">
            <div>
              <span className="lv-live">
                <i className="fq-breathe" />
                Open beta
              </span>
              <h2 className="h-l">
                Frequency is in beta. <em className="fq-iri-text">Help us build it.</em>
              </h2>
              <p className="body-l">
                Free until {BETA_UNTIL}. Founding members set the rhythm here, and you can tell us what you notice as you try the Circles and tools.
              </p>
            </div>
            <div className="bb-side">
              <ul className="bb-facts">
                <li>
                  <b>$0</b>
                  <span>until {BETA_UNTIL}</span>
                </li>
                <li>
                  <b>3</b>
                  <span>sign-up steps</span>
                </li>
              </ul>
              <Link className="btn fq-iri-btn" href={SITE.join}>
                {BETA_CTA}
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="sec" id="features" data-screen-label="04 Ways to gather">
        <div className="wrap">
          <div className="label">
            <b>What’s inside</b>Ways to gather
          </div>
          <h2 className="h-l" style={{ marginTop: 24, maxWidth: '18ch' }}>
            <Sided p="Build community around a walk, a class, a Thursday." e="Give your community a place to gather." />
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
            Choose a step to follow the thread. Switch sides to see the host’s view.
          </p>
          <Weave stages={WEAVE} />
        </div>
      </section>

      {/* 07 Questions: the same answers the page's FAQPage markup carries (SCAN-1112), in the kit's .qa rows. */}
      <section className="sec" id="questions" data-screen-label="07 Questions">
        <div className="wrap">
          <div className="sh">
            <div className="label">
              <b>Questions</b>Asked and answered
            </div>
            <h2 className="h-l">Before you jump in.</h2>
          </div>
          <div className="qa">
            {homeFaq().map((f) => (
              <details key={f.q}>
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
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
            Come as you are. <em className="fq-iri-text">Find a way to gather.</em>
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
            The quiet morning and the loud night. A community table, a walk with neighbors, a dance floor.
            There’s more than one way to gather. Find one you’d like to try, or make a place for others to join you.
          </p>
          <div className="ctas">
            <Link className="btn fq-iri-btn" href={SITE.join}>
              {BETA_CTA}
            </Link>
          </div>
          <p className="closer-beta">Free while in beta, through {BETA_UNTIL}.</p>
        </div>
      </section>

      {/* The dock: the Browse / Host switch and the beta button, pinned to the bottom once the hero has
          scrolled away (the shell's FX loop toggles `.on`). Below 560px the switch drops "Community" so
          the button fits a 375px phone. */}
      <div className="dock">
        <div className="sw" role="group" aria-label="Browse or host">
          <span className="thumb" />
          <button type="button" data-set="p" aria-pressed="true">
            <i />
            Browse<span className="dk-w"> Community</span>
          </button>
          <button type="button" data-set="e" aria-pressed="false">
            <i />
            Host<span className="dk-w"> Community</span>
          </button>
        </div>
        <Link className="btn fq-iri-btn" href={SITE.join}>
          {BETA_CTA}
        </Link>
      </div>
    </div>
  )
}
