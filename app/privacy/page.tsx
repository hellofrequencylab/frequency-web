import type { Metadata } from 'next'
import { FocusTemplate } from '@/components/templates'

export const metadata: Metadata = {
  title: 'Privacy policy',
  description: 'How Frequency collects, uses, and protects your personal information.',
  alternates: { canonical: '/privacy' },
  openGraph: {
    title: 'Privacy policy',
    description: 'How Frequency collects, uses, and protects your personal information.',
    url: '/privacy',
  },
  robots: { index: true, follow: true },
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-surface">
      <div className="px-6 py-16">
        <FocusTemplate
          title="Privacy Policy"
          description="Last updated: June 23, 2026"
          width="default"
        >
          <div className="prose prose-sm prose-gray dark:prose-invert max-w-none space-y-8">
          <section>
            <h2 className="text-lg font-semibold text-text">1. Who we are</h2>
            <p className="text-muted leading-relaxed">
              Frequency is operated by Frequency Labs Holdings (&quot;Frequency,&quot; &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;).
              This policy describes how we collect, use, and protect your personal information when
              you use our platform at frequencylocal.com and related services.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text">2. Information we collect</h2>
            <p className="text-muted leading-relaxed">
              <strong className="text-text">Account information:</strong> When you sign up,
              we collect your email address, display name, and optional profile details (bio, avatar, location).
            </p>
            <p className="text-muted leading-relaxed">
              <strong className="text-text">Authentication data:</strong> If you sign in
              with Google, we receive your name, email, and profile photo from Google. We do not receive or store
              your Google password.
            </p>
            <p className="text-muted leading-relaxed">
              <strong className="text-text">Google contacts (optional):</strong> If you choose to import
              contacts, we read your Google contacts in read-only mode to copy them into your private
              contact list on Frequency. We request one-time access and do not store your Google access or
              refresh tokens.
            </p>
            <p className="text-muted leading-relaxed">
              <strong className="text-text">Content you create:</strong> Posts, comments,
              reactions, event RSVPs, messages, and other content you contribute to the community.
            </p>
            <p className="text-muted leading-relaxed">
              <strong className="text-text">Usage data:</strong> We collect basic analytics
              (pages visited, features used) to improve the platform. We do not sell this data.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text">3. How we use your information</h2>
            <ul className="text-muted space-y-2 list-disc list-inside">
              <li>To create and maintain your account</li>
              <li>To display your profile to other community members</li>
              <li>To deliver posts, messages, and notifications</li>
              <li>To send transactional emails (event reminders, account updates)</li>
              <li>To improve and maintain the platform</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text">4. How we share your information</h2>
            <p className="text-muted leading-relaxed">
              We do not sell your personal information. We share data only with service providers
              that help us operate the platform:
            </p>
            <ul className="text-muted space-y-2 list-disc list-inside">
              <li><strong className="text-text">Supabase</strong>. Database and authentication</li>
              <li><strong className="text-text">Vercel</strong>. Hosting</li>
              <li><strong className="text-text">Google</strong>. OAuth sign-in (if you choose Google login) and Google Analytics for aggregate, anonymized usage measurement</li>
              <li><strong className="text-text">Stripe</strong>. Payment processing (when applicable)</li>
              <li><strong className="text-text">Resend</strong>. Transactional email delivery</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text">5. Google user data</h2>
            <p className="text-muted leading-relaxed">
              When you connect Google to import contacts, Frequency uses the read-only Google Contacts
              scope (contacts.readonly) for one purpose only: to copy the contacts you choose into your
              own private contact list on Frequency, which is visible only to you. We do not access your
              email, calendar, or any other Google data. We use one-time access and store no Google access
              or refresh tokens, and we never sell or share this data or use it for advertising. You can
              delete imported contacts at any time from your account.
            </p>
            <p className="text-muted leading-relaxed">
              Frequency&apos;s use and transfer of information received from Google APIs adheres to the{' '}
              <a
                href="https://developers.google.com/terms/api-services-user-data-policy"
                className="text-primary-strong hover:underline"
              >
                Google API Services User Data Policy
              </a>
              , including the Limited Use requirements.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text">6. Data security</h2>
            <p className="text-muted leading-relaxed">
              We use industry-standard security measures including encrypted connections (HTTPS),
              secure authentication tokens, and row-level database security policies. Your data is
              stored in Supabase&apos;s infrastructure with encryption at rest.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text">7. Your rights</h2>
            <p className="text-muted leading-relaxed">
              You can update or delete your profile information at any time from your account settings.
              To request a full data export or account deletion, contact us at hello@frequencylocal.com.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text">8. Cookies</h2>
            <p className="text-muted leading-relaxed">
              We use essential cookies to maintain your login session, and Google Analytics to
              understand aggregate, anonymized usage so we can improve the platform. We configure
              Google Analytics with IP anonymization and with advertising and ad-personalization
              signals turned off. We do not use advertising cookies, and we never sell your data.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text">9. Changes to this policy</h2>
            <p className="text-muted leading-relaxed">
              We may update this policy from time to time. We will notify members of material changes
              via email or an in-app announcement.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text">10. Contact</h2>
            <p className="text-muted leading-relaxed">
              Questions about this policy? Email us at{' '}
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
