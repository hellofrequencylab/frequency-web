'use client'

// The /join FRONT on the Frequency design (templates/website/Join.html): the two-pane Get started
// screen, Looking or Hosting, and a short form.
//
// 🔴 NO NEW AUTH PATH. The reference's forms were front-end only (README: "wire form.jx-f to the
// backend"). They are wired to the induction's OWN actions, in the order the induction itself uses
// them, and then hand the visitor to the existing induction, which still collects the name and
// handle and signs them in through signInWithMagicLink / signInWithGoogle at its last beat:
//   1. stashPendingInduction parks the town (and the interests) at beat 1, so /join resumes the
//      induction past its intro with the town already filled in;
//   2. captureLead opens the lead row with the email (the induction's Beat 0 capture, same source,
//      bounded to two seconds exactly like persistForAuth, because lead bookkeeping must never hold
//      a visitor on a spinner);
//   3. the browser goes to /join with a persona (and, for a host, `next=/spaces/new`, the same safe
//      in-app destination path the induction already honours), which renders the induction.
// The reference's success panels (sample events near you, a Space "on the map") are not rendered:
// they were sample data, and the real next screen is the induction.
//
// Side state is LOCAL. The shell lane owns the page-wide People/Spaces side; this screen renders each
// half conditionally rather than through .p-only/.e-only, so an outer side state can never hide the
// half the visitor picked here.
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import '@/app/themes/frequency/site-pages-b.css'
import { stashPendingInduction } from '@/app/join/(induction)/actions'
import { captureLead } from '@/app/join/(induction)/lead-actions'
import type { PersonaId } from '@/lib/onboarding/personas'
import { PLAN_STORY } from '@/lib/pricing/plan-story'

type Side = 'p' | 'e'

const INTERESTS = ['Moving', 'Making', 'Eating', 'Sitting still', 'Going out'] as const

/** The reference's Space types, each mapped to the induction persona that branches its reel. */
const SPACE_TYPES: { label: string; persona: PersonaId }[] = [
  { label: 'Studio', persona: 'partner' },
  { label: 'Coach or practitioner', persona: 'practitioner' },
  { label: 'Event host', persona: 'builder' },
  { label: 'Café or venue', persona: 'partner' },
  { label: 'Non Profit', persona: 'builder' },
]

/** Where a host lands once the induction completes: Create a Space. */
const HOST_NEXT = '/spaces/new'

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/** captureLead, bounded: a hung limiter or attribution read must never become a stuck form. */
async function captureBounded(input: Parameters<typeof captureLead>[0]) {
  try {
    await Promise.race([captureLead(input), new Promise((resolve) => setTimeout(resolve, 2000))])
  } catch {
    /* the lead row is a follow-up aid, never a precondition for joining */
  }
}

export function FrequencyJoin() {
  const router = useRouter()
  const [side, setSide] = useState<Side>('p')
  const [picked, setPicked] = useState<string[]>([])
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()

  function toggle(interest: string) {
    setPicked((p) => (p.includes(interest) ? p.filter((x) => x !== interest) : [...p, interest]))
  }

  function park(town: string, interests: string) {
    return stashPendingInduction({
      displayName: '',
      handle: '',
      bio: '',
      location: town,
      lat: null,
      lng: null,
      intent: '',
      interests,
      heardAbout: '',
      beat: 1,
    })
  }

  function onLooking(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const town = String(fd.get('town') ?? '').trim()
    const email = String(fd.get('email') ?? '').trim()
    if (!EMAIL_RE.test(email)) return setError('That email doesn’t look right. Check it and try again.')
    setError('')
    startTransition(async () => {
      try {
        await park(town, picked.join(', '))
        await captureBounded({
          email,
          step: 1,
          source: 'beta_induction',
          payload: { town, interests: picked, side: 'looking' },
        })
        router.push('/join?persona=visitor')
      } catch {
        setError('Something went wrong on our side. Try again in a moment.')
      }
    })
  }

  function onHosting(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const name = String(fd.get('name') ?? '').trim()
    const type = SPACE_TYPES.find((t) => t.label === fd.get('type')) ?? SPACE_TYPES[0]!
    const town = String(fd.get('town') ?? '').trim()
    const email = String(fd.get('email') ?? '').trim()
    if (!EMAIL_RE.test(email)) return setError('That email doesn’t look right. Check it and try again.')
    setError('')
    startTransition(async () => {
      try {
        await park(town, '')
        await captureBounded({
          email,
          step: 1,
          source: 'beta_induction',
          payload: { town, spaceName: name, spaceType: type.label, side: 'hosting' },
        })
        router.push(`/join?persona=${type.persona}&next=${encodeURIComponent(HOST_NEXT)}`)
      } catch {
        setError('Something went wrong on our side. Try again in a moment.')
      }
    })
  }

  const looking = side === 'p'

  return (
    <div data-kit="site" data-surface="stage" data-side={side}>
      <main className="jx" data-screen-label="01 Get started">
        <div className="jx-art">
          <Image
            src={looking ? '/brand/frequency/photos/day-meditation-circle.jpg' : '/brand/frequency/photos/gathering-09.jpg'}
            alt={looking ? 'A circle of people sitting together outdoors' : 'A regular group mid-session at a studio'}
            fill
            priority
            sizes="(max-width: 900px) 100vw, 52vw"
          />
          <span className="rings" aria-hidden="true" />
          <div className="jx-q">
            <span className="k">{looking ? 'For people' : 'For spaces'}</span>
            {looking ? (
              <blockquote>
                A hundred contacts. <em>No one to call on a Tuesday.</em>
              </blockquote>
            ) : (
              <blockquote>
                You’ve built a community. <em>Let them find it.</em>
              </blockquote>
            )}
            {!looking && (
              <span className="jx-proof">
                <i className="fq-breathe" />
                <span>Spaces rank by how often they gather, never by who paid.</span>
              </span>
            )}
          </div>
        </div>
        <div className="jx-panel">
          <div className="jx-box">
            <div>
              <h1>Get started</h1>
            </div>
            <p className="sub">
              {looking
                ? 'Free, forever. Tell us where you are and we’ll show you what’s happening.'
                : 'Free until you charge. Your contacts stay yours.'}
            </p>
            <div className="jx-seg" role="group" aria-label="I am" data-on={side}>
              <span className="thumb" />
              <button type="button" aria-pressed={looking} onClick={() => setSide('p')}>
                Looking<small>for an experience</small>
              </button>
              <button type="button" aria-pressed={!looking} onClick={() => setSide('e')}>
                Hosting<small>an experience</small>
              </button>
            </div>

            {looking ? (
              <form className="jx-f" onSubmit={onLooking}>
                <label>
                  Your town
                  <input name="town" required placeholder="San Diego" autoComplete="address-level2" />
                </label>
                <div className="jx-lab" role="group" aria-labelledby="jx-likes">
                  <span id="jx-likes">What do you like doing?</span>
                  <span className="jx-chips">
                    {INTERESTS.map((i) => (
                      <button key={i} type="button" aria-pressed={picked.includes(i)} onClick={() => toggle(i)}>
                        {i}
                      </button>
                    ))}
                  </span>
                </div>
                <label>
                  Email
                  <input name="email" type="email" required placeholder="you@example.com" autoComplete="email" />
                </label>
                {error && <p className="jx-err" role="alert">{error}</p>}
                <button className="btn fq-iri-btn" type="submit" disabled={pending}>
                  {pending ? 'One sec…' : 'Show me what’s happening'}
                </button>
                <p className="jx-fine">One email when something you’d like is near you. No feed, no spam.</p>
              </form>
            ) : (
              <form className="jx-f" onSubmit={onHosting}>
                <label>
                  Space name
                  <input name="name" required placeholder="Saltwater Studio" />
                </label>
                <div className="jx-row">
                  <label>
                    Type
                    <select name="type" defaultValue={SPACE_TYPES[0]!.label}>
                      {SPACE_TYPES.map((t) => (
                        <option key={t.label}>{t.label}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Town
                    <input name="town" required placeholder="San Diego" autoComplete="address-level2" />
                  </label>
                </div>
                <label>
                  Email
                  <input name="email" type="email" required placeholder="you@example.com" autoComplete="email" />
                </label>
                {error && <p className="jx-err" role="alert">{error}</p>}
                <button className="btn fq-iri-btn" type="submit" disabled={pending}>
                  {pending ? 'One sec…' : 'Open my Space'}
                </button>
                <p className="jx-fine">{`Free to host. 0% on your own regulars, ${PLAN_STORY.plusProcessing}.`}</p>
              </form>
            )}

            <div className="jx-alt">
              Already have an account? <Link href="/sign-in">Log in</Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
