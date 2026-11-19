'use client'

// /email-marketing, the builder (LIVE-2483). A first email in three quick steps: who it is from, the subject line and
// what it says. At the finish it is set aside as a DRAFT in the Space's Marketing tab (createSpaceEmailDraft and
// saveSpaceEmailDraft), never sent from here: the owner checks it and sends it to their list themselves. Email lives on
// a Space, so a member who owns one gets it on their newest Space and anyone else gets a Space made for it. Four
// minutes on the clock.
import type { ReactNode } from 'react'
import { FqIcon } from '@/components/frequency/icon'
import type { FeatureDraft } from '@/lib/feature-builder/draft'
import { FeatureStudio, type StudioDone, type StudioStep } from './feature-studio'

/** The page's promise as one sentence (lib/seo/frequency-pages.ts pins it as the headline). */
export const EMAIL_MARKETING_H1 = 'Your first email, written in 4 minutes.'
export const EMAIL_MARKETING_SUB = 'Write it here and it waits as a draft with your list. Nothing sends until you press Send. Free Spaces get 2 emails a month.'

function steps(existing: string | undefined): readonly StudioStep[] {
  return [
    {
      id: 'from',
      label: 'From',
      title: <>Who is it <em>from?</em></>,
      sub: existing ? `It goes out from ${existing}, your Space. This is the name people see in their inbox.` : 'The name people see in their inbox: you, or what you run.',
      fields: [{ key: 'from', label: 'From name', placeholder: 'Sunrise Yoga' }],
    },
    {
      id: 'subject',
      label: 'Subject',
      title: <>Give them a reason to <em>open it.</em></>,
      sub: 'Short and plain beats clever. Say what is inside.',
      fields: [{ key: 'subject', label: 'Subject line', placeholder: 'New Saturday class starts this week', examples: ['Something new this month', 'You are invited', 'A quick hello and what is next'] }],
    },
    {
      id: 'body',
      label: 'Message',
      title: <>Now say it like you <em>talk.</em></>,
      sub: 'A few lines is plenty. You can add pictures and buttons in the editor later.',
      fields: [{ key: 'body', label: 'Your message', kind: 'textarea', rows: 6, placeholder: 'Hi friends, we are starting a new Saturday class at 8am. Bring a mat and a friend. Reply to save a spot.' }],
    },
  ]
}

function EmailPreview({ draft }: { draft: FeatureDraft }) {
  const from = draft.from?.trim() ?? ''
  const subject = draft.subject?.trim() ?? ''
  const body = draft.body?.trim() ?? ''
  const initial = (from.match(/\p{L}|\p{N}/u)?.[0] ?? 'Y').toUpperCase()
  return (
    <div className="fb-window fb-mail" aria-hidden="true">
      <div className="fb-window-bar"><i /><i /><i /><span className="fb-window-url"><FqIcon name="send" size={12} />Inbox</span></div>
      <div className="fb-mail-head">
        <span className="fb-avatar fb-mail-avatar">{initial}</span>
        <div>
          <p className={from ? 'fb-mail-from' : 'fb-mail-from fb-ghost'}>{from || 'Your name'}</p>
          <p className={subject ? 'fb-mail-subject' : 'fb-mail-subject fb-ghost'}>{subject || 'Your subject line'}</p>
        </div>
      </div>
      <div className="fb-mail-body">
        <p className={subject ? 'fb-mail-h' : 'fb-mail-h fb-ghost'}>{subject || 'Your subject line'}</p>
        <p className={body ? 'fb-mail-p' : 'fb-mail-p fb-ghost'}>{body || 'What you want to tell them, the way you would say it.'}</p>
        <span className="fb-mail-foot">Sent with Frequency · Unsubscribe</span>
      </div>
    </div>
  )
}

export function EmailMarketingStudio({ signedIn, done, error, next, spaceName }: { signedIn: boolean; done: StudioDone | null; error: 'save' | 'draft' | null; next: ReactNode; spaceName?: string }) {
  return (
    <FeatureStudio
      feature="email"
      steps={steps(spaceName)}
      copy={{
        headline: EMAIL_MARKETING_H1.replace(/ in 4 minutes\.$/, ''),
        sub: EMAIL_MARKETING_SUB,
        publishLabel: 'Save my first email',
        claimLine: 'Sign in with Google or your email and your draft waits in Marketing. Nothing sends until you say so.',
      }}
      signedIn={signedIn}
      done={done}
      error={error}
      preview={(d) => <EmailPreview draft={d} />}
      next={next}
      seed={spaceName ? { from: spaceName } : undefined}
    />
  )
}
