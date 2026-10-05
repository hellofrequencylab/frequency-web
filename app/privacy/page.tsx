import type { Metadata } from 'next'
import Link from 'next/link'
import { FocusTemplate } from '@/components/templates'
import { CookieChoicesButton } from '@/components/consent/cookie-choices-button'
import { OG_SITE } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Privacy policy',
  description: 'How Frequency collects, uses, and protects your personal information.',
  alternates: { canonical: '/privacy' },
  openGraph: {
    ...OG_SITE,
    title: 'Privacy policy',
    description: 'How Frequency collects, uses, and protects your personal information.',
    url: '/privacy',
  },
  // Metadata merges per TOP-LEVEL KEY: setting only `openGraph` inherits the root `twitter`
  // block verbatim, so the X/Slack card served generic site copy. Mirror this page's own.
  twitter: {
    card: 'summary_large_image',
    title: 'Privacy policy',
    description: 'How Frequency collects, uses, and protects your personal information.',
  },
  // No `robots` here (SCAN-677): the root layout's block already says index + follow AND carries the
  // googleBot preview directives, and a nested `robots` replaces that block wholesale.
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-surface">
      <div className="px-6 py-16">
        <FocusTemplate
          title="Privacy Policy"
          description="Last updated: September 29, 2026"
          width="default"
        >
          <div className="prose prose-sm prose-gray dark:prose-invert max-w-none space-y-8">
          <section>
            <h2 className="text-body-lg font-semibold text-text">1. Who we are</h2>
            <p className="text-muted leading-relaxed">
              Frequency is operated by Frequency Labs Holdings (&quot;Frequency,&quot; &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;).
              This policy describes how we collect, use, and protect your personal information when
              you use our platform at frequencylocal.com and related services.
            </p>
          </section>

          <section>
            <h2 className="text-body-lg font-semibold text-text">2. Information we collect</h2>
            <p className="text-muted leading-relaxed">
              <strong className="text-text">Account information:</strong> When you sign up,
              we collect your email address, display name, and optional profile details (bio, avatar,
              home area, website, and match preferences such as a birth date for astrology matching).
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
              <strong className="text-text">Location:</strong> The home area you set is stored as a
              point on the map. If you turn on live location, we save your device&apos;s position once
              each time you turn it on. Other members only ever see an approximate area, never your exact
              point. When you claim a code that only works in one place, your device&apos;s position is
              checked against that place and is not saved. To center a map before you share anything, your
              browser may look up an approximate city from your IP address.
            </p>
            <p className="text-muted leading-relaxed">
              <strong className="text-text">Camera and photos:</strong> The QR scanner uses your
              camera only while it is open and reads codes on your device. The video is not uploaded. If
              you photograph a business card or an event poster, that photo is uploaded so Vera can read
              it, and the copies you keep are stored with the contact or event. Photos you add to your
              profile, posts, and events are stored so they can be shown.
            </p>
            <p className="text-muted leading-relaxed">
              <strong className="text-text">Push notifications (optional):</strong> If you allow
              notifications, your browser gives us a push subscription: an address at your browser&apos;s
              push service, the keys that encrypt each notification, and your browser type. We store it
              to send you the notifications you choose, and we delete it when the push service tells us
              it has been turned off.
            </p>
            <p className="text-muted leading-relaxed">
              <strong className="text-text">Phone number (optional):</strong> If you turn on text
              messages, we store your phone number and a record of your consent, including the wording
              you agreed to, the time, and the IP address and browser you agreed from.
            </p>
            <p className="text-muted leading-relaxed">
              <strong className="text-text">Payments:</strong> Card and bank details go straight to
              Stripe. We keep your purchase history and a Stripe reference, never your full card number.
            </p>
            <p className="text-muted leading-relaxed">
              <strong className="text-text">Vera&apos;s memory:</strong> If you use Vera, our AI
              guide, she keeps a short summary of what you have told her (such as interests, goals, and
              neighborhood) so she can help next time. It is not a transcript of your chats.
            </p>
            <p className="text-muted leading-relaxed">
              <strong className="text-text">Usage data:</strong> We record which pages and features
              you use, tied to your account, only while analytics is on for you, and we delete that raw
              record after 90 days. We also measure how fast pages load without tying it to you. We do
              not sell this data.
            </p>
          </section>

          <section>
            <h2 className="text-body-lg font-semibold text-text">3. How we use your information</h2>
            <ul className="text-muted space-y-2 list-disc list-inside">
              <li>To create and maintain your account</li>
              <li>To display your profile to other community members</li>
              <li>To deliver posts, messages, and notifications</li>
              <li>To send transactional emails (event reminders, account updates), and the push notifications and text messages you turn on</li>
              <li>To answer you through Vera and the AI tools you choose to use</li>
              <li>To show you what is near you</li>
              <li>To improve and maintain the platform</li>
            </ul>
          </section>

          <section>
            <h2 className="text-body-lg font-semibold text-text">4. How we share your information</h2>
            <p className="text-muted leading-relaxed">
              We do not sell your personal information. We share data only with service providers
              that help us operate the platform:
            </p>
            <ul className="text-muted space-y-2 list-disc list-inside">
              <li><strong className="text-text">Supabase</strong>. Database, file storage, and sign-in. Everything in your account is stored here.</li>
              <li><strong className="text-text">Vercel</strong>. Hosting. Every page and request passes through Vercel, which sees your IP address and browser. Vercel Web Analytics counts page visits without cookies.</li>
              <li><strong className="text-text">Anthropic</strong>. The AI behind Vera and our drafting tools. When you use one, what you give it (your words, or a photo of a card or poster) and the context it needs, such as Vera&apos;s memory of you, is sent to Anthropic to produce the answer.</li>
              <li><strong className="text-text">Sentry</strong>. Error reports. When something breaks, the error, the page or request it happened on, and your browser and device type are sent to Sentry. We do not attach your name or email.</li>
              <li><strong className="text-text">Twilio</strong>. Text messages, only if you opt in. Twilio receives your phone number and the message.</li>
              <li><strong className="text-text">Resend</strong>. Email delivery. Resend receives your email address, name, and the message, and delivers replies to emails a Space sends.</li>
              <li><strong className="text-text">Stripe</strong>. Payments and payouts. Stripe collects your card or bank details and, for hosts who get paid, the identity details Stripe needs.</li>
              <li><strong className="text-text">Upstash</strong>. Rate limiting. Your IP address or account ID is kept as a short-lived counter so one person cannot flood the site.</li>
              <li><strong className="text-text">Google</strong>. Sign-in (if you choose Google login), contacts import (if you choose it), maps and address search, and Google Analytics. Analytics runs only while it is on for you, and some actions we record on our servers reach it with your account ID, never your name or email.</li>
              <li><strong className="text-text">Map and place search</strong>. OpenFreeMap draws maps, Photon (by Komoot) and OpenStreetMap Nominatim turn a place or address you type into a point on the map, and ipapi.co estimates an approximate city from your IP address. Your browser contacts OpenFreeMap, Photon, and ipapi.co directly, so they see your IP address.</li>
              <li><strong className="text-text">Recraft</strong>. Cover images, only if you ask for one. Recraft receives the title and short summary of what you are making.</li>
              <li><strong className="text-text">Your browser&apos;s push service</strong> (for example Apple, Google, or Mozilla). Delivers the notifications you allow. Each one is encrypted, so the push service cannot read it.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-body-lg font-semibold text-text">5. Google user data</h2>
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
            <h2 className="text-body-lg font-semibold text-text">6. Data security</h2>
            <p className="text-muted leading-relaxed">
              We use industry-standard security measures including encrypted connections (HTTPS),
              secure authentication tokens, and row-level database security policies. Your data is
              stored in Supabase&apos;s infrastructure with encryption at rest.
            </p>
          </section>

          <section>
            <h2 className="text-body-lg font-semibold text-text">7. Your rights</h2>
            <p className="text-muted leading-relaxed">
              You can update or delete your profile information at any time from your account settings.
            </p>
            <p className="text-muted leading-relaxed">
              <strong className="text-text">Download your data:</strong> Go to{' '}
              <Link href="/settings#account" className="text-primary-strong hover:underline">
                Settings, Account and privacy
              </Link>{' '}
              and choose Download my data. You get one file with what is keyed to you, including your
              profile, posts, the messages you sent, RSVPs, memberships, practice history, the contacts
              you saved, Vera&apos;s memory of you, and your consent history.
            </p>
            <p className="text-muted leading-relaxed">
              <strong className="text-text">Delete your account:</strong> Go to{' '}
              <Link href="/settings#account" className="text-primary-strong hover:underline">
                Settings, Account and privacy
              </Link>
              , type DELETE, and choose Delete account. It happens right away and cannot be undone. If
              you own a Space on a paid plan, that plan ends, and the page names it before you confirm.
              Deleting removes your account, your profile
              and the records keyed to them, the files you uploaded to your profile, posts, and saved
              contacts, and your Stripe customer record. Photos you added to an event or a Space stay
              with that event or Space, and support conversations are kept. Deleted data can remain in our
              database backups until those backups expire.
            </p>
            <p className="text-muted leading-relaxed">
              <strong className="text-text">Turn things off:</strong> Change notifications and
              texts in{' '}
              <Link href="/settings#notifications" className="text-primary-strong hover:underline">
                Settings, Notifications
              </Link>
              , or reply STOP to any text. Turn analytics off with Change your cookie choice, under
              Cookies below. For anything you cannot do yourself, email us at hello@frequencylocal.com.
            </p>
          </section>

          <section>
            <h2 className="text-body-lg font-semibold text-text">8. Cookies</h2>
            <p className="text-muted leading-relaxed">
              We use essential cookies to maintain your login session. We also use Google Analytics
              to understand how the site is used, and one attribution cookie that records which page
              or campaign first brought you here. Google Analytics runs only while it is on for you,
              and some actions we record on our servers reach it with your account ID, never your
              name or email. We configure Google Analytics with IP
              anonymization and with advertising and ad-personalization signals turned off. We do
              not use advertising cookies, and we never sell your data.
            </p>
            <p className="text-muted leading-relaxed">
              Google Analytics and the attribution cookie are optional. In the EU, the EEA and the
              UK we ask before either one is used, and nothing is stored until you answer. Anywhere
              else they are on by default and you can turn them off at any time.{' '}
              <CookieChoicesButton />
            </p>
          </section>

          <section>
            <h2 className="text-body-lg font-semibold text-text">9. Changes to this policy</h2>
            <p className="text-muted leading-relaxed">
              We may update this policy from time to time. We will notify members of material changes
              via email or an in-app announcement.
            </p>
          </section>

          <section>
            <h2 className="text-body-lg font-semibold text-text">10. Contact</h2>
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
