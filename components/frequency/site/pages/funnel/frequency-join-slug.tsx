// The two front doors behind /join/<slug> on the Frequency design (SCAN-852): a Funnel splash and a
// Circle invite. Same data, same links and same join action as the DAWN page; only the frame changes. The
// route wraps both in the site shell with `chrome={false}` (a funnel page has one job, ADR-1090), so these
// are the page between, written in the funnel kit (parts.tsx) and its stylesheet.
import type { ReactNode } from 'react'
import Link from 'next/link'
import { FnPhotoHero, FnStage } from './parts'

/** Turn the *asterisked* span of a statement line into an accent, as the DAWN splash does. */
function accent(text: string): ReactNode[] {
  return text.split(/\*([^*]+)\*/).map((part, i) => (i % 2 === 1 ? <em key={i}>{part}</em> : <span key={i}>{part}</span>))
}

export function FrequencyFunnelSplash({
  splash,
  start,
}: {
  splash: { image: string; eyebrow: string; headline: string; body: string; cta: string; statement: string }
  start: string
}) {
  return (
    <>
      <FnPhotoHero image={splash.image} kicker={splash.eyebrow} title={splash.headline} lede={splash.body}>
        <div className="ctas">
          <Link className="btn fq-iri-btn" href={start}>
            {splash.cta}
          </Link>
        </div>
        <p className="fn-micro">Free to join. No card. It’s live, it’s raw, and you’re early.</p>
      </FnPhotoHero>

      <section className="fn-sec" data-screen-label="02 Statement">
        <div className="wrap">
          <p className="fn-lede">{accent(splash.statement)}</p>
        </div>
      </section>

      <FnStage label="03 Start">
        <div className="fn-box">
          <p>Two minutes to step in. Tell us who you are, claim your handle, and meet your people.</p>
          <div className="ctas">
            <Link className="btn fq-iri-btn" href={start}>
              {splash.cta}
            </Link>
          </div>
        </div>
      </FnStage>
    </>
  )
}

/** A valid invite. `action` is the join control the route picks (already a member, signed in, signed out). */
export function FrequencyCircleInvite({
  circle,
  spotsLeft,
  action,
}: {
  circle: { name: string; about: string | null; type: string; memberCount: number; hubName: string | null }
  spotsLeft: number | null
  action: ReactNode
}) {
  return (
    <FnStage label="01 Invite">
      <div className="fn-box">
        <span className="fn-k">{circle.hubName ? `${circle.type} circle · ${circle.hubName}` : `${circle.type} circle`}</span>
        <h1 className="fn-h1">{circle.name}</h1>
        {circle.about && <p>{circle.about}</p>}
        <p className="fn-micro">
          {circle.memberCount} member{circle.memberCount !== 1 ? 's' : ''}
          {spotsLeft !== null && spotsLeft > 0 ? ` · ${spotsLeft} spot${spotsLeft !== 1 ? 's' : ''} left` : ''}
        </p>
        {action}
        <p className="fn-micro">You were invited to join Frequency. By joining, you agree to our community guidelines.</p>
      </div>
    </FnStage>
  )
}

