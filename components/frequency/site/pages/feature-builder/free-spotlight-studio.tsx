'use client'

// /free-spotlight, the builder (LIVE-2481). A personal Spotlight in three quick steps: what people call you, one line
// about what you do, and the link you want them to tap. It saves onto the person's own profile (the owner's call,
// 2026-11-19: Free Spotlight is personal; a Space is offered next, never required). The clock is three minutes.
import type { ReactNode } from 'react'
import { FqIcon } from '@/components/frequency/icon'
import type { FeatureDraft } from '@/lib/feature-builder/draft'
import { FeatureStudio, type StudioDone, type StudioStep } from './feature-studio'

/** The page's promise as one sentence (lib/seo/frequency-pages.ts pins it as the headline). The H1 draws it as the
 *  lead plus the builder's own "in 3 minutes." clause. */
export const FREE_SPOTLIGHT_H1 = 'Your own page, live in 3 minutes.'
export const FREE_SPOTLIGHT_SUB = 'One link for your bio, your card and your QR code: your name, what you do and where to find you. Free, and yours to keep.'

const STEPS: readonly StudioStep[] = [
  {
    id: 'name',
    label: 'Name',
    title: <>What do people <em>call you?</em></>,
    sub: 'Your name, or the name you go by.',
    fields: [{ key: 'name', label: 'Your name', placeholder: 'Sam Rivera', autoComplete: 'name' }],
  },
  {
    id: 'line',
    label: 'About',
    title: <>Say what you do in <em>one line.</em></>,
    sub: 'Write it the way you would say it to a friend.',
    fields: [{
      key: 'line',
      label: 'One line about you',
      kind: 'textarea',
      rows: 3,
      placeholder: 'Yoga teacher in Encinitas. Sunrise classes on the beach.',
      examples: ['I teach yoga and run a weekly sunrise class.', 'Ceramic artist. Wheel classes on weekends.', 'Coach for new parents. Free first call.'],
    }],
  },
  {
    id: 'link',
    label: 'Link',
    title: <>Where should people <em>go next?</em></>,
    sub: 'Your booking page, your shop, your Instagram. You can add more links later.',
    fields: [{ key: 'link', label: 'Your main link', hint: '(optional)', kind: 'url', placeholder: 'instagram.com/you', autoComplete: 'url' }],
  },
]

function hostOf(link: string): string {
  try {
    return new URL(link).hostname.replace(/^www\./, '')
  } catch {
    return link.replace(/^https?:\/\//, '').split('/')[0] ?? ''
  }
}

function SpotlightPreview({ draft }: { draft: FeatureDraft }) {
  const name = draft.name?.trim() ?? ''
  const line = draft.line?.trim() ?? ''
  const link = draft.link?.trim() ?? ''
  const initial = (name.match(/\p{L}|\p{N}/u)?.[0] ?? 'Y').toUpperCase()
  return (
    <div className="fb-phone" aria-hidden="true">
      <div className="fb-screen">
        <span className="fb-island" />
        <span className="fb-avatar">{initial}</span>
        <p className={name ? 'fb-pname' : 'fb-pname fb-ghost'}>{name || 'Your name'}</p>
        <p className={line ? 'fb-pline' : 'fb-pline fb-ghost'}>{line || 'One line about what you do.'}</p>
        <div className="fb-links">
          <span className={link ? 'fb-plink fb-plink-p' : 'fb-plink fb-plink-p fb-ghost'}><FqIcon name="link" size={14} />{link ? hostOf(link) : 'Your main link'}</span>
          <span className="fb-plink"><FqIcon name="message" size={14} />Say hello</span>
        </div>
        <span className="fb-paddr">frequencylocal.com/spotlight/you</span>
      </div>
    </div>
  )
}

export function FreeSpotlightStudio({ signedIn, done, error, next, seedName }: { signedIn: boolean; done: StudioDone | null; error: 'save' | 'draft' | null; next: ReactNode; seedName?: string }) {
  return (
    <FeatureStudio
      feature="spotlight"
      steps={STEPS}
      copy={{
        headline: FREE_SPOTLIGHT_H1.replace(/ in 3 minutes\.$/, ''),
        sub: FREE_SPOTLIGHT_SUB,
        publishLabel: 'Publish my Spotlight',
        claimLine: 'Sign in with Google or your email and your Spotlight goes live straight away. Free, no card.',
      }}
      signedIn={signedIn}
      done={done}
      error={error}
      preview={(d) => <SpotlightPreview draft={d} />}
      next={next}
      seed={seedName ? { name: seedName } : undefined}
    />
  )
}
