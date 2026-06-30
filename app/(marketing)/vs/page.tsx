// The /vs index — a small hub linking every "Frequency vs X" comparison page
// (GE11-1). Public marketing chrome, real canonical, breadcrumb + ItemList
// JSON-LD. Voice locked: plain, honest, no em dashes.
import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { PageHero, Section, BetaCTA, Button } from '@/components/marketing/marketing-ui'
import { JsonLd } from '@/components/json-ld'
import { breadcrumbSchema } from '@/lib/jsonld'
import { SITE_NAME, SITE_URL } from '@/lib/site'
import { COMPARISONS, comparisonPath } from '@/lib/marketing/comparisons'

export const revalidate = 3600

const TITLE = 'Frequency compared'
const DESCRIPTION =
  'How Frequency compares to the tools people use to gather others: Partiful, Linktree, Calendly, Eventbrite, and Mighty Networks. Frequency is a free local Circle that keeps meeting in person.'

export function generateMetadata(): Metadata {
  const canonical = '/vs'
  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical },
    openGraph: {
      title: `${TITLE} · ${SITE_NAME}`,
      description: DESCRIPTION,
      url: canonical,
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: `${TITLE} · ${SITE_NAME}`,
      description: DESCRIPTION,
    },
  }
}

export default function ComparisonsIndexPage() {
  return (
    <>
      <JsonLd
        data={[
          breadcrumbSchema([{ name: 'Compare', path: '/vs' }]),
          {
            '@context': 'https://schema.org',
            '@type': 'ItemList',
            name: 'Frequency comparisons',
            numberOfItems: COMPARISONS.length,
            itemListElement: COMPARISONS.map((c, i) => ({
              '@type': 'ListItem',
              position: i + 1,
              url: `${SITE_URL}${comparisonPath(c.slug)}`,
              name: `Frequency vs ${c.name}`,
            })),
          },
        ]}
      />

      <PageHero
        eyebrow="Compare"
        title={
          <>
            How Frequency <span className="text-primary">compares</span>
          </>
        }
        subtitle="Most tools help you throw one event or share one link. Frequency is the standing room underneath: a small Circle that keeps meeting in person. Here is how it stacks up against the tools you already know."
      />

      <Section tone="canvas" pad="pb-16 sm:pb-20">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {COMPARISONS.map((c) => (
            <Link
              key={c.slug}
              href={comparisonPath(c.slug)}
              className="group flex items-center justify-between gap-4 rounded-2xl border border-border bg-surface px-6 py-5 shadow-sm transition-colors hover:border-primary"
            >
              <span>
                <span className="block text-lg font-semibold text-text">
                  Frequency vs {c.name}
                </span>
                <span className="mt-0.5 block text-sm text-muted">{c.category}</span>
              </span>
              <ArrowRight className="h-5 w-5 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-primary-strong" aria-hidden />
            </Link>
          ))}
        </div>
        <div className="mt-10">
          <Button href="/the-community" variant="secondary">
            See how Circles work
          </Button>
        </div>
      </Section>

      <BetaCTA
        heading="The tool is not the point. The people you keep seeing are."
        body="Frequency is free to join during the beta. Find a Circle near you and start showing up."
      />
    </>
  )
}
