import type { Metadata } from 'next'
import { FocusTemplate } from '@/components/templates'

// SPACE EMAIL ACCEPTABLE-USE POLICY: A DRAFT FOR COUNSEL (LIVE-707, ADR-1658; owner ruling OWN-085
// "Draft the AUP for review").
//
// This page is NOT live policy. It is the plain-language draft the owner hands to a lawyer. Three
// things keep it from reading as final, and the test next door pins all three:
//   1. `robots: { index: false }` and no entry in app/sitemap.ts, so nothing advertises it;
//   2. nothing links here, least of all the Turn on email card (components/spaces/email/
//      email-enable-card.tsx), whose checkbox stays the only thing an owner agrees to until
//      counsel has read this and OWN-085 closes;
//   3. the page opens with a draft banner and closes with the open questions for counsel.
//
// EVERY RULE IS GROUNDED IN WHAT THE CODE DOES (lib/spaces/email.ts is the send backbone):
//   who sends       canEditProfile + the per-Space `email` function, default min role admin
//                   (lib/spaces/functions.ts), behind the spaces.email_enabled kill switch that
//                   defaults off and needs the acknowledgment to turn on;
//   who receives    canEmailContact: a marketing send needs consent_state 'subscribed' in THIS
//                   Space; an import lands 'unknown' (lib/crm/import/commit.ts); the one relaxed
//                   lane is an event host mailing that event's guests (consentPurposeForLane);
//   limits          DAILY_SEND_CAP (500 a day, UTC; skipped recipients do not count) and the plan's
//                   monthly `space_email` allowance;
//   unsubscribe     RFC 8058 one-click header + footer link, a per-Space suppression, per-topic mute;
//   bounces         the Resend webhook suppresses a hard bounce or complaint globally AND for the
//                   Space (app/api/webhooks/resend/route.ts); the Email panel flags complaints over
//                   0.1% (components/spaces/email/analytics-panel.tsx);
//   turning it off  the same kill switch; platform staff hold Space admin capability.
// If one of those changes, change the sentence here in the same PR.
//
// Voice: docs/CONTENT-VOICE.md. Plain, no em dashes. Bracketed text is a placeholder for the owner.

export const metadata: Metadata = {
  title: 'Space email policy (draft)',
  description: 'A working draft of the rules for sending email from a Space on Frequency, written for legal review. Not in force.',
  alternates: { canonical: '/space-email-policy' },
  // A draft for counsel is not something to index or advertise. It is deliberately absent from
  // app/sitemap.ts, and nothing in the product links here until the reviewed version replaces it.
  robots: { index: false, follow: false },
}

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-body-lg font-semibold text-text">
        {n}. {title}
      </h2>
      {children}
    </section>
  )
}

const P = 'text-muted leading-relaxed'
const UL = 'text-muted space-y-2 list-disc list-inside'
const B = 'text-text'

export default function SpaceEmailPolicyPage() {
  return (
    <div className="min-h-screen bg-surface">
      <div className="px-6 py-16">
        <FocusTemplate
          eyebrow="Draft for counsel review"
          title="Space email acceptable use policy"
          description="Working draft, September 29, 2026. Not in force."
          width="default"
        >
          <div className="prose prose-sm prose-gray dark:prose-invert max-w-none space-y-8">
            <section>
              <div className="rounded-card border border-border bg-surface-elevated p-4" role="note">
                <p className={P}>
                  <strong className={B}>DRAFT. Not in force, and no lawyer has read it yet.</strong> This
                  is a working draft of the rules for sending email from a Space, written so a lawyer can
                  review it. It is not legal advice and it is not part of any agreement. Nothing in
                  Frequency links here. Until a reviewed version replaces it, the rules that apply are our
                  Terms of Service and the box you tick when you turn email on for a Space.
                </p>
              </div>
            </section>

            <Section n={1} title="What this covers">
              <p className={P}>
                A Space on Frequency can email its own contacts: one-off campaigns, scheduled sends,
                automated sequences, and an event host&apos;s updates to that event&apos;s guests. This
                policy covers all of it. It sits on top of our Terms of Service, which still apply.
              </p>
              <p className={P}>
                Email is off for every Space until someone who runs the Space turns it on. By default
                that is the Space&apos;s owner or an admin; a Space can open it to its editors. Turning
                it on means confirming that you have permission to email these people and will follow
                anti-spam rules. The Space is the sender, and the people who run it are responsible for
                what it sends.
              </p>
            </Section>

            <Section n={2} title="How your email goes out">
              <ul className={UL}>
                <li>
                  We send it through our email provider from Frequency&apos;s shared sending address, with
                  your Space&apos;s name as the sender name.
                </li>
                <li>Replies go to that shared address, not to your Space.</li>
                <li>
                  Every email carries a one-click unsubscribe link, both in the email itself and in the
                  header inbox apps use for their own unsubscribe button.
                </li>
                <li>
                  We record opens and link clicks for each email, and show them to your Space as totals
                  and on each contact&apos;s timeline.
                </li>
              </ul>
            </Section>

            <Section n={3} title="Who you may email">
              <p className={P}>
                Only people who asked to hear from your Space. In Frequency, that means a contact your
                Space holds as <strong className={B}>subscribed</strong>. A contact gets there by doing
                something themselves: joining your Space, ticking the opt-in box on your contact form,
                taking something you offered in exchange for their email, unlocking an offer from your QR
                code, or accepting a warm intro. Anyone else is skipped when you send, and the skip is
                logged.
              </p>
              <p className={P}>
                Contacts you import start as not opted in, and a campaign skips them. Importing a list
                does not give you permission to email it.
              </p>
              <p className={P}>
                <strong className={B}>One exception.</strong> The host of an event may send updates
                about that event to the people who signed up for it, even if they never subscribed to
                the Space. Only event updates, only to that event&apos;s own guests, and everyone who
                unsubscribed or muted event updates is still skipped.
              </p>
              <p className={P}>Do not:</p>
              <ul className={UL}>
                <li>Buy, rent, borrow, trade, or scrape email lists</li>
                <li>Add people because they handed you a card, filled in a sign-up sheet for something else, or appear in a directory</li>
                <li>Email anyone who has unsubscribed from your Space, including through another tool</li>
                <li>Share your Space&apos;s contacts with another Space or business to email</li>
              </ul>
            </Section>

            <Section n={4} title="Unsubscribes">
              <ul className={UL}>
                <li>
                  One click unsubscribes a person from your Space. The next send skips them. There is no
                  login, no form, and no fee.
                </li>
                <li>
                  A person can instead mute one kind of email from your Space (marketing, event updates,
                  or announcements) and keep the rest. Each send is tagged with one of those, and a
                  muted kind is skipped.
                </li>
                <li>
                  Your Space&apos;s email page lists everyone you can no longer email and why. You cannot
                  remove anyone from that list. If someone wants to hear from you again, they have to
                  opt in again themselves.
                </li>
                <li>
                  Do not try to get around an unsubscribe: no new address for the same person, no
                  re-importing them, no mailing them from somewhere else about the same thing.
                </li>
              </ul>
            </Section>

            <Section n={5} title="What your email must be">
              <ul className={UL}>
                <li>From your Space, under its real name. Do not pose as another person, business, or Frequency.</li>
                <li>Honest in its subject line. The subject says what the email is about.</li>
                <li>Clear about who is writing and why the reader is getting it.</li>
                <li>Complete. Keep the unsubscribe link our editor adds. Do not hide, shrink, or remove it.</li>
              </ul>
            </Section>

            <Section n={6} title="What you may not send">
              <ul className={UL}>
                <li>Anything our Terms of Service prohibit, including harassment, threats, hate, and illegal content</li>
                <li>Phishing, malware, or links that pretend to go somewhere they do not</li>
                <li>Requests for passwords, card numbers, or bank details by email</li>
                <li>Health claims that promise to cure, treat, or prevent a disease or condition</li>
                <li>Firearms, weapons, or explosives</li>
                <li>Drugs, cannabis, or prescription medicines, and supplements sold with medical claims</li>
                <li>Gambling, sweepstakes you are not licensed to run, or games of chance</li>
                <li>Sexual content or adult services</li>
                <li>Get-rich-quick offers, multi-level marketing recruitment, crypto or investment pitches, and payday or debt offers</li>
                <li>Anything sold for someone else, or email sent on another business&apos;s behalf</li>
              </ul>
              <p className={P}>
                This list is a draft for review and may be longer when it is final. When something is
                unclear, ask us before you send.
              </p>
            </Section>

            <Section n={7} title="Sending limits">
              <ul className={UL}>
                <li>A Space can send up to 500 emails a day, counted from midnight UTC. This is the same on every plan.</li>
                <li>Your plan may also set a monthly allowance, which resets on the 1st.</li>
                <li>A person who is skipped (unsubscribed, never opted in, or bounced) does not count against any limit.</li>
              </ul>
              <p className={P}>
                These limits protect the sending reputation every Space shares. Do not split one list
                across several Spaces or accounts to get around them.
              </p>
            </Section>

            <Section n={8} title="Bounces and spam complaints">
              <p className={P}>
                If an address bounces for good, or a person marks your email as spam, nobody on Frequency
                can email that address again. That stop applies to your Space and to every other Space.
              </p>
              <p className={P}>
                Your Space&apos;s email page shows what was sent, delivered, bounced, and marked as spam.
                It warns you when spam complaints go above 0.1% of what you sent, which is the line inbox
                providers watch. If you see that warning, stop, and send only to people who clearly asked.
              </p>
            </Section>

            <Section n={9} title="When we turn email off">
              <p className={P}>
                We can turn off email for a Space at any time. Turning it off stops everything, including
                scheduled sends and sequences. We may do it when:
              </p>
              <ul className={UL}>
                <li>A Space breaks this policy or our Terms of Service</li>
                <li>Spam complaints stay above 0.1%, or bounces climb, and do not come down</li>
                <li>Recipients report the Space&apos;s email to us</li>
                <li>Our email provider asks us to stop a sender</li>
              </ul>
              <p className={P}>
                We will tell the Space&apos;s owner why by email. For serious or repeated problems we may
                also suspend the Space or the accounts involved, as our Terms of Service allow.
              </p>
            </Section>

            <Section n={10} title="Asking us to look again">
              <p className={P}>
                If we turned off your Space&apos;s email and you think we got it wrong, email{' '}
                <a href="mailto:hello@frequencylocal.com" className="text-primary-strong hover:underline">
                  hello@frequencylocal.com
                </a>{' '}
                with your Space&apos;s name and what happened. A person reads every appeal. We will reply
                within [owner to set: number of business days]. If you have fixed the cause (for
                example, cleaned the list or changed how people sign up), tell us what changed.
              </p>
            </Section>

            <Section n={11} title="Your part">
              <p className={P}>
                Your Space is the sender. You are responsible for following the email laws that apply to
                you and to the people you write to, which can include the CAN-SPAM Act in the United
                States, Canada&apos;s anti-spam law, and data protection law in the UK and European Union.
                Keep a record of how each person opted in to your Space.
              </p>
            </Section>

            <Section n={12} title="Changes to this policy">
              <p className={P}>
                We may update this policy. When we make a real change, we will tell every Space that has
                email turned on before the change takes effect.
              </p>
            </Section>

            <section>
              <div className="rounded-card border border-border bg-surface-elevated p-4 space-y-3" role="note">
                <p className={P}>
                  <strong className={B}>For counsel: open questions.</strong> These come from reading
                  what Space email actually does today. This section comes out before the policy is
                  published.
                </p>
                <ol className="text-muted space-y-2 list-decimal list-inside">
                  <li>
                    Sender of record. Each email goes out from Frequency&apos;s shared address with the
                    Space&apos;s name as the display name. Who is the sender under CAN-SPAM, and are we
                    controller or processor for Space contacts under GDPR and UK GDPR?
                  </li>
                  <li>
                    Physical address. Emails built in the Space email editor carry Frequency Labs
                    Holdings&apos; postal address in the footer. The plain campaign composer and automated
                    sequences carry an unsubscribe line and no address. Whose address must appear, and
                    must every Space provide one?
                  </li>
                  <li>
                    Replies. There is no per-Space reply address yet; replies go to Frequency&apos;s
                    shared no-reply sender. Is that acceptable, given the one-click unsubscribe?
                  </li>
                  <li>
                    The event host exception. An event host can mail that event&apos;s guests without a
                    marketing opt-in (event updates only, unsubscribes and mutes honored). Does that hold
                    as transactional or relationship mail under CAN-SPAM, CASL, and PECR?
                  </li>
                  <li>
                    Join as consent. Joining a Space marks the person as subscribed to that Space&apos;s
                    email. Is a join enough, or does the join screen need its own notice or checkbox?
                  </li>
                  <li>
                    Global stop. One spam complaint or hard bounce stops every Space from emailing that
                    address. Is that right, or should a complaint against one Space stop only that Space?
                  </li>
                  <li>
                    Enforcement. Nothing turns a Space&apos;s email off automatically today: the 0.1%
                    complaint line is a warning to the Space, and our staff turn email off by hand.
                    Suspending a Space does not by itself stop its email yet. Does the policy need a fixed
                    threshold, a notice period, or a right to respond before we turn email off?
                  </li>
                  <li>
                    Prohibited list. Section 6 is a starting list for a wellness community. Which items
                    should move, be added, or be allowed with conditions (for example, licensed
                    practitioners, alcohol at events, political or fundraising email)?
                  </li>
                  <li>
                    Tracking. We record opens and clicks with a pixel and redirected links. Does that need
                    a line in the recipient-facing privacy notice, and consent in the EU and UK?
                  </li>
                  <li>
                    Acceptance. Today an owner ticks one box. Should turning email on require agreeing to
                    this policy by name, with the date recorded, and should Spaces that already have
                    email on be asked to agree once it is final?
                  </li>
                  <li>
                    Appeals. What reply time should we commit to, and should an appeal pause anything?
                  </li>
                </ol>
              </div>
            </section>
          </div>
        </FocusTemplate>
      </div>
    </div>
  )
}
