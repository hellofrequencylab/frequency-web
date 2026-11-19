// /free-spotlight, the page body (LIVE-2481): the builder hero, what a Spotlight does, the other builders, and the
// questions people ask. Kit sections only (cs-sec from create-space.css, fb- from feature-studio.css), tokens only.
// The route file loads who is signed in and renders this.
import { FreeSpotlightStudio } from './free-spotlight-studio'
import { BuilderLadder, NextSteps } from './next-steps'
import type { StudioDone } from './feature-studio'
import { Questions, WhatYouGet, type FaqItem, type GetItem } from './sections'

const GETS: readonly GetItem[] = [
  { name: 'One link for everything', body: 'Put it in your bio, on your card or behind a QR code. It always has your latest.', icon: 'link' },
  { name: 'Looks good on a phone', body: 'Built for the screen people actually tap from.', icon: 'photo' },
  { name: 'Yours to change', body: 'Edit your name, line and links whenever you like. It updates right away.', icon: 'edit' },
  { name: 'Free', body: 'No card, no trial, no catch. Your Spotlight stays free.', icon: 'gem' },
]

const FAQ: readonly FaqItem[] = [
  { q: 'What is a Spotlight?', a: 'Your own page on Frequency: your name, one line about what you do and the links that matter. Share one address instead of five.' },
  { q: 'Do I need a business?', a: 'No. A Spotlight is for you as a person. If you run something later, you can add a Space and it gets its own Spotlight too.' },
  { q: 'What happens when I finish?', a: 'You sign in with Google or your email, and your Spotlight goes live at frequencylocal.com/spotlight/your-handle.' },
  { q: 'Can I come back later?', a: 'Yes. What you type stays in this browser until you finish, so you can close the tab and pick it up again.' },
  { q: 'Do I have to set up the rest?', a: 'No. Each builder stands on its own. Add a Space, a website or email only if you want them.' },
]

export function FreeSpotlightPage({ signedIn, done, error, seedName }: { signedIn: boolean; done: StudioDone | null; error: 'save' | 'draft' | null; seedName?: string }) {
  return (
    <>
      <FreeSpotlightStudio signedIn={signedIn} done={done} error={error} seedName={seedName} next={<NextSteps done="spotlight" outHref="/" />} />
      <WhatYouGet id="fb-gets" title={<>One page. Everything people need to <em className="fq-iri-text">find you.</em></>} items={GETS} />
      <BuilderLadder current="spotlight" />
      <Questions id="fb-faq" items={FAQ} />
    </>
  )
}
