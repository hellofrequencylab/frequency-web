'use client'

// /create-a-space, the builder (LIVE-2482). A Space in three quick steps: its name and address, what kind it is, and one
// line about what it is for. It is made through createSpace at the finish, with every guard that path has. Five
// minutes on the clock. The whole-business builder (name, offer, contact, photos, Spotlight, website) is Launch Your
// Business; this one makes just the Space and offers the rest after.
import type { ReactNode } from 'react'
import { FqIcon } from '@/components/frequency/icon'
import { handleFrom, type FeatureDraft } from '@/lib/feature-builder/draft'
import { FeatureStudio, type StudioDone, type StudioStep } from './feature-studio'

/** The page's promise as one sentence (lib/seo/frequency-pages.ts pins it as the headline). */
export const CREATE_SPACE_H1 = 'A home for what you run, live in 5 minutes.'
export const CREATE_SPACE_SUB = 'A Space is where your people find you, join you and keep up: its own page, events, circles and email. Comes with Crew.'

const STEPS: readonly StudioStep[] = [
  {
    id: 'name',
    label: 'Name',
    title: <>What is it <em>called?</em></>,
    sub: 'The name people know it by. You can change it later.',
    fields: [
      { key: 'name', label: 'Space name', placeholder: 'Sunrise Run Club' },
      { key: 'handle', label: 'Address', hint: '(optional, we make one from the name)', placeholder: 'sunrise-run-club' },
    ],
  },
  {
    id: 'type',
    label: 'Kind',
    title: <>What kind of <em>Space?</em></>,
    sub: 'This picks the tools it starts with. You can switch more on any time.',
    fields: [{
      key: 'type',
      label: 'It is',
      kind: 'choice',
      options: [
        { value: 'business', label: 'A business', hint: 'A practice, studio, shop or service.' },
        { value: 'nonprofit', label: 'A nonprofit or group', hint: 'A cause, club, school or community.' },
      ],
    }],
  },
  {
    id: 'tagline',
    label: 'Line',
    title: <>Say what it&apos;s for in <em>one line.</em></>,
    sub: 'It sits under the name on your Space page.',
    fields: [{
      key: 'tagline',
      label: 'One line',
      kind: 'textarea',
      rows: 2,
      placeholder: 'Easy 5K every Saturday at 7. All paces welcome.',
      examples: ['Weekly classes for every level.', 'Small groups that meet every week.', 'Local makers, monthly markets.'],
    }],
  },
]

function SpacePagePreview({ draft }: { draft: FeatureDraft }) {
  const name = draft.name?.trim() ?? ''
  const line = draft.tagline?.trim() ?? ''
  const handle = handleFrom(draft.handle ?? '', name)
  const initial = (name.match(/\p{L}|\p{N}/u)?.[0] ?? 'S').toUpperCase()
  const kind = draft.type === 'nonprofit' ? 'Community' : draft.type === 'business' ? 'Business' : 'Space'
  return (
    <div className="fb-window" aria-hidden="true">
      <div className="fb-window-bar"><i /><i /><i /><span className="fb-window-url">frequencylocal.com/spaces/{name ? handle : 'your-space'}</span></div>
      <div className="fb-space-cover"><span className="fb-space-logo">{initial}</span></div>
      <div className="fb-space-body">
        <span className="fb-space-kind">{kind}</span>
        <p className={name ? 'fb-space-name' : 'fb-space-name fb-ghost'}>{name || 'Your Space'}</p>
        <p className={line ? 'fb-space-line' : 'fb-space-line fb-ghost'}>{line || 'One line about what it is for.'}</p>
        <div className="fb-space-acts"><span className="fb-plink fb-plink-p">Join</span><span className="fb-plink">Share</span></div>
        <div className="fb-space-tabs"><b>About</b><span>Events</span><span>Circles</span><span>People</span></div>
        <div className="fb-space-cards">
          <span><FqIcon name="event" size={14} />Next event</span>
          <span><FqIcon name="circle" size={14} />A circle</span>
        </div>
      </div>
    </div>
  )
}

export function CreateASpaceStudio({ signedIn, done, error, next }: { signedIn: boolean; done: StudioDone | null; error: 'save' | 'draft' | null; next: ReactNode }) {
  return (
    <FeatureStudio
      feature="space"
      steps={STEPS}
      copy={{
        headline: CREATE_SPACE_H1.replace(/ in 5 minutes\.$/, ''),
        sub: CREATE_SPACE_SUB,
        publishLabel: 'Create my Space',
        claimLine: 'Sign in with Google or your email and your Space is made straight away. Free to start, no card.',
      }}
      signedIn={signedIn}
      done={done}
      error={error}
      preview={(d) => <SpacePagePreview draft={d} />}
      next={next}
      seed={{ type: 'business' }}
    />
  )
}
