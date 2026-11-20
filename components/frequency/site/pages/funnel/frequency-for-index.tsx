// /for on the Frequency design: the index of the operator doors (six core niches and seven profiles). Standard site header, footer and
// kit sections (sec, sh, KeepGoing); every colour is a kit token. The cards read the same
// registry and photo table as the doors themselves, so a door's headline and picture never drift here.
//
// Layout (site-funnel.css, fo-): an audience chooser. The hero sets the question beside a collage of three
// gatherings. Below it, a row of jump links names every door, then each door gets its own zig-zag row: a
// photo picked for that kind of work, and the door's own words on a glass panel that overlaps it, sides
// swapping row by row (owner ask, 2026-11-20: the old three-up tile grid read crowded and template-like).
// On a phone the photo sits on top and the panel tucks under it.
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

/**
 * One photo per door, picked to show that kind of work (the door pages' own photos repeat the same beach
 * gathering, so the index chooses its own). None repeats the hero collage. A door added to the registry
 * without a row here falls back to its NICHE_DESIGN photo.
 */
const DOOR_PHOTO: Record<string, { src: string; alt: string }> = {
  'coaches-and-healers': { src: '/images/site/sound-healing.jpg', alt: 'A sound healer smiling behind a ring of crystal bowls on the sand' },
  studios: { src: `${NICHE_PHOTO_DIR}/gathering-04.jpg`, alt: 'An instructor leading a class seated on mats on a lawn' },
  'event-hosts': { src: `${NICHE_PHOTO_DIR}/night-string-lights-web.jpg`, alt: 'A crowd under string lights at a night event' },
  venues: { src: '/images/site/lab-concept.jpg', alt: 'An open event hall with a lit stage and a wide wooden floor' },
  nonprofits: { src: '/images/site/community-dinner.jpg', alt: 'A long community dinner under string lights and patio heaters' },
  networks: { src: `${NICHE_PHOTO_DIR}/boc-group-blue-sky.jpg`, alt: 'A big group standing together by the ocean' },
  'local-businesses': { src: '/images/site/lab-storefront.jpg', alt: 'A corner shop with tall windows and warm lights inside' },
  'clubs-and-groups': { src: '/images/site/hula-hoop-party.jpg', alt: 'Friends hula hooping together on a grassy hill' },
  'spiritual-community': { src: '/images/site/meditation-circle.jpg', alt: 'A circle of people meditating together on a rooftop' },
}

const DOOR_SIZES = '(max-width: 860px) 100vw, 58vw'

export function FrequencyForIndex({ doors }: { doors: FunnelConfig[] }) {
  const rows = doors.map((c) => {
    const design = NICHE_DESIGN[c.slug]
    const picked = DOOR_PHOTO[c.slug]
    const photo = picked ?? (design ? { src: `${NICHE_PHOTO_DIR}/${design.photo}`, alt: '' } : null)
    return { c, photo, short: design?.short ?? c.hero.eyebrow }
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
          <nav className="fo-jump" aria-label="Jump to your door">
            {rows.map(({ c, short }) => (
              <a key={c.slug} href={`#${c.slug}`}>
                {short}
              </a>
            ))}
          </nav>
          <div className="fo-doors">
            {rows.map(({ c, photo }, i) => (
              <article key={c.slug} id={c.slug} className="fo-door">
                {photo && (
                  <div className="fo-door-ph fq-iri-rim">
                    {/* eslint-disable-next-line @next/next/no-img-element -- the kit sizes the row img itself */}
                    <img loading="lazy" decoding="async" {...photoImg(photo.src, DOOR_SIZES)} alt={photo.alt} />
                    <span className="fq-grain" aria-hidden="true" />
                  </div>
                )}
                <div className="fo-door-tx fq-glass">
                  <span className="fo-door-k">
                    {String(i + 1).padStart(2, '0')} · {c.hero.eyebrow}
                  </span>
                  <h3>{c.hero.h1}</h3>
                  <p>{c.hero.subhead}</p>
                  <Link className="btn fq-iri-btn fo-door-go" href={`/for/${c.slug}`} aria-label={`See your door: ${c.hero.eyebrow}`}>
                    See your door →
                  </Link>
                </div>
              </article>
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
