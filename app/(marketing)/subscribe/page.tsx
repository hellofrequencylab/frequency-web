import type { Metadata } from 'next'
import Link from 'next/link'
import { Mail, MousePointerClick, Inbox } from 'lucide-react'
import { PageHero, Section, FaqList } from '@/components/marketing/marketing-ui'
import { SubscribeForm } from '@/components/marketing/subscribe-form'
import { JsonLd } from '@/components/json-ld'
import { breadcrumbSchema, faqSchema } from '@/lib/jsonld'

export const metadata: Metadata = {
  title: 'Get notes from Frequency',
  description:
    "A few notes a month from Daniel Tyack, through Frequency: Circles, practices, and events. Leave your email, confirm the link, and you're on the list.",
  alternates: { canonical: '/subscribe' },
  openGraph: {
    title: 'Get notes from Frequency',
    description: 'A few notes a month on Circles, practices, and events. Confirm your email and you’re on the list.',
    url: '/subscribe',
  },
}

export const revalidate = 3600

const HOW_IT_WORKS = [
  { Icon: Mail, t: 'Leave your email', b: 'Enter your address below. First name is optional. It takes ten seconds.' },
  { Icon: MousePointerClick, t: 'Confirm it’s you', b: 'We send one email with a link. Click it and you’re on the list. No link, no list.' },
  { Icon: Inbox, t: 'Hear from Daniel', b: 'A few notes a month on Circles, practices, and events. Unsubscribe any time, one click.' },
]

const FAQS = [
  {
    q: 'Who is emailing me?',
    a: 'Daniel Tyack, through Frequency. Real notes from a real person, not an automated drip.',
  },
  {
    q: 'How often will you email me?',
    a: 'A few times a month at most. Circles, practices, events, and the odd invite when something opens near you.',
  },
  {
    q: 'Why do I have to confirm?',
    a: 'So nobody ends up on the list by accident or because someone typed the wrong address. You only get notes after you click the confirm link we send.',
  },
  {
    q: 'Can I leave later?',
    a: 'Any time. Every email has a one-click unsubscribe, and it always works.',
  },
]

export default function SubscribePage() {
  return (
    <>
      <JsonLd
        data={[
          faqSchema(FAQS.map((f) => ({ q: f.q, a: f.a }))),
          breadcrumbSchema([{ name: 'Subscribe', path: '/subscribe' }]),
        ]}
      />

      <PageHero
        eyebrow="Stay in the loop"
        title="Get notes from Frequency."
        subtitle="Leave your email and hear from Daniel Tyack, through Frequency. A few notes a month on Circles, practices, and events. Nothing more."
      />

      {/* ── The form (the whole point of the page) ─────────────────────────── */}
      <Section tone="surface" pad="pb-16 sm:pb-20">
        <div className="max-w-md mx-auto">
          <SubscribeForm />
          <p className="mt-4 text-center text-xs text-subtle leading-relaxed">
            We email you to confirm first, so you only hear from us if you actually want to.
          </p>
        </div>
      </Section>

      {/* ── How it works ───────────────────────────────────────────────────── */}
      <Section tone="canvas">
        <div className="text-center mb-10">
          <p className="text-sm font-bold uppercase tracking-[0.25em] text-primary-strong mb-4">
            How it works
          </p>
          <h2 className="font-display uppercase text-text text-[clamp(1.875rem,5.5vw,3rem)]">
            Three steps. No surprises.
          </h2>
        </div>
        <ol className="grid sm:grid-cols-3 gap-5">
          {HOW_IT_WORKS.map(({ Icon, t, b }) => (
            <li key={t} className="rounded-2xl border border-border bg-surface p-7 shadow-sm">
              <span className="inline-flex w-10 h-10 rounded-2xl bg-primary-bg items-center justify-center mb-4">
                <Icon className="w-5 h-5 text-primary-strong" aria-hidden />
              </span>
              <p className="text-lg font-bold text-text">{t}</p>
              <p className="mt-1.5 text-sm text-muted leading-relaxed">{b}</p>
            </li>
          ))}
        </ol>
      </Section>

      {/* ── FAQ ────────────────────────────────────────────────────────────── */}
      <Section tone="surface">
        <div className="mb-8">
          <p className="text-sm font-bold uppercase tracking-[0.25em] text-primary-strong mb-4">
            Straight answers
          </p>
          <h2 className="font-display uppercase text-text text-[clamp(1.875rem,5.5vw,3rem)]">
            Questions before you sign up.
          </h2>
        </div>
        <FaqList items={FAQS} />
        <p className="mt-10 text-sm text-muted">
          Want the bigger picture first?{' '}
          <Link href="/the-community" className="font-semibold text-primary-strong hover:underline">
            See what Frequency is
          </Link>
          .
        </p>
      </Section>
    </>
  )
}
