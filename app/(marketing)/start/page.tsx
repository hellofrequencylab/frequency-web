import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { PageHero, Section, Card, Button } from '@/components/marketing/marketing-ui'
import { Illustration, type IllustrationName } from '@/components/marketing/illustrations'
import { JsonLd } from '@/components/json-ld'
import { breadcrumbSchema } from '@/lib/jsonld'

// The role picker (ADR-180 keeps this a coded page, not a Puck slug). One decision:
// Build, Practice, or Spread. Each card routes to a DISTINCT destination that keeps its
// own promise and carries the reader's choice forward as a real signal the induction
// consumes: `?persona=` pre-selects the picker, branches the tour reel, and is stamped
// on the member; `?seq=` picks the playable-practice funnel. (Earlier all three cards
// pointed at a param-less /join, so the door you picked was thrown away.)
// The assignable lead flows still live under /start/[flow].
export const revalidate = 3600

export function generateMetadata(): Metadata {
  return {
    title: 'Where do you want to start?',
    description:
      'Three ways into Frequency: lead a Circle, do a practice today, or bring one person. Pick the door that fits and we point you at your first move.',
    alternates: { canonical: '/start' },
    openGraph: {
      title: 'Where do you want to start? · Frequency',
      description:
        'Build, Practice, or Spread. Pick the door that fits and we point you at your first move.',
      url: '/start',
    },
    // Metadata merges per TOP-LEVEL KEY: setting only `openGraph` inherits the root `twitter`
    // block verbatim, so the X/Slack card served generic site copy. Mirror this page's own.
    twitter: {
      card: 'summary_large_image',
      title: 'Where do you want to start? · Frequency',
      description:
        'Build, Practice, or Spread. Pick the door that fits and we point you at your first move.',
    },
  }
}

type Role = {
  illustration: IllustrationName
  label: string
  blurb: string
  cta: string
  href: string
}

// Each door carries the choice forward. Build and Spread enter the induction pre-set
// to the persona that keeps their promise (builder = lead a Circle, visitor = find and
// gather your people). Practice opens the playable breathwork funnel, so "do one practice
// today" is literal: you take a real breathing round before you ever sign up.
const ROLES: Role[] = [
  {
    illustration: 'lead',
    label: 'Build',
    blurb: 'Be the reason your people have somewhere to go. Host one Circle and we hand you the format.',
    cta: 'Start one Circle',
    href: '/join?persona=builder&flow=welcome',
  },
  {
    illustration: 'practice',
    label: 'Practice',
    blurb: 'Start where you are, today. Take one breathing round now, on your own, before you sign up.',
    cta: 'Do one practice today',
    href: '/join?seq=breathwork',
  },
  {
    illustration: 'spread',
    label: 'Spread',
    blurb: 'Take a small role in building community around you. Bring one person, host once, or share the idea.',
    cta: 'Bring one person',
    href: '/join?persona=visitor&flow=welcome',
  },
]

export default function StartPage() {
  return (
    <>
      <JsonLd data={breadcrumbSchema([{ name: 'Start', path: '/start' }])} />
      <PageHero
        eyebrow="Pick your way in"
        title={
          <>
            Where do you want to <span className="text-primary-strong">start?</span>
          </>
        }
        subtitle="The third place is gone, and ordinary people are rebuilding it where they live. There are three ways to be one of them. Pick the one that fits you."
      />

      <Section tone="canvas" role="cont">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {ROLES.map((role) => (
            <Card key={role.label} tone="feature" className="flex flex-col text-center">
              <div className="h-28 mb-5 flex items-center justify-center">
                <Illustration name={role.illustration} className="h-full" />
              </div>
              <h2 className="font-display uppercase text-text text-page-title mb-2">{role.label}</h2>
              <p className="text-body text-muted leading-relaxed mb-6">{role.blurb}</p>
              <div className="mt-auto">
                <Button href={role.href} size="sm">
                  {role.cta} <ArrowRight className="w-4 h-4" aria-hidden />
                </Button>
              </div>
            </Card>
          ))}
        </div>
        <p className="mt-10 text-center text-body-sm text-subtle">
          Not sure yet? Any door works. You can change your mind, and most people end up doing a little of all three.
        </p>
      </Section>

      {/* 🔴 THE ORPHAN FIX (LIVE-256). These three pillar pages are in the sitemap and in llms.txt
          and NOTHING on the site linked to them, so they carried their own SEO weight and earned no
          internal link equity from anywhere. /start is the honest seat: a reader who is not ready to
          pick a door has one of these questions, and this is a real answer rather than a nav dump.
          Keep the labels as the reader's own words (CONTENT-VOICE §2a), not as page titles. */}
      <Section tone="surface">
        <h2 className="text-center font-display uppercase text-text text-page-title">
          Not ready to pick a door?
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-body text-muted leading-relaxed">
          Start with whichever one sounds like your week. Each is a plain answer, no signup.
        </p>
        <ul className="mx-auto mt-8 grid max-w-3xl gap-4 sm:grid-cols-3">
          {[
            { href: '/friendship-as-an-adult', label: 'It is hard to make friends as an adult', note: 'Why it gets harder after 30, and what actually works.' },
            { href: '/how-to-be-more-social', label: 'I want to be more social', note: 'Without a new personality, and without drinking.' },
            { href: '/calm-down-fast', label: 'I cannot switch off', note: 'What to do in the next five minutes when you are wired.' },
          ].map((g) => (
            <li key={g.href}>
              <Link
                href={g.href}
                className="flex h-full flex-col rounded-card border border-border bg-surface p-5 transition-colors hover:border-border-strong"
              >
                <span className="text-body font-bold text-text">{g.label}</span>
                <span className="mt-1 text-body-sm text-muted leading-relaxed">{g.note}</span>
                <span className="mt-3 inline-flex items-center gap-1 text-body-sm font-semibold text-primary-strong">
                  Read it <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Section>
    </>
  )
}
