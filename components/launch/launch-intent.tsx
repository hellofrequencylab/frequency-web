import Link from 'next/link'
import { PERSONAL_SPOTLIGHT_HREF } from '@/lib/launch/intent'

// THE FIRST QUESTION (LIVE-1917). What did you come to set up? A Space for what they run opens the whole launch (the
// Spotlight, Space, website and email on one page). Just a personal Spotlight goes to their own profile, where it is
// built; the note says a Space is the step up and that what they have already told us fills it. Server Component.

export function LaunchIntent({ spaceHref }: { spaceHref: string }) {
  return (
    <section className="grid gap-4" aria-labelledby="launch-intent-title">
      <div>
        <p className="eyebrow">Let&rsquo;s start</p>
        <h2 id="launch-intent-title" className="h2" style={{ marginTop: 8 }}>
          What are you setting up?
        </h2>
        <p className="t2" style={{ marginTop: 6 }}>Pick the closest. You can add the rest any time.</p>
      </div>
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
        <Link href={spaceHref} className="card" style={{ padding: '18px 20px', display: 'grid', gap: 6 }}>
          <b>A Space for what I run</b>
          <span className="t2">Your Spotlight, Space, website and email, set up together.</span>
          <span className="btn pa sm" style={{ justifySelf: 'start' }}>Start my Space</span>
        </Link>
        <Link href={PERSONAL_SPOTLIGHT_HREF} className="card" style={{ padding: '18px 20px', display: 'grid', gap: 6 }}>
          <b>Just my personal Spotlight</b>
          <span className="t2">Your own page: links, events and what you are up to. A Space is the step up whenever you want it, and your name, bio and link come along.</span>
          <span className="btn txt sm" style={{ justifySelf: 'start' }}>Open my Spotlight</span>
        </Link>
      </div>
    </section>
  )
}
