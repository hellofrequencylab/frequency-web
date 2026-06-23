import type { Metadata } from 'next'
import { FocusTemplate } from '@/components/templates'

export const metadata: Metadata = {
  title: 'Terms of service',
  description: 'The terms for using Frequency: your account, acceptable use, messaging consent, and the legal basics.',
  alternates: { canonical: '/terms' },
  robots: { index: true, follow: true },
}

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-surface">
      <div className="px-6 py-16">
        <FocusTemplate
          title="Terms of Service"
          description="Last updated: June 23, 2026"
          width="default"
        >
          <div className="prose prose-sm prose-gray dark:prose-invert max-w-none space-y-8">
          <section>
            <div className="rounded-lg border border-border bg-surface-elevated p-4">
              <p className="text-muted leading-relaxed">
                <strong className="text-text">Draft pending legal review.</strong> This is a working
                draft, not final legal advice. We are publishing it so we can keep building. The
                wording may change once a lawyer has reviewed it. If anything here matters to you,
                check back or email us before you rely on it.
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text">1. Acceptance of terms</h2>
            <p className="text-muted leading-relaxed">
              Frequency is operated by Frequency Labs Holdings (&quot;Frequency,&quot; &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;).
              These terms cover your use of our platform at frequencylocal.com and related services.
              By creating an account or using Frequency, you agree to these terms. If you do not
              agree, please do not use Frequency.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text">2. Who can use Frequency</h2>
            <p className="text-muted leading-relaxed">
              You need to be at least 18 years old to use Frequency. By using it, you confirm that
              you are 18 or older and that you can agree to these terms. If you are using Frequency
              on behalf of an organization, you confirm you have the authority to do so.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text">3. Your account</h2>
            <p className="text-muted leading-relaxed">
              You are responsible for your account and for keeping your login secure. Use accurate
              information when you sign up, and keep it up to date. Tell us right away if you think
              someone else is using your account. You can close your account at any time from your
              account settings.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text">4. Acceptable use</h2>
            <p className="text-muted leading-relaxed">
              Frequency is about real connection. Treat other members the way you would in a room
              together. Do not:
            </p>
            <ul className="text-muted space-y-2 list-disc list-inside">
              <li>Harass, threaten, or harm other members</li>
              <li>Post content that is illegal, hateful, or violent</li>
              <li>Spam, scam, or impersonate other people</li>
              <li>Break into accounts, scrape the platform, or interfere with how it runs</li>
              <li>Use Frequency for anything illegal</li>
            </ul>
            <p className="text-muted leading-relaxed">
              We may remove content or suspend accounts that break these rules.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text">5. Member content and our content</h2>
            <p className="text-muted leading-relaxed">
              <strong className="text-text">Your content:</strong> You keep ownership of the posts,
              comments, photos, and other content you create. By posting on Frequency, you give us
              permission to host, display, and share that content as part of running the platform
              (for example, showing your post to other members in your Circle). You can delete your
              content at any time.
            </p>
            <p className="text-muted leading-relaxed">
              <strong className="text-text">Our content:</strong> Frequency, including the Quest,
              Journeys, Practices, our name, logo, and the software itself, belongs to us. You can
              use it to take part in the community, but you cannot copy or resell it.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text">6. Paid memberships and billing</h2>
            <p className="text-muted leading-relaxed">
              Some parts of Frequency are part of a paid membership. If you sign up for a paid tier,
              you agree to pay the listed price and any taxes. Payments are handled by our payment
              processor. We will tell you the price and billing terms before you pay. You can cancel
              a recurring membership from your account settings, and the cancellation takes effect at
              the end of the current billing period.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text">7. SMS and messaging consent</h2>
            <p className="text-muted leading-relaxed">
              Frequency can send you text messages, such as event reminders and group messages. We
              only send these if you opt in. Message and data rates may apply, and message frequency
              varies. Reply STOP to any message to stop texts. Reply HELP for help. Opting in to
              texts is never a condition of using Frequency or of any purchase. See our{' '}
              <a href="/privacy" className="text-primary-strong hover:underline">Privacy Policy</a>{' '}
              for how we handle your phone number.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text">8. Disclaimers</h2>
            <p className="text-muted leading-relaxed">
              Frequency is provided as is. We work hard to keep it running and useful, but we do not
              promise it will always be available or error free. Frequency supports connection and
              wellbeing, but it is not medical, mental health, or professional advice. If you need
              that kind of help, please talk to a qualified professional.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text">9. Limitation of liability</h2>
            <p className="text-muted leading-relaxed">
              To the extent the law allows, Frequency is not liable for indirect, incidental, or
              consequential damages that come from using or not being able to use the platform. This
              does not limit any rights you have that cannot be limited by law.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text">10. Changes to these terms</h2>
            <p className="text-muted leading-relaxed">
              We may update these terms from time to time. We will notify members of material changes
              by email or an in-app announcement. If you keep using Frequency after a change takes
              effect, that means you accept the updated terms.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text">11. Governing law</h2>
            <p className="text-muted leading-relaxed">
              These terms are governed by the laws of the State of California, without regard to its
              conflict of laws rules. This section is part of the draft pending legal review.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text">12. How to contact us</h2>
            <p className="text-muted leading-relaxed">
              Questions about these terms? Email us at{' '}
              <a href="mailto:hello@frequencylocal.com" className="text-primary-strong hover:underline">
                hello@frequencylocal.com
              </a>.
            </p>
          </section>
          </div>
        </FocusTemplate>
      </div>
    </div>
  )
}
