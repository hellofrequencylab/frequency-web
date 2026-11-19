// /launch-your-website, the page body (LIVE-2483): the website builder, what the website gives you, the other builders
// and the questions people ask. Kit sections only, tokens only. The route file loads who is signed in and renders this.
import { LaunchYourWebsiteStudio } from './launch-your-website-studio'
import { BuilderLadder, NextSteps } from './next-steps'
import type { StudioDone } from './feature-studio'
import { Questions, WhatYouGet, type FaqItem, type GetItem } from './sections'

const GETS: readonly GetItem[] = [
  { name: 'Your own address', body: 'It goes live at yourname.frequencylocal.com, free. Bring your own domain later if you like.', icon: 'globe' },
  { name: 'A look that fits', body: 'Pick from the same Theme Kits as the rest of Frequency. Switch any time.', icon: 'page' },
  { name: 'Looks good on a phone', body: 'Built for the screen most people will find you on.', icon: 'photo' },
  { name: 'Yours to edit', body: 'Change words, photos and sections in the editor whenever you want.', icon: 'edit' },
]

const FAQ: readonly FaqItem[] = [
  { q: 'Do I need a Space first?', a: 'No. A website lives on a Space, so if you do not have one we make it for you with the name you type. If you already have one, the website goes on your newest Space.' },
  { q: 'What does it cost?', a: 'Your website and its frequencylocal.com address are free. During the beta, everything is free through January 31.' },
  { q: 'What happens when I finish?', a: 'You sign in with Google or your email and your website goes live with your headline and the look you picked.' },
  { q: 'I already have a website on Frequency. Will this replace it?', a: 'No. Your pages stay as they are. The look you pick and your new headline go on top, and you can change both back in the editor.' },
  { q: 'Do I have to set up the rest?', a: 'No. Your website works on its own. Add a Spotlight or email only if you want them.' },
]

export function LaunchYourWebsitePage({ signedIn, done, error, spaceName }: { signedIn: boolean; done: StudioDone | null; error: 'save' | 'draft' | null; spaceName?: string }) {
  return (
    <>
      <LaunchYourWebsiteStudio signedIn={signedIn} done={done} error={error} spaceName={spaceName} next={<NextSteps done="website" outHref="/" />} />
      <WhatYouGet id="fb-site-gets" title={<>A real website, without the <em className="fq-iri-text">headache.</em></>} items={GETS} />
      <BuilderLadder current="website" />
      <Questions id="fb-site-faq" items={FAQ} />
    </>
  )
}
