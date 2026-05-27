import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy Policy — Frequency',
  description: 'How Frequency collects, uses, and protects your personal information.',
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      <div className="max-w-2xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-50 mb-2">
          Privacy Policy
        </h1>
        <p className="text-sm text-gray-400 mb-10">Last updated: May 27, 2026</p>

        <div className="prose prose-sm prose-gray dark:prose-invert max-w-none space-y-8">
          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-50">1. Who we are</h2>
            <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
              Frequency is operated by Frequency Labs Holdings ("Frequency," "we," "us," or "our").
              This policy describes how we collect, use, and protect your personal information when
              you use our platform at go.findafreq.com and related services.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-50">2. Information we collect</h2>
            <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
              <strong className="text-gray-700 dark:text-gray-300">Account information:</strong> When you sign up,
              we collect your email address, display name, and optional profile details (bio, avatar, location).
            </p>
            <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
              <strong className="text-gray-700 dark:text-gray-300">Authentication data:</strong> If you sign in
              with Google, we receive your name, email, and profile photo from Google. We do not receive or store
              your Google password.
            </p>
            <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
              <strong className="text-gray-700 dark:text-gray-300">Content you create:</strong> Posts, comments,
              reactions, event RSVPs, messages, and other content you contribute to the community.
            </p>
            <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
              <strong className="text-gray-700 dark:text-gray-300">Usage data:</strong> We collect basic analytics
              (pages visited, features used) to improve the platform. We do not sell this data.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-50">3. How we use your information</h2>
            <ul className="text-gray-600 dark:text-gray-400 space-y-2 list-disc list-inside">
              <li>To create and maintain your account</li>
              <li>To display your profile to other community members</li>
              <li>To deliver posts, messages, and notifications</li>
              <li>To send transactional emails (event reminders, account updates)</li>
              <li>To improve and maintain the platform</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-50">4. How we share your information</h2>
            <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
              We do not sell your personal information. We share data only with service providers
              that help us operate the platform:
            </p>
            <ul className="text-gray-600 dark:text-gray-400 space-y-2 list-disc list-inside">
              <li><strong className="text-gray-700 dark:text-gray-300">Supabase</strong> — database and authentication</li>
              <li><strong className="text-gray-700 dark:text-gray-300">Vercel</strong> — hosting</li>
              <li><strong className="text-gray-700 dark:text-gray-300">Google</strong> — OAuth sign-in (if you choose Google login)</li>
              <li><strong className="text-gray-700 dark:text-gray-300">Stripe</strong> — payment processing (when applicable)</li>
              <li><strong className="text-gray-700 dark:text-gray-300">Resend</strong> — transactional email delivery</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-50">5. Data security</h2>
            <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
              We use industry-standard security measures including encrypted connections (HTTPS),
              secure authentication tokens, and row-level database security policies. Your data is
              stored in Supabase's infrastructure with encryption at rest.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-50">6. Your rights</h2>
            <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
              You can update or delete your profile information at any time from your account settings.
              To request a full data export or account deletion, contact us at hello@findafreq.com.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-50">7. Cookies</h2>
            <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
              We use essential cookies to maintain your login session. We do not use third-party
              tracking cookies or advertising cookies.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-50">8. Changes to this policy</h2>
            <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
              We may update this policy from time to time. We will notify members of material changes
              via email or an in-app announcement.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-50">9. Contact</h2>
            <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
              Questions about this policy? Email us at{' '}
              <a href="mailto:hello@findafreq.com" className="text-indigo-600 dark:text-indigo-400 hover:underline">
                hello@findafreq.com
              </a>.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
