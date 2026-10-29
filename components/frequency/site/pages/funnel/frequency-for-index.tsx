// /for on the Frequency design: the index of the operator doors (six core niches and seven profiles). Standard site header, footer and
// kit sections (phero, sec, tg-card, KeepGoing); every colour is a kit token. The cards read the same
// registry and photo table as the doors themselves, so a door's headline and picture never drift here.
import Link from 'next/link'
import { KeepGoing } from '@/components/frequency/site/shell/keep-going'
import '@/app/themes/active/site-pages-b'
import { ChapPhoto } from '../shared/parts'
import { NICHE_DESIGN, NICHE_PHOTO_DIR } from '@/lib/marketing/funnel-design'
import type { FunnelConfig } from '@/lib/marketing/funnel-config'
import { ROUTES } from '@/lib/frequency/site-nav'

function vars(v: Record<string, string | number>): React.CSSProperties {
  return v as React.CSSProperties
}

export function FrequencyForIndex({ doors }: { doors: FunnelConfig[] }) {
  return (
    <>
      <section className="phero" data-energy="charge" data-screen-label="01 Hero">
        <div className="bg" style={{ backgroundImage: `url('${NICHE_PHOTO_DIR}/day-park-yoga.jpg')` }} />
        <div className="fq-aura" style={vars({ '--fq-aura-opacity': 0.3 })} />
        <div className="shade" />
        <div className="fq-grain" />
        <div className="wrap">
          <nav className="crumbs" aria-label="Breadcrumb">
            <Link href="/">Home</Link>
            <span aria-hidden="true">/</span>
            <span aria-current="page">For your work</span>
          </nav>
          <h1 className="h-xl">
            Which door <em className="fq-iri-text">fits you?</em>
          </h1>
          <p>
            Every door opens the same Space. Pick the one that sounds like your work, and see what Frequency does for it in North
            County San Diego.
          </p>
        </div>
      </section>

      <section className="sec pb-sec" id="doors" data-screen-label="02 The doors">
        <div className="fq-aura" style={vars({ '--fq-aura-opacity': 0.22 })} />
        <div className="wrap">
          <div className="sh">
            <div className="label">
              <b>{doors.length} doors</b>One home for how you work
            </div>
            <h2 className="h-l">Start where you are.</h2>
          </div>
          <div className="tg-row three">
            {doors.map((c) => {
              const design = NICHE_DESIGN[c.slug]
              return (
                <Link key={c.slug} href={`/for/${c.slug}`} className="tg-card tg-door">
                  {design && <ChapPhoto src={`${NICHE_PHOTO_DIR}/${design.photo}`} alt="" />}
                  <span className="tg-door-k">{c.hero.eyebrow}</span>
                  <h3>{c.hero.h1}</h3>
                  <p>{c.hero.subhead}</p>
                  <span className="tg-door-go">See your door →</span>
                </Link>
              )
            })}
          </div>
        </div>
      </section>

      <KeepGoing
        title="Not sure which one?"
        body="Open your Space free and pick later. Everything is in the same place."
        primary={{ href: ROUTES.createSpace, label: 'Open your Space' }}
        secondary={{ href: '/pricing', label: 'See pricing' }}
      />
    </>
  )
}
