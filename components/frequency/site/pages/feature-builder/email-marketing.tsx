// /email-marketing, the page body (LIVE-2483): the first-email builder, what email gives you, the other builders and the
// questions people ask. Kit sections only, tokens only. The route file loads who is signed in and renders this.
import { EmailMarketingStudio } from './email-marketing-studio'
import { BuilderLadder, NextSteps } from './next-steps'
import type { StudioDone } from './feature-studio'
import { Questions, WhatYouGet, type FaqItem, type GetItem } from './sections'

const GETS: readonly GetItem[] = [
  { name: 'Your list, built in', body: 'Everyone who joins your Space or comes to your events is on it, ready to hear from you.', icon: 'contacts' },
  { name: 'Nothing sends by surprise', body: 'Your email waits as a draft. You check it and press Send when you are ready.', icon: 'send' },
  { name: 'Looks good everywhere', body: 'Clean on a phone and on a laptop, in your Space’s own colours.', icon: 'photo' },
  { name: 'Easy to dress up', body: 'Add photos and buttons in the email editor whenever you want.', icon: 'edit' },
]

const FAQ: readonly FaqItem[] = [
  { q: 'Who does it go to?', a: 'The people on your Space’s list: members, people who came to your events and anyone you add. If you do not have a Space yet, we make one with the name you type.' },
  { q: 'Does it send right away?', a: 'No. It waits as a draft in your Space’s Marketing tab. You check it, add anything else and send it yourself.' },
  { q: 'What does it cost?', a: 'A free Space can send 2 emails a month. Business sends more. During the beta, everything is free through January 31.' },
  { q: 'Can I come back later?', a: 'Yes. What you type stays in this browser until you finish, so you can close the tab and pick it up again.' },
  { q: 'Do I have to set up the rest?', a: 'No. Email works on its own. Add a website or a Spotlight only if you want them.' },
]

export function EmailMarketingPage({ signedIn, done, error, spaceName }: { signedIn: boolean; done: StudioDone | null; error: 'save' | 'draft' | null; spaceName?: string }) {
  return (
    <>
      <EmailMarketingStudio signedIn={signedIn} done={done} error={error} spaceName={spaceName} next={<NextSteps done="email" outHref="/" />} />
      <WhatYouGet id="fb-mail-gets" title={<>Stay in touch without the <em className="fq-iri-text">busywork.</em></>} items={GETS} />
      <BuilderLadder current="email" />
      <Questions id="fb-mail-faq" items={FAQ} />
    </>
  )
}
