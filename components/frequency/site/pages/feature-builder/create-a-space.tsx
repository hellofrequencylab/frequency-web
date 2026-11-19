// /create-a-space, the page body (LIVE-2482): the Create a Space builder, what a Space gives you, the other builders and
// the questions people ask. Kit sections only, tokens only. The route file loads who is signed in and renders this.
import { CreateASpaceStudio } from './create-a-space-studio'
import { BuilderLadder, NextSteps } from './next-steps'
import type { StudioDone } from './feature-studio'
import { Questions, WhatYouGet, type FaqItem, type GetItem } from './sections'

const GETS: readonly GetItem[] = [
  { name: 'A page of its own', body: 'Your name, your line and what is coming up, at one address you can share.', icon: 'space' },
  { name: 'Events and circles', body: 'Post what is on and keep small groups meeting, all in one place.', icon: 'event' },
  { name: 'Your people', body: 'Everyone who joins is on your list, and you can email them when you have news.', icon: 'contacts' },
  { name: 'Room to grow', body: 'Add a website, bookings or a shop when you are ready. Nothing to rebuild.', icon: 'goal' },
]

const FAQ: readonly FaqItem[] = [
  { q: 'What is a Space?', a: 'A home on Frequency for something you run: a practice, a studio, a club or a cause. It has its own page, events, circles and email list.' },
  { q: 'Does it cost anything?', a: 'A free Space comes with Crew. During the beta, everything is free through January 31. Taking payments like tickets or bookings needs the Business plan.' },
  { q: 'What happens when I finish?', a: 'You sign in with Google or your email and your Space is made. Then you can add events, invite people or keep going with a website.' },
  { q: 'Can I come back later?', a: 'Yes. What you type stays in this browser until you finish, so you can close the tab and pick it up again.' },
  { q: 'Do I have to set up the rest?', a: 'No. Your Space works on its own. Add a website, email or a Spotlight only if you want them.' },
]

export function CreateASpacePage({ signedIn, done, error }: { signedIn: boolean; done: StudioDone | null; error: 'save' | 'draft' | null }) {
  return (
    <>
      <CreateASpaceStudio signedIn={signedIn} done={done} error={error} next={<NextSteps done="space" outHref="/" />} />
      <WhatYouGet id="fb-space-gets" title={<>Everything your group needs, in <em className="fq-iri-text">one place.</em></>} items={GETS} />
      <BuilderLadder current="space" />
      <Questions id="fb-space-faq" items={FAQ} />
    </>
  )
}
