'use client'

// /launch-your-website, the builder (LIVE-2483). A website in three quick steps: what it is called, the look, and the
// words it leads with. At the finish it goes live at the Space's own free address through the one website publish path
// (publishStarterSite for the look, publishWebsiteWords for the words). A website lives on a Space: a member who owns
// one gets it on their newest Space, anyone else gets a new Space made for it. Five minutes on the clock.
import type { CSSProperties, ReactNode } from 'react'
import { handleFrom, websiteKitFrom, type FeatureDraft } from '@/lib/feature-builder/draft'
import { WIZARD_THEMES } from '@/lib/spaces/create-wizard'
import { PREVIEW_FONT_SHEET, PREVIEW_KIT_ORDER, previewAccentVars, previewDefaultAccent, previewTokens } from '@/lib/theme/preview-tokens'
import { FeatureStudio, type StudioDone, type StudioStep } from './feature-studio'

/** The page's promise as one sentence (lib/seo/frequency-pages.ts pins it as the headline). */
export const LAUNCH_WEBSITE_H1 = 'A real website, live in 5 minutes.'
export const LAUNCH_WEBSITE_SUB = 'Pick a look, write your headline and your website goes live at its own free address. Change any of it later in the editor.'

/** The looks the builder offers: the same kits, labels and one-liners as the Theme Kit pages. */
const LOOKS = WIZARD_THEMES.filter((t) => PREVIEW_KIT_ORDER.includes(t.id))

function steps(existing: string | undefined): readonly StudioStep[] {
  return [
    {
      id: 'name',
      label: 'Name',
      title: <>What is the website <em>for?</em></>,
      sub: existing ? `It goes on ${existing}, your Space. The name here is only used if you have no Space yet.` : 'Your business, practice or group. It becomes your free web address.',
      fields: [{ key: 'name', label: 'Name', placeholder: 'Sunrise Yoga' }],
    },
    {
      id: 'kit',
      label: 'Look',
      title: <>Pick a <em>look.</em></>,
      sub: 'Fonts, colours and layout in one tap. You can switch any time.',
      fields: [{ key: 'kit', label: 'Look', kind: 'choice', options: LOOKS.map((t) => ({ value: t.id, label: t.label, hint: t.hint })) }],
    },
    {
      id: 'words',
      label: 'Words',
      title: <>Say it in <em>one headline.</em></>,
      sub: 'The first thing people read. Then a few words about what you do.',
      fields: [
        { key: 'headline', label: 'Headline', placeholder: 'Sunrise classes on the beach', examples: ['Yoga for busy mornings', 'Pottery classes for beginners', 'Coaching for new parents'] },
        { key: 'about', label: 'About', hint: '(optional)', kind: 'textarea', rows: 3, placeholder: 'Small classes, every level, right on the sand in Encinitas.' },
      ],
    },
  ]
}

function WebsitePreview({ draft }: { draft: FeatureDraft }) {
  const name = draft.name?.trim() ?? ''
  const headline = draft.headline?.trim() ?? ''
  const about = draft.about?.trim() ?? ''
  const kit = websiteKitFrom(draft.kit)
  const accent = previewDefaultAccent(kit)
  const look = { ...previewTokens(kit), ...previewAccentVars(accent.fill, accent.text, accent.dark) } as CSSProperties
  const host = `${name ? handleFrom('', name) : 'your-name'}.frequencylocal.com`
  return (
    <div className="fb-window" aria-hidden="true">
      <link rel="stylesheet" href={PREVIEW_FONT_SHEET} precedence="default" />
      <div className="fb-window-bar"><i /><i /><i /><span className="fb-window-url">{host}</span></div>
      <div className="fb-site" style={look}>
        <div className="fb-site-nav"><b>{name || 'Your name'}</b><span>About</span><span>Events</span><span className="fb-site-btn">Contact</span></div>
        <div className="fb-site-hero">
          <p className={headline ? 'fb-site-h' : 'fb-site-h fb-ghost'}>{headline || 'Your headline goes here'}</p>
          <p className={about ? 'fb-site-p' : 'fb-site-p fb-ghost'}>{about || 'A few words about what you do and who it is for.'}</p>
          <span className="fb-site-btn">Get in touch</span>
        </div>
        <div className="fb-site-cards"><span /><span /><span /></div>
      </div>
    </div>
  )
}

export function LaunchYourWebsiteStudio({ signedIn, done, error, next, spaceName }: { signedIn: boolean; done: StudioDone | null; error: 'save' | 'draft' | null; next: ReactNode; spaceName?: string }) {
  return (
    <FeatureStudio
      feature="website"
      steps={steps(spaceName)}
      copy={{
        headline: LAUNCH_WEBSITE_H1.replace(/ in 5 minutes\.$/, ''),
        sub: LAUNCH_WEBSITE_SUB,
        publishLabel: 'Put my website live',
        claimLine: 'Sign in with Google or your email and your website goes live straight away. Free to start, no card.',
      }}
      signedIn={signedIn}
      done={done}
      error={error}
      preview={(d) => <WebsitePreview draft={d} />}
      next={next}
      seed={{ kit: LOOKS[0]?.id ?? 'new-world', ...(spaceName ? { name: spaceName } : {}) }}
    />
  )
}
