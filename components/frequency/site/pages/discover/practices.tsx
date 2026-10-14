// /discover/practices, /discover/practices/pillar/[slug] and /discover/practices/[id] under the
// Frequency design. The pages keep their reads (the trending library, the per-Pillar search, the
// public practice), their redirects, metadata and JSON-LD; these bodies draw them in the site kit.
// The Pillar chips stay real links, so the per-Pillar pages stay crawlable landing pages.

import Link from 'next/link'
import { BETA_CTA_HREF, SITE_NAME } from '@/lib/site'
import { ShareButton } from '@/components/discover/share-button'
import { KeepGoing } from '@/components/frequency/site/shell/keep-going'
import {
  ActionPanel,
  count,
  DetailBody,
  DirCard,
  DirChips,
  DirEmpty,
  DirGrid,
  DirHero,
  DirPage,
  DirSection,
  Fact,
  photo,
} from './parts'

/** The card's shape; RankedPractice and PublicPractice both satisfy it (as PracticeCardData does). */
interface PracticeCardData {
  id: string
  slug: string | null
  title: string
  subcategory: { name: string } | null
  summary: string | null
  description: string | null
}

interface PillarLink {
  slug: string
  name: string
}

function pillarChips(pillars: PillarLink[], active: string) {
  return [
    { href: '/discover/practices', label: 'All', on: active === 'all' },
    ...pillars.map((p) => ({ href: `/discover/practices/pillar/${p.slug}`, label: p.name, on: active === p.slug })),
  ]
}

function PracticeGrid({ rows }: { rows: PracticeCardData[] }) {
  return (
    <DirGrid label="Practices">
      {rows.map((p) => (
        <DirCard
          key={p.id}
          href={`/discover/practices/${p.slug ?? p.id}`}
          icon="practice"
          kicker={p.subcategory?.name}
          title={p.title}
          body={p.summary ?? p.description}
        />
      ))}
    </DirGrid>
  )
}

const CLOSER = {
  primary: { href: BETA_CTA_HREF, label: 'Find your Circle' },
  secondary: { href: '/discover/journeys', label: 'Browse Journeys' },
}

export function FrequencyPractices({
  title,
  description,
  practices,
  pillars,
  image,
}: {
  title: string
  description: string
  practices: PracticeCardData[]
  pillars: PillarLink[]
  image: string | null
}) {
  return (
    <DirPage side="p">
      <DirHero
        crumbs={[{ label: 'Discover', href: '/discover' }, { label: 'Practices' }]}
        image={image || photo('day-meditation-circle.jpg')}
        title={title}
        lede={description}
      />
      <DirSection
        label="The library"
        meta={practices.length > 0 ? count(practices.length, 'Practice', 'Practices') : null}
        title="One small act you can keep."
      >
        {pillars.length > 0 && <DirChips label="Browse practices by Pillar" chips={pillarChips(pillars, 'all')} />}
        {practices.length === 0 ? (
          <DirEmpty
            title="The library’s still filling in."
            body="New Practices land every week. Check back in a few days, or find a Circle doing one near you now."
          >
            <Link className="btn fq-iri-btn" href="/discover/circles">
              Browse Circles
            </Link>
          </DirEmpty>
        ) : (
          <PracticeGrid rows={practices} />
        )}
      </DirSection>
      <KeepGoing
        title="Practices are better with people."
        body="A Practice sticks when a few neighbors are doing it with you. Join free and find your Circle."
        {...CLOSER}
      />
    </DirPage>
  )
}

export function FrequencyPillarPractices({
  pillar,
  description,
  pillars,
  rows,
  image,
}: {
  pillar: PillarLink
  description: string
  pillars: PillarLink[]
  rows: PracticeCardData[]
  image: string | null
}) {
  return (
    <DirPage side="p">
      <DirHero
        crumbs={[
          { label: 'Discover', href: '/discover' },
          { label: 'Practices', href: '/discover/practices' },
          { label: pillar.name },
        ]}
        image={image || photo('day-meditation-circle.jpg')}
        title={`${pillar.name} Practices`}
        lede={description}
      />
      <DirSection
        label={pillar.name}
        meta={rows.length > 0 ? count(rows.length, 'Practice', 'Practices') : null}
        title={`Small ${pillar.name} acts, kept up.`}
      >
        <DirChips label="Browse practices by Pillar" chips={pillarChips(pillars, pillar.slug)} />
        {rows.length === 0 ? (
          <DirEmpty title={`No ${pillar.name} practices yet.`} body="This Pillar is still filling in. The full library has plenty to start with.">
            <Link className="btn fq-iri-btn" href="/discover/practices">
              Browse the full library
            </Link>
          </DirEmpty>
        ) : (
          <PracticeGrid rows={rows} />
        )}
      </DirSection>
      <KeepGoing
        title="Practices stick when people are counting on you."
        body={`Pick a ${pillar.name} practice, then find a Circle near you doing it on a standing rhythm. Join free and start showing up.`}
        {...CLOSER}
      />
    </DirPage>
  )
}

export interface PracticeDetail {
  id: string
  slug: string | null
  title: string
  summary: string | null
  description: string | null
  body: string | null
  subcategory: { name: string } | null
  tags: { slug: string; label: string }[]
}

export function FrequencyPractice({ practice, image }: { practice: PracticeDetail; image: string | null | undefined }) {
  const path = `/discover/practices/${practice.slug ?? practice.id}`
  const lede = practice.summary ?? practice.description
  return (
    <DirPage side="p">
      <DirHero
        crumbs={[
          { label: 'Discover', href: '/discover' },
          { label: 'Practices', href: '/discover/practices' },
          { label: practice.title },
        ]}
        image={image || photo('day-park-yoga.jpg')}
        title={practice.title}
        lede={lede ?? undefined}
        facts={practice.subcategory ? <Fact icon="practice">{practice.subcategory.name}</Fact> : undefined}
      />
      <DetailBody
        main={
          <>
            <section>
              <h2>How it goes</h2>
              <p className="dd-prose">
                {practice.body ??
                  'Start small, on a rhythm you can keep. It gets easier, and it sticks, when a few people near you are doing it too.'}
              </p>
            </section>
            {practice.tags.length > 0 && (
              <section>
                <h2>Good for</h2>
                <div className="feats">
                  {practice.tags.map((t) => (
                    <i key={t.slug}>{t.label}</i>
                  ))}
                </div>
              </section>
            )}
          </>
        }
        side={
          <ActionPanel title="Start this practice">
            <p>
              Join {SITE_NAME} to adopt {practice.title}, log it with people near you, and earn Zaps for showing up. Free
              to join.
            </p>
            <Link className="btn fq-iri-btn" href="/sign-in">
              Get started
            </Link>
            <ShareButton
              path={path}
              title={`${practice.title} · ${SITE_NAME}`}
              text={practice.summary ?? practice.description ?? `A practice on ${SITE_NAME}.`}
              label="Share"
            />
          </ActionPanel>
        }
      />
      <KeepGoing
        title="Practices are better with people."
        body="Find a Circle near you doing this on a standing rhythm."
        {...CLOSER}
      />
    </DirPage>
  )
}
