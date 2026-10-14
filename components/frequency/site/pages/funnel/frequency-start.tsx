// The /start BODY on the Frequency design: the role picker (Build, Practice, Spread) and the "not ready to
// pick a door" answers, in the kit's card grammar. Picked by app/(marketing)/start/page.tsx when SITE_DESIGN
// is 'frequency'. Static, like the DAWN page: the doors, their hrefs and the four guide links are passed in
// from the route, so the two designs can never point a reader at different places.
import Link from 'next/link'
import { KeepGoing } from '@/components/frequency/site/shell/keep-going'
import { FqIcon, type FqIconName } from '@/components/frequency/icon'
import { FnHead, FnHero } from './parts'

export interface StartDoor {
  label: string
  blurb: string
  cta: string
  href: string
}

export interface StartGuide {
  href: string
  label: string
  note: string
}

/** One icon per door, in the order the route lists them (Build, Practice, Spread). */
const DOOR_ICONS: FqIconName[] = ['host', 'breath', 'invite']
const DOOR_HUES = ['var(--fq-x-aqua-neon)', 'var(--fq-x-violet-neon)', 'var(--fq-x-magenta-neon)']

export function FrequencyStart({ doors, guides }: { doors: StartDoor[]; guides: StartGuide[] }) {
  return (
    <>
      <FnHero
        kicker="Pick your way in"
        title={
          <>
            Where do you want to <em className="fq-iri-text">start?</em>
          </>
        }
        lede="The third place is gone, and ordinary people are rebuilding it where they live. There are three ways to be one of them. Pick the one that fits you."
      />

      <section className="fn-sec" data-screen-label="02 Doors">
        <div className="wrap">
          <div className="g3 fn-doors">
            {doors.map((d, i) => (
              <article
                key={d.label}
                className="pc"
                style={{ '--fq-pc': DOOR_HUES[i % DOOR_HUES.length] } as React.CSSProperties}
              >
                <span className="ic">
                  <FqIcon name={DOOR_ICONS[i % DOOR_ICONS.length]!} />
                </span>
                <h2>{d.label}</h2>
                <p>{d.blurb}</p>
                <Link className="btn fq-iri-btn" href={d.href}>
                  {d.cta} →
                </Link>
              </article>
            ))}
          </div>
          <p className="pb-note">
            Not sure yet? Any door works. You can change your mind, and most people end up doing a little of all
            three.
          </p>
          {/* ADR-1715: the Builders' door, a plain line rather than a fourth card. */}
          <p className="pb-note">
            Run a studio or a practice? <Link href="/for/teachers">See how a Space works</Link>
          </p>
        </div>
      </section>

      {/* THE ORPHAN FIX (LIVE-256): the pillar pages this site links from nowhere else. */}
      <section className="fn-sec" data-screen-label="03 Not ready">
        <div className="wrap">
          <FnHead
            label="Not ready to pick a door?"
            title="Start with whichever one sounds like your week."
            note="Each is a plain answer, no signup."
          />
          <div className="qa fn-links">
            {guides.map((g) => (
              <Link key={g.href} className="hp-a" href={g.href}>
                <span>
                  <b>{g.label}</b>
                  <small>{g.note}</small>
                </span>
                <span className="ar" aria-hidden="true">
                  →
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <KeepGoing
        title="Find your first Circle."
        body="The nearest one might meet this week."
        primary={{ href: '/the-community', label: 'Find your Circle →' }}
        secondary={{ href: '/spaces', label: 'Open your Space' }}
      />
    </>
  )
}
