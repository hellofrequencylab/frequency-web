// The /stories BODY on the Frequency design (templates/website/Stories.html). The shell lane owns the
// kit root, header, footer, FX and side state (the page's row in lib/frequency/site-pages.ts).
//
// The reference: hero, the Stories section (a `.sh` head and two `.fg` rows of `.pop > .pc` story
// cards: photo, "Host story" / "Space story", a title, and "Join their Circle →" / "Visit their
// Space →"), then Keep going.
//
// 🔴 NO INVENTED PEOPLE. Nothing in the product stores a member's or a Space's story yet, so the
// reference's four sample stories cannot be published as stories. What renders instead:
//   1. an honest empty state where the stories would go ("No stories here yet");
//   2. the reference's grid, in its own card shape and photos, as the four KINDS of story the page is
//      collecting, each one a prompt that links to the form, never a claim that it happened;
//   3. "Tell us your story", the path in (story-form.tsx), in the Help contact band's dress.
// When a real source exists, its cards replace the prompts in the same `.fg > .pop > .pc` shape.
import Link from 'next/link'
import '@/app/themes/frequency/site-pages-b.css'
import { CONTACT_EMAIL } from '@/lib/site'
import { KeepGoing } from '@/components/frequency/site/shell/keep-going'
import { StoryForm } from './story-form'

function vars(v: Record<string, string | number>): React.CSSProperties {
  return v as React.CSSProperties
}

interface Prompt {
  photo: string
  kind: 'Host story' | 'Space story'
  title: string
  ask: string
  hue: string
}

/** The reference's four cards, as the stories the page is asking for. Titles are the reference's. */
const PROMPTS: Prompt[][] = [
  [
    {
      photo: 'day-beach-hoop.jpg',
      kind: 'Host story',
      title: 'From first-timer to Host',
      ask: 'Came to one Circle and ended up running one? Tell us how that happened.',
      hue: 'var(--fq-x-aqua-neon)',
    },
    {
      photo: 'day-park-yoga.jpg',
      kind: 'Host story',
      title: 'A living room that became a regular night',
      ask: 'Started something at home, in a garden or in a park? Tell us who keeps coming back.',
      hue: 'var(--fq-x-violet-neon)',
    },
  ],
  [
    {
      photo: 'gathering-03.jpg',
      kind: 'Space story',
      title: 'One studio, many communities',
      ask: 'Run a studio where several groups meet? Tell us how they found each other.',
      hue: 'var(--fq-x-sun-neon)',
    },
    {
      photo: 'gathering-06.jpg',
      kind: 'Space story',
      title: 'The café that filled its slow night',
      ask: 'Turned a quiet night into the one people plan around? Tell us what you tried.',
      hue: 'var(--fq-x-magenta-neon)',
    },
  ],
]

export function FrequencyStories() {
  return (
    <>
      <section className="phero big" data-energy="charge" data-screen-label="01 Hero">
        <div className="bg" style={{ backgroundImage: "url('/brand/frequency/photos/day-parachute-play.jpg')" }} />
        <div className="fq-aura" style={vars({ '--fq-aura-opacity': 0.3 })} />
        <div className="shade" />
        <div className="fq-grain" />
        <div className="wrap">
          <nav className="crumbs" aria-label="Breadcrumb">
            <Link href="/">Home</Link>
            <span aria-hidden="true">/</span>
            <span aria-current="page">Stories</span>
          </nav>
          <h1 className="h-xl">
            Hosts and Spaces, <em className="fq-iri-text">in their own words.</em>
          </h1>
          <p>Every story ends in a community you can join.</p>
          <div className="ctas">
            <Link className="btn fq-iri-btn" href="/the-community">
              Find your Circle
            </Link>
            <Link className="btn btn-ghost fq-iri-rim" href="/spaces">
              Open your Space
            </Link>
          </div>
        </div>
      </section>

      <section className="sec" id="stories" data-screen-label="02 Stories">
        <div className="fq-aura" style={vars({ '--fq-aura-opacity': 0.22 })} />
        <div className="wrap">
          <div className="sh">
            <div className="label">
              <b>Stories</b>Hosts and Spaces
            </div>
            <h2 className="h-l">The first stories are being written now.</h2>
          </div>
          <div className="pb-empty">
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

          <div className="label st-k">
            <b>Wanted</b>The stories we are looking for
          </div>
          {PROMPTS.map((row, r) => (
            <div key={r} className="fg" style={r ? { marginTop: 16 } : undefined}>
              {row.map((p) => (
                <a key={p.title} className="pop" href="#tell" style={vars({ '--fq-pc': p.hue })}>
                  <span className="pglow" />
                  <article className="pc">
                    <div className="ph">
                      {/* eslint-disable-next-line @next/next/no-img-element -- the kit sizes .pc .ph img itself (object-fit cover) */}
                      <img loading="lazy" decoding="async" src={`/brand/frequency/photos/${p.photo}`} alt="" />
                    </div>
                    <span className="v">{p.kind}</span>
                    <h3>{p.title}</h3>
                    <p>{p.ask}</p>
                    <p className="st-go">Tell us yours →</p>
                  </article>
                </a>
              ))}
            </div>
          ))}
        </div>
      </section>

      <section className="sec" id="tell" style={{ paddingTop: 0 }} data-screen-label="03 Tell us your story">
        <div className="wrap">
          <div className="band">
            <div>
              <span className="k">Tell us your story</span>
              <h3>Host a Circle or run a Space?</h3>
              <p>
                Tell us how it started, and where readers can find you. A real person reads every story.
              </p>
            </div>
            <StoryForm email={CONTACT_EMAIL} />
          </div>
        </div>
      </section>

      <KeepGoing
        title="Find your community."
        body="Or open a Space for yours."
        primary={{ href: '/the-community', label: 'Find your Circle →' }}
        secondary={{ href: '/spaces', label: 'Open your Space' }}
      />
    </>
  )
}
