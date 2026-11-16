// /north-county-san-diego on the Frequency design: the editorial, always-indexable page for the founding
// towns (SCAN-1209). Kit sections only (.phero via DxHero, .sec > .wrap, .sh, .g3 > .pc, .qa, KeepGoing),
// every colour a kit token. A town card links to its /discover/cities/<slug> page, which fills in with
// real Circles and Events as hosts post them. Server component, no request data.
import Link from 'next/link'
import { KeepGoing } from '@/components/frequency/site/shell/keep-going'
import { DxHero, DxHead, dxPhoto } from '@/components/frequency/site/pages/discover/parts'
import { ROUTES } from '@/lib/frequency/site-nav'
import { FOUNDING_PLACE } from '@/lib/site'
import {
  NORTH_COUNTY_LEDE,
  NORTH_COUNTY_TOWNS,
  northCountyFaq,
} from '@/lib/marketing/north-county'

export function FrequencyNorthCounty() {
  return (
    <>
      <DxHero
        crumbs={[{ label: 'North County San Diego' }]}
        photo={dxPhoto('day-park-yoga.jpg')}
        title={
          <>
            Find your people in <em className="fq-iri-text">North County.</em>
          </>
        }
        lede={NORTH_COUNTY_LEDE}
      />

      <section className="sec" id="towns" data-screen-label="02 Towns">
        <div className="wrap">
          <DxHead
            label={`${NORTH_COUNTY_TOWNS.length} towns`}
            sub={FOUNDING_PLACE}
            title="Start where you live."
            lede="Each town has its own page. It fills in with local Circles and public Events as hosts post them."
          />
          <div className="g3">
            {NORTH_COUNTY_TOWNS.map((t) => (
              <Link key={t.slug} className="pc" id={t.slug} href={`/discover/cities/${t.slug}`}>
                <h3>{t.name}</h3>
                <p>{t.blurb}</p>
                <span>{`Groups and events in ${t.name} →`}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="sec" id="questions" data-screen-label="03 Questions">
        <div className="wrap">
          <DxHead label="Questions" sub="Asked and answered" title="Local groups, answered." />
          <div className="qa">
            {northCountyFaq().map((f) => (
              <details key={f.q}>
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <KeepGoing
        title="Be the first in your town."
        body="Join free, then start a Circle or post an Event. Neighbors find it in What's happening."
        primary={{ href: ROUTES.createSpace, label: 'Open your Space' }}
        secondary={{ href: '/discover/events', label: "See what's happening" }}
      />
    </>
  )
}
