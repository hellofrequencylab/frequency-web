// /for on the Frequency design: the index of the operator doors (six core niches and seven profiles). Standard site header, footer and
// kit sections (sec, sh, KeepGoing); every colour is a kit token. The cards read the same
// registry and photo table as the doors themselves, so a door's headline and picture never drift here.
//
// Layout (site-funnel.css, fo-): an audience chooser. The hero sets the question beside a collage of three
// gatherings; the doors below are persona tiles, each a full photo with the door's own words on a glass
// panel, the first one large. On a phone a tile is a row: the photo beside the words.
import Link from 'next/link'
import { KeepGoing } from '@/components/frequency/site/shell/keep-going'
import '@/app/themes/active/site-pages-b'
import '@/app/themes/active/site-funnel'
import { photoImg } from '../shared/parts'
import { NICHE_DESIGN, NICHE_PHOTO_DIR } from '@/lib/marketing/funnel-design'
import type { FunnelConfig } from '@/lib/marketing/funnel-config'
import { ROUTES } from '@/lib/frequency/site-nav'

function vars(v: Record<string, string | number>): React.CSSProperties {
  return v as React.CSSProperties
}

/** The hero collage: three gatherings no door uses, so no photo shows twice on the page. */
const COLLAGE = [
  { src: `${NICHE_PHOTO_DIR}/day-park-yoga.jpg`, alt: 'A big group stretching together on a lawn by the ocean' },
  { src: `${NICHE_PHOTO_DIR}/gathering-10.jpg`, alt: 'Friends on the beach lifting one of the group up in celebration' },
  { src: `${NICHE_PHOTO_DIR}/gathering-14.jpg`, alt: 'A small group sitting on the sand around a sound bath' },
] as const

/** When two doors share a photo in the registry, the second one here takes a different real gathering. */
const SPARE = ['/images/site/meditation-circle-outdoor.jpg', '/images/site/song-circle.jpg', '/images/site/community-1.jpg']

const TILE_SIZES = '(max-width: 640px) 128px, (max-width: 1100px) 50vw, 34vw'

export function FrequencyForIndex({ doors }: { doors: FunnelConfig[] }) {
  const used = new Set<string>()
  let spare = 0
  const tiles = doors.map((c) => {
    const design = NICHE_DESIGN[c.slug]
    let src = design ? `${NICHE_PHOTO_DIR}/${design.photo}` : null
    if (src && used.has(src)) src = SPARE[spare++ % SPARE.length]
    if (src) used.add(src)
    return { c, src }
  })
  return (
    <>
      <section className="fn-hero fo-hero" data-energy="charge" data-screen-label="01 Hero">
        <div className="fq-aura" style={vars({ '--fq-aura-opacity': 0.3 })} aria-hidden="true" />
        <span className="rings" aria-hidden="true" />
        <div className="wrap fo-grid">
          <div className="fo-copy">
            <nav className="crumbs" aria-label="Breadcrumb">
              <Link href="/">Home</Link>
              <span aria-hidden="true">/</span>
              <span aria-current="page">For your work</span>
            </nav>
            <h1 className="h-xl">
              Which door <em className="fq-iri-text">fits you?</em>
            </h1>
            <p className="fn-lede">
              Every door opens the same Space. Pick the one that sounds like your work, and see what Frequency does for it in North
              County San Diego.
            </p>
          </div>
          <div className="fo-collage">
            {COLLAGE.map((p, i) => (
              <figure key={p.src} className={i === 0 ? 'fo-ph fq-iri-rim' : 'fo-ph'}>
                {/* eslint-disable-next-line @next/next/no-img-element -- the kit sizes the collage img itself */}
                <img decoding="async" {...photoImg(p.src, i === 0 ? '(max-width: 860px) 70vw, 30vw' : '(max-width: 860px) 40vw, 18vw')} alt={p.alt} />
                <span className="fq-grain" aria-hidden="true" />
              </figure>
            ))}
          </div>
        </div>
      </section>

      <section className="sec pb-sec fo-sec" id="doors" data-screen-label="02 The doors">
        <div className="fq-aura" style={vars({ '--fq-aura-opacity': 0.22 })} aria-hidden="true" />
        <div className="wrap">
          <div className="sh">
            <div className="label">
              <b>{doors.length} doors</b>One home for how you work
            </div>
            <h2 className="h-l">Start where you are.</h2>
          </div>
          <div className="fo-doors">
            {tiles.map(({ c, src }) => (
              <Link key={c.slug} href={`/for/${c.slug}`} className="fo-door">
                {src && (
                  <span className="fo-door-ph">
                    {/* eslint-disable-next-line @next/next/no-img-element -- the kit sizes the tile img itself */}
                    <img loading="lazy" decoding="async" {...photoImg(src, TILE_SIZES)} alt="" />
                    <span className="fq-grain" aria-hidden="true" />
                  </span>
                )}
                <span className="fo-door-tx fq-glass">
                  <span className="fo-door-k">{c.hero.eyebrow}</span>
                  <h3>{c.hero.h1}</h3>
                  <p>{c.hero.subhead}</p>
                  <span className="fo-door-go">See your door →</span>
                </span>
              </Link>
            ))}
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
