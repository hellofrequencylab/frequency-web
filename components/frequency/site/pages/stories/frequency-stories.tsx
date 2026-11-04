// The /stories BODY on the Frequency design (templates/website/Stories.html). The shell lane owns the
// kit root, header, footer, FX and side state (the page's row in lib/frequency/site-pages.ts).
//
// The reference: hero, the Stories section (a `.sh` head and two `.fg` rows of `.pop > .pc` story
// cards: photo, "Host story" / "Space story", a title, and "Join their Circle →" / "Visit their
// Space →"), then Keep going.
//
// 🔴 NO INVENTED PEOPLE. Nothing in the product stores a member's or a Space's story yet, so the
// reference's four sample stories cannot be published as stories. What renders instead:
//   1. an honest empty state where the stories would go ("No stories here yet"), set as the page's own
//      promise in a photo-masked pull quote, never as a quote from a person;
//   2. the reference's cards, as the four KINDS of story the page is collecting, each one a prompt that
//      links to the form, never a claim that it happened;
//   3. "Tell us your story", the path in (story-form.tsx), on glass over a photo.
// When a real source exists, its cards replace the prompts in the same `.pop > .pc` shape.
//
// EDITORIAL (owner 2026-11-04, "make each a different layout"): a magazine masthead with an arch-cut
// photo, the pull quote, a lead story card with three staggered beside it, and the form over a night
// photo. Layout styles: .pa-stories in site-pages-showcase.css.
import Link from 'next/link'
import '@/app/themes/active/site-pages-b'
import '@/app/themes/active/site-pages-showcase'
import { CONTACT_EMAIL } from '@/lib/site'
import { KeepGoing } from '@/components/frequency/site/shell/keep-going'
import { StoryForm } from './story-form'
import { aura, photo, photoImg } from '../shared/parts'

function vars(v: Record<string, string | number>): React.CSSProperties {
  return v as React.CSSProperties
}

interface Prompt {
  photo: string
  alt: string
  kind: 'Host story' | 'Space story'
  title: string
  ask: string
  hue: string
}

/** The reference's four cards, as the stories the page is asking for. Titles are the reference's. */
const PROMPTS: Prompt[] = [
  {
    photo: 'day-beach-hoop.jpg',
    alt: 'Someone hula hooping on the beach',
    kind: 'Host story',
    title: 'From first-timer to Host',
    ask: 'Came to one Circle and ended up running one? Tell us how that happened.',
    hue: 'var(--fq-x-aqua-neon)',
  },
  {
    photo: 'day-park-yoga.jpg',
    alt: 'A group stretching together on a lawn by the sea',
    kind: 'Host story',
    title: 'A living room that became a regular night',
    ask: 'Started something at home, in a garden or in a park? Tell us who keeps coming back.',
    hue: 'var(--fq-x-sky-neon)',
  },
  {
    photo: 'gathering-03.jpg',
    alt: 'Friends on blankets and rugs at an evening picnic',
    kind: 'Space story',
    title: 'One studio, many communities',
    ask: 'Run a studio where several groups meet? Tell us how they found each other.',
    hue: 'var(--fq-x-magenta-neon)',
  },
  {
    photo: 'gathering-06.jpg',
    alt: 'A group dancing together on a lawn between houses',
    kind: 'Space story',
    title: 'A gathering at your local café',
    ask: 'Hosted a gathering at a café? Tell us what you tried and what you noticed.',
    hue: 'var(--fq-x-magenta-neon)',
  },
]

export function FrequencyStories() {
  return (
    <div className="pa-page pa-stories" style={{ display: 'contents' }}>
      <section className="phero big" data-energy="charge" data-screen-label="01 Hero">
        <div className="fq-aura" style={aura(0.26)} />
        <div className="fq-grain" />
        <div className="wrap st-mast">
          <div>
            <nav className="crumbs" aria-label="Breadcrumb">
              <Link href="/">Home</Link>
              <span aria-hidden="true">/</span>
              <span aria-current="page">Stories</span>
            </nav>
            <h1 className="h-xl">
              Hosts and Spaces, <em className="fq-iri-text">in their own words.</em>
            </h1>
            <p>Host a Circle or run a community Space? Tell us what happened. We have no published stories here yet.</p>
            <div className="ctas">
              <Link className="btn fq-iri-btn" href="/the-community">
                Find your Circle
              </Link>
              <Link className="btn btn-ghost fq-iri-rim" href="/spaces">
                Open your Space
              </Link>
            </div>
          </div>
          <figure className="st-arch fq-iri-rim">
            {/* eslint-disable-next-line @next/next/no-img-element -- the arch sizes its own img (object-fit cover) */}
            <img decoding="async" {...photoImg(photo('gathering-13.jpg'), '(max-width: 860px) 70vw, 34vw')} alt="Two friends dancing on the beach at sunset" />
            <span className="fq-grain" />
          </figure>
        </div>
      </section>

      <section className="sec" id="stories" data-screen-label="02 Stories">
        <div className="fq-aura" style={vars({ '--fq-aura-opacity': 0.22 })} />
        <div className="wrap">
          <div className="sh">
            <div className="label">
              <b>Stories</b>Hosts and Spaces
            </div>
            <h2 className="h-l">Help us tell the stories of community gatherings.</h2>
          </div>
          <div className="pb-empty st-pull">
            <figure className="st-pull-ph">
              {/* eslint-disable-next-line @next/next/no-img-element -- the circle sizes its own img */}
              <img loading="lazy" decoding="async" {...photoImg('/images/site/kirtan-song-circle.jpg', '(max-width: 860px) 60vw, 26vw')} alt="Hands raised in a song circle on a rooftop" />
              <span className="fq-grain" />
            </figure>
            <div className="st-pull-tx">
              <h3>No stories here yet.</h3>
              <p>
                We only publish stories from real Hosts and Spaces, told in their own words, with photos from their
                rooms. Each one will end with a way in: their Circle to join, or their Space to visit.
              </p>
              <div className="ctas">
                <a className="btn fq-iri-btn" href="#tell">
                  Tell us your story
                </a>
              </div>
            </div>
          </div>

          <div className="label st-k">
            <b>Wanted</b>The stories we are looking for
          </div>
          <div className="st-ed">
            {PROMPTS.map((p, i) => (
              <a key={p.title} className={i === 0 ? 'pop st-lead' : 'pop'} href="#tell" style={vars({ '--fq-pc': p.hue })}>
                <span className="pglow" />
                <article className="pc">
                  <div className="ph">
                    {/* eslint-disable-next-line @next/next/no-img-element -- the kit sizes .pc .ph img itself (object-fit cover) */}
                    <img loading="lazy" decoding="async" {...photoImg(photo(p.photo), i === 0 ? '(max-width: 860px) 100vw, 50vw' : '(max-width: 860px) 100vw, 25vw')} alt={p.alt} />
                    <span className="fq-grain" />
                  </div>
                  <div className="st-tx">
                    <span className="v">{p.kind}</span>
                    <h3>{p.title}</h3>
                    <p>{p.ask}</p>
                    <p className="st-go">Tell us yours →</p>
                  </div>
                </article>
              </a>
            ))}
          </div>
        </div>
      </section>

      <section className="sec sec-next st-tell" id="tell" data-screen-label="03 Tell us your story">
        {/* eslint-disable-next-line @next/next/no-img-element -- the band sizes its own img (object-fit cover) */}
        <img className="st-tell-bg" loading="lazy" decoding="async" {...photoImg('/images/site/mens-group.jpg', '100vw')} alt="" />
        <div className="st-tell-scrim" />
        <div className="fq-grain" />
        <div className="wrap">
          <div className="band fq-panel">
            <div>
              <span className="k">Tell us your story</span>
              <h3>Host a Circle or run a Space?</h3>
              <p>
                Tell us how it started, where readers can find you, and how we can get in touch.
              </p>
            </div>
            <StoryForm email={CONTACT_EMAIL} />
          </div>
        </div>
      </section>

      <KeepGoing
        title="Find a community gathering."
        body="Browse local Circles, or learn about opening a Space."
        primary={{ href: '/the-community', label: 'Find your Circle →' }}
        secondary={{ href: '/spaces', label: 'Open your Space' }}
      />
    </div>
  )
}
