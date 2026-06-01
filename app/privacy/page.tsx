import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'How Frequency collects, uses, and protects your personal information.',
  alternates: { canonical: '/privacy' },
  robots: { index: true, follow: true },
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-surface">
      <div className="max-w-2xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-bold text-text mb-2">
          Privacy Policy
        </h1>
        <p className="text-sm text-subtle mb-10">Last updated: May 27, 2026</p>

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
              <li><strong className="text-text">Google</strong>. OAuth sign-in (if you choose Google login)</li>
              <li><strong className="text-text">Stripe</strong>. Payment processing (when applicable)</li>
              <li><strong className="text-text">Resend</strong>. Transactional email delivery</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text">5. Data security</h2>
            <p className="text-muted leading-relaxed">
              We use industry-standard security measures including encrypted connections (HTTPS),
              secure authentication tokens, and row-level database security policies. Your data is
              stored in Supabase&apos;s infrastructure with encryption at rest.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text">6. Your rights</h2>
            <p className="text-muted leading-relaxed">
              You can update or delete your profile information at any time from your account settings.
              To request a full data export or account deletion, contact us at hello@frequencylocal.com.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text">7. Cookies</h2>
            <p className="text-muted leading-relaxed">
              We use essential cookies to maintain your login session. We do not use third-party
              tracking cookies or advertising cookies.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text">8. Changes to this policy</h2>
            <p className="text-muted leading-relaxed">
              We may update this policy from time to time. We will notify members of material changes
              via email or an in-app announcement.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text">9. Contact</h2>
            <p className="text-muted leading-relaxed">
              Questions about this policy? Email us at{' '}
              <a href="mailto:hello@frequencylocal.com" className="text-primary-strong hover:underline">
                hello@frequencylocal.com
              </a>.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
