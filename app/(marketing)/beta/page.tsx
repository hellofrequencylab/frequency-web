import type { Metadata } from 'next'
import Link from 'next/link'
import { Users, CalendarHeart, Sparkles, ShieldCheck } from 'lucide-react'
import { PhotoHero, Section, Statement } from '@/components/marketing/marketing-ui'
import { BetaForm } from '@/components/marketing/beta-form'
import { FOUNDING_PLACE } from '@/lib/site'
import { JsonLd } from '@/components/json-ld'
import { breadcrumbSchema } from '@/lib/jsonld'

export const metadata: Metadata = {
  title: 'Join the Beta',
  description:
    "Request your spot in the Frequency community Beta. We're opening it to a small group at a time, free during the beta, no card, founder pricing locked.",
  alternates: { canonical: '/beta' },
  openGraph: {
    title: 'Join the Frequency Beta',
    description: 'Be one of the first. Request your spot in the community Beta.',
    url: '/beta',
  },
}

export const revalidate = 3600

const WHAT_YOU_GET = [
  { Icon: Users, label: 'A local Circle near you', body: "A small group of neighbors built around what you practice, small enough to be missed when you don't show." },
  { Icon: CalendarHeart, label: 'Real gatherings, in person', body: 'Standing times to actually show up, on the bluff, at The Lab, around a table.' },
  { Icon: Sparkles, label: 'A say in what it becomes', body: 'Founding members shape the Circles, the rituals, and the room from day one.' },
  { Icon: ShieldCheck, label: 'Founder pricing, locked', body: 'Free for the whole beta, no card. Lock your founder rate for when paid memberships launch.' },
]

export default function BetaPage() {
  return (
    <>
      <JsonLd
        data={breadcrumbSchema([{ name: 'Join the Beta', path: '/beta' }])}
      />
      <PhotoHero
        image="/images/site/22a51611-07f6-4c39-8a26-1c996295b6d3.jpg"
        alt="A Frequency community dancing together outdoors at golden hour, arms raised"
        focal="object-center"
        eyebrow="The community beta"
        title="Be one of the first."
        subtitle={`We're opening Frequency to a small group at a time, starting in ${FOUNDING_PLACE}. Add your name and we'll reach out when a spot opens for you.`}
        footer={
          <p className="mt-8 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm text-white/60">
            <span className="font-semibold text-white/80">Free during the beta.</span>
            <span aria-hidden className="text-white/30">·</span>
            <span>No card · Founder pricing locked · Leave anytime</span>
          </p>
        }
      />

      {/* ── Form + what you get ──────────────────────────────────────────── */}
      <Section tone="surface" pad="py-20 sm:py-24">
        <div className="grid lg:grid-cols-2 gap-10 lg:gap-14 items-start">
          {/* Why you're here */}
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.25em] text-primary-strong mb-4">
              What you&apos;re joining
            </p>
            <h2 className="font-display uppercase text-text text-4xl sm:text-5xl mb-7">
              Not another feed. A place to be missed.
            </h2>
            <ul className="space-y-5">
              {WHAT_YOU_GET.map(({ Icon, label, body }) => (
                <li key={label} className="flex items-start gap-4">
                  <span className="shrink-0 w-10 h-10 rounded-2xl bg-primary-bg flex items-center justify-center">
                    <Icon className="w-5 h-5 text-primary-strong" aria-hidden />
                  </span>
                  <div>
                    <p className="text-base font-bold text-text">{label}</p>
                    <p className="text-sm text-muted leading-relaxed mt-0.5">{body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* The form */}
          <div className="lg:pt-1">
            <BetaForm />
            <p className="mt-4 text-center text-xs text-subtle leading-relaxed">
              No spam, ever. Just one note when a spot opens for you.
            </p>
          </div>
        </div>
      </Section>

      {/* ── Honest scarcity beat ─────────────────────────────────────────── */}
      <Statement tone="ink">
        We open a few spots at a time, so you&apos;re actually{' '}
        <span className="text-primary">welcomed in</span>.
      </Statement>

      {/* ── How it works after you sign up ───────────────────────────────── */}
      <Section tone="canvas" pad="py-20 sm:py-24">
        <div className="text-center mb-12">
          <p className="text-sm font-bold uppercase tracking-[0.25em] text-primary-strong mb-4">
            What happens next
          </p>
          <h2 className="font-display uppercase text-text text-4xl sm:text-5xl">
            Three steps to belonging.
          </h2>
        </div>
        <ol className="grid sm:grid-cols-3 gap-5">
          {[
            { n: '01', t: 'Add your name', b: 'Tell us where you are. It takes ten seconds and costs nothing.' },
            { n: '02', t: 'We reach out', b: 'When a spot opens near you, we send a personal invite, not a mass blast.' },
            { n: '03', t: 'Show up', b: "Find your Circle, meet your people, and start being missed when you're gone." },
          ].map((s) => (
            <li key={s.n} className="rounded-2xl border border-border bg-surface p-7 shadow-sm">
              <span className="font-display text-3xl text-border-strong" aria-hidden>
                {s.n}
              </span>
              <p className="mt-3 text-lg font-bold text-text">{s.t}</p>
              <p className="mt-1.5 text-sm text-muted leading-relaxed">{s.b}</p>
            </li>
          ))}
        </ol>
        <p className="mt-10 text-center text-sm text-muted">
          Curious first?{' '}
          <Link href="/the-community" className="font-semibold text-primary-strong hover:underline">
            See how it works
          </Link>{' '}
          ·{' '}
          <Link href="/pricing" className="font-semibold text-primary-strong hover:underline">
            View pricing
          </Link>{' '}
          ·{' '}
          <Link href="/the-quest" className="font-semibold text-primary-strong hover:underline">
            See The Quest
          </Link>
        </p>
      </Section>
    </>
  )
}
