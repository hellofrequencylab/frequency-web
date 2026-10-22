import type { Metadata } from 'next'
import Link from 'next/link'
import { LEGAL, LegalPage } from '@/components/legal/legal-page'
import { CONTACT_EMAIL, OG_SITE, ROOT_OG_IMAGES } from '@/lib/site'

// The accessibility statement (site audit 2026-10-22, finding 3): a page of its own, so it can be
// linked, cited and dated. It states an aim, not a guarantee, and names the gaps we know about.
// Update `updated` and the known-limits list together, every time either changes.

const DESCRIPTION = 'How Frequency approaches accessibility: what we aim for, what we know falls short, and how to reach a person.'

export const metadata: Metadata = {
  title: 'Accessibility',
  description: DESCRIPTION,
  alternates: { canonical: '/accessibility' },
  openGraph: { ...OG_SITE, images: ROOT_OG_IMAGES, title: 'Accessibility', description: DESCRIPTION, url: '/accessibility' },
  twitter: { card: 'summary_large_image', title: 'Accessibility', description: DESCRIPTION },
}

export default function AccessibilityPage() {
  return (
    <LegalPage title="Accessibility" updated="October 22, 2026">
      <section>
        <p className={LEGAL.p}>
          Frequency is for everyone who wants to show up, so the site has to work for everyone. We aim to meet
          the Web Content Accessibility Guidelines (WCAG) 2.2 at level AA across the public site and the
          member app. We check our own work and we still miss things, so this page also says where.
        </p>
      </section>

      <section>
        <h2 className={LEGAL.h2}>What we build for</h2>
        <ul className={LEGAL.ul}>
          <li>Every page works from the keyboard, with a visible focus ring and a skip link to the main content.</li>
          <li>Text meets the contrast levels WCAG asks for, in light and dark.</li>
          <li>Pages zoom to 200 percent without losing content, and respect your device text settings.</li>
          <li>Motion calms down when your device asks for reduced motion.</li>
          <li>Forms have labels, and errors say what went wrong in words.</li>
        </ul>
      </section>

      <section>
        <h2 className={LEGAL.h2}>What we know falls short</h2>
        <p className={LEGAL.p}>As of October 22, 2026, this one is open:</p>
        <ul className={LEGAL.ul}>
          <li>Decorative background motion stops only when your device asks for reduced motion. There is no pause button yet.</li>
        </ul>
        <p className={LEGAL.p}>We are working on it.</p>
      </section>

      <section>
        <h2 className={LEGAL.h2}>Tell us when we miss</h2>
        <p className={LEGAL.p}>
          If something blocks you, email{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className={LEGAL.a}>{CONTACT_EMAIL}</a>{' '}
          with the page and what happened. A person reads it and replies. If you need a page or a document in
          another form, such as plain text or a phone call, ask and we will arrange it.
        </p>
        <p className={LEGAL.p}>
          Our <Link href="/help" className={LEGAL.a}>help center</Link> has the same contact route and answers to
          common questions.
        </p>
      </section>
    </LegalPage>
  )
}
