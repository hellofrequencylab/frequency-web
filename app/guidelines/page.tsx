import type { Metadata } from 'next'
import Link from 'next/link'
import { FocusTemplate } from '@/components/templates'
import { OG_SITE, ROOT_OG_IMAGES } from '@/lib/site'

// The community guidelines (LIVE-723): the plain-language rules a report is judged against, linked
// from the terms, the report dialog and the footers. App Store guideline 1.2 asks an app with member
// content for exactly this: a published rule set, a way to report, a way to block, and a promise
// to act on reports. Not legal advice; the terms are the binding text.

const DESCRIPTION = 'How we treat each other on Frequency: what belongs here, what does not, and what happens when you report something.'

export const metadata: Metadata = {
  title: 'Community guidelines',
  description: DESCRIPTION,
  alternates: { canonical: '/guidelines' },
  openGraph: { ...OG_SITE, images: ROOT_OG_IMAGES, title: 'Community guidelines', description: DESCRIPTION, url: '/guidelines' },
  twitter: { card: 'summary_large_image', title: 'Community guidelines', description: DESCRIPTION },
}

export default function GuidelinesPage() {
  return (
    <div className="min-h-screen bg-surface">
      <div className="px-6 py-16">
        <FocusTemplate title="Community guidelines" description="Last updated: October 6, 2026" width="default">
          <div className="prose prose-sm prose-gray dark:prose-invert max-w-none space-y-8">
            <section>
              <p className="text-muted leading-relaxed">
                Frequency works because people show up for each other, online and in the room. These
                guidelines are how we keep it that way. They sit alongside our{' '}
                <Link href="/terms" className="text-primary-strong hover:underline">terms of service</Link>,
                which are the binding version.
              </p>
            </section>

            <section>
              <h2 className="text-body-lg font-semibold text-text">Be the person you would be in the room</h2>
              <ul className="text-muted space-y-2 list-disc list-inside">
                <li>Disagree with ideas, not with people. Keep it kind.</li>
                <li>Share what is yours to share. Ask before you post someone else&apos;s photo or story.</li>
                <li>Show up for what you RSVP to, or let the host know you can&apos;t.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-body-lg font-semibold text-text">What does not belong here</h2>
              <p className="text-muted leading-relaxed">We have zero tolerance for:</p>
              <ul className="text-muted space-y-2 list-disc list-inside">
                <li>Harassment, threats, bullying, or targeting someone again and again</li>
                <li>Hate or attacks based on who someone is</li>
                <li>Sexual content, and anything that sexualizes a minor</li>
                <li>Violence, or encouraging anyone to hurt themselves or others</li>
                <li>Spam, scams, fake accounts, and pretending to be someone else</li>
                <li>Sharing someone&apos;s private information without their permission</li>
                <li>Anything illegal</li>
              </ul>
            </section>

            <section>
              <h2 className="text-body-lg font-semibold text-text">If something is wrong, tell us</h2>
              <p className="text-muted leading-relaxed">
                Every post, comment, event and profile has a Report option in its menu. Pick the reason
                that fits and add a note if it helps. You can also block a member from their profile:
                they stop being able to message you, and you stop seeing each other.
              </p>
              <p className="text-muted leading-relaxed">
                A person on our team reviews every report within 24 hours. If it breaks these
                guidelines, the content comes down. Depending on how serious it is, the member gets a
                warning, a suspension, or loses their account. Reports are private: we never tell
                anyone who reported them.
              </p>
            </section>

            <section>
              <h2 className="text-body-lg font-semibold text-text">If you are in danger</h2>
              <p className="text-muted leading-relaxed">
                Call your local emergency number first. Then report it here so we can act on our side.
              </p>
            </section>
          </div>
        </FocusTemplate>
      </div>
    </div>
  )
}
