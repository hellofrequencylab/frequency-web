import type { Metadata } from 'next'
import Link from 'next/link'
import { LEGAL, LegalPage } from '@/components/legal/legal-page'
import { OG_SITE, ROOT_OG_IMAGES } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Terms of service',
  description: 'The terms for using Frequency: your account, acceptable use, messaging consent, and the legal basics.',
  alternates: { canonical: '/terms' },
  openGraph: {
    ...OG_SITE,
    images: ROOT_OG_IMAGES,
    title: 'Terms of service',
    description: 'The terms for using Frequency: your account, acceptable use, messaging consent, and the legal basics.',
    url: '/terms',
  },
  // Metadata merges per TOP-LEVEL KEY: setting only `openGraph` inherits the root `twitter`
  // block verbatim, so the X/Slack card served generic site copy. Mirror this page's own.
  twitter: {
    card: 'summary_large_image',
    title: 'Terms of service',
    description: 'The terms for using Frequency: your account, acceptable use, messaging consent, and the legal basics.',
  },
  // No `robots` here (SCAN-677): the root layout's block already says index + follow AND carries the
  // googleBot preview directives, and a nested `robots` replaces that block wholesale.
}

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated="October 6, 2026">
      <section>
        <div className={LEGAL.note}>
          <p className={LEGAL.p}>
            <strong className={LEGAL.b}>Draft pending legal review.</strong> This is a working
            draft, not final legal advice. We are publishing it so we can keep building. The
            wording may change once a lawyer has reviewed it. If anything here matters to you,
            check back or email us before you rely on it.
          </p>
        </div>
      </section>

      <section>
        <h2 className={LEGAL.h2}>1. Acceptance of terms</h2>
        <p className={LEGAL.p}>
          Frequency is operated by Frequency Labs Holdings (&quot;Frequency,&quot; &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;).
          These terms cover your use of our platform at frequencylocal.com and related services.
          By creating an account or using Frequency, you agree to these terms. If you do not
          agree, please do not use Frequency.
        </p>
      </section>

      <section>
        <h2 className={LEGAL.h2}>2. Who can use Frequency</h2>
        <p className={LEGAL.p}>
          You need to be at least 18 years old to use Frequency. By using it, you confirm that
          you are 18 or older and that you can agree to these terms. If you are using Frequency
          on behalf of an organization, you confirm you have the authority to do so.
        </p>
      </section>

      <section>
        <h2 className={LEGAL.h2}>3. Your account</h2>
        <p className={LEGAL.p}>
          You are responsible for your account and for keeping your login secure. Use accurate
          information when you sign up, and keep it up to date. Tell us right away if you think
          someone else is using your account. You can close your account at any time from your
          account settings.
        </p>
      </section>

      <section>
        <h2 className={LEGAL.h2}>4. Acceptable use</h2>
        <p className={LEGAL.p}>
          Frequency is about real connection. Treat other members the way you would in a room
          together. Do not:
        </p>
        <ul className={LEGAL.ul}>
          <li>Harass, threaten, or harm other members</li>
          <li>Post content that is illegal, hateful, or violent</li>
          <li>Spam, scam, or impersonate other people</li>
          <li>Break into accounts, scrape the platform, or interfere with how it runs</li>
          <li>Use Frequency for anything illegal</li>
        </ul>
        <p className={LEGAL.p}>
          <strong className={LEGAL.b}>Zero tolerance.</strong> There is no tolerance on
          Frequency for objectionable content or abusive members. Anyone can report a post, a
          comment, an event or a member from the menu on it, and anyone can block a member. We
          review every report within 24 hours. Content that breaks these rules comes down, and
          the account that posted it may be suspended or removed. Our{' '}
          <Link href="/guidelines" className={LEGAL.a}>community guidelines</Link>{' '}
          say what that looks like in practice.
        </p>
        <p className={LEGAL.p}>
          If you run a Space that sends email, our{' '}
          <Link href="/space-email-policy" className={LEGAL.a}>Space email policy</Link>{' '}
          also applies. It covers who you can email, what you can send, and the sending limits.
        </p>
      </section>

      <section>
        <h2 className={LEGAL.h2}>5. Member content and our content</h2>
        <p className={LEGAL.p}>
          <strong className={LEGAL.b}>Your content:</strong> You keep ownership of the posts,
          comments, photos, and other content you create. By posting on Frequency, you give us
          permission to host, display, and share that content as part of running the platform
          (for example, showing your post to other members in your Circle). You can delete your
          content at any time.
        </p>
        <p className={LEGAL.p}>
          <strong className={LEGAL.b}>Our content:</strong> Frequency, including the Quest,
          Journeys, Practices, our name, logo, and the software itself, belongs to us. You can
          use it to take part in the community, but you cannot copy or resell it.
        </p>
      </section>

      <section>
        <h2 className={LEGAL.h2}>6. Paid memberships and billing</h2>
        <p className={LEGAL.p}>
          Some parts of Frequency are part of a paid membership. If you sign up for a paid tier,
          you agree to pay the listed price and any taxes. Payments are handled by our payment
          processor. We will tell you the price and billing terms before you pay. You can cancel
          a recurring membership from your account settings, and the cancellation takes effect at
          the end of the current billing period.
        </p>
      </section>

      <section>
        <h2 className={LEGAL.h2}>7. SMS and messaging consent</h2>
        <p className={LEGAL.p}>
          Frequency can send you text messages, such as event reminders and group messages. We
          only send these if you opt in. Message and data rates may apply, and message frequency
          varies. Reply STOP to any message to stop texts. Reply HELP for help. Opting in to
          texts is never a condition of using Frequency or of any purchase. See our{' '}
          <Link href="/privacy" className={LEGAL.a}>Privacy Policy</Link>{' '}
          for how we handle your phone number.
        </p>
      </section>

      <section>
        <h2 className={LEGAL.h2}>8. Disclaimers</h2>
        <p className={LEGAL.p}>
          Frequency is provided as is. We work hard to keep it running and useful, but we do not
          promise it will always be available or error free. Frequency supports connection and
          wellbeing, but it is not medical, mental health, or professional advice. If you need
          that kind of help, please talk to a qualified professional.
        </p>
      </section>

      <section>
        <h2 className={LEGAL.h2}>9. Limitation of liability</h2>
        <p className={LEGAL.p}>
          To the extent the law allows, Frequency is not liable for indirect, incidental, or
          consequential damages that come from using or not being able to use the platform. This
          does not limit any rights you have that cannot be limited by law.
        </p>
      </section>

      <section>
        <h2 className={LEGAL.h2}>10. Changes to these terms</h2>
        <p className={LEGAL.p}>
          We may update these terms from time to time. We will notify members of material changes
          by email or an in-app announcement. If you keep using Frequency after a change takes
          effect, that means you accept the updated terms.
        </p>
      </section>

      <section>
        <h2 className={LEGAL.h2}>11. Governing law</h2>
        <p className={LEGAL.p}>
          These terms are governed by the laws of the State of California, without regard to its
          conflict of laws rules. This section is part of the draft pending legal review.
        </p>
      </section>

      <section>
        <h2 className={LEGAL.h2}>12. How to contact us</h2>
        <p className={LEGAL.p}>
          Questions about these terms? Email us at{' '}
          <a href="mailto:hello@frequencylocal.com" className={LEGAL.a}>
            hello@frequencylocal.com
          </a>.
        </p>
      </section>
    </LegalPage>
  )
}
