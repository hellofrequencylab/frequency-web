// /discover/journeys and /discover/journeys/[slug] under the Frequency design. The detail anatomy is
// members/Journey.html's (the head, the phases as lesson lists, a side column holding the one action),
// drawn in the public site kit rather than the members kit, because this is the signed-out canonical
// page and the member body (components/frequency/members/journey) is bound to the members kit root and
// to the member's own progress.
//
// THE PRICE RULE (ADR-1400) holds here exactly as on the DAWN page: the page reads the offer and hands
// this body `priceLabel`. A priced Journey names its price and buys through the existing guest door
// (JourneyGuestBuy, hosted checkout, docs/CHECKOUT.md) with the member sign-in door beside it; a free
// one reads "Create a free account". There is no seat count anywhere on this cached surface.

import type { ReactNode } from 'react'
import Link from 'next/link'
import type { JourneyPlan, PlanAuthor } from '@/lib/journey-plans'
import type { JourneyFaqItem } from '@/lib/journeys/faq'
import type { JourneyFacts } from '@/components/journey/discovery-widgets'
import { cadenceLabel, formatMinutes, phaseOpenLabel } from '@/components/journey/discovery-widgets'
import { JourneyGuestBuy } from '@/components/journey/journey-guest-buy'
import { ShareButton } from '@/components/discover/share-button'
import { journeyBuySignInPath } from '@/lib/journeys/sales-path'
import { BETA_CTA_HREF, BETA_CTA_LABEL, SITE_NAME } from '@/lib/site'
import { KeepGoing } from '@/components/frequency/site/shell/keep-going'
import {
  ActionPanel,
  count,
  DetailBody,
  DirCard,
  DirEmpty,
  DirGrid,
  DirHero,
  DirPage,
  DirSection,
  Fact,
  photo,
} from './dir-parts'

export function FrequencyJourneys({ journeys }: { journeys: JourneyPlan[] }) {
  return (
    <DirPage side="p">
      <DirHero
        crumbs={[{ label: 'Discover', href: '/discover' }, { label: 'Journeys' }]}
        image={photo('day-park-yoga.jpg')}
        title={
          <>
            Pick a Journey. <em className="fq-iri-text">Keep it for a season.</em>
          </>
        }
        lede="Want a place to start your practice? A Journey is part of The Quest: an ordered set of Practices. Read the steps and time involved, then try it solo or with your Circle."
      >
        <Link className="btn fq-iri-btn" href={BETA_CTA_HREF}>
          {BETA_CTA_LABEL}
        </Link>
        <Link className="btn btn-ghost fq-iri-rim" href="/discover/practices">
          Browse Practices
        </Link>
      </DirHero>

      <DirSection
        label="The library"
        meta={journeys.length > 0 ? count(journeys.length, 'Journey', 'Journeys') : null}
        title="What you can practice."
        lede="Each Journey puts Practices in order. Read the steps and time involved before you start."
      >
        {journeys.length === 0 ? (
          <DirEmpty
            title="The first Journeys are being mapped."
            body="The library is quiet for now. Join free and you can build the first ones: a handful of small Practices, in order, with steps people can read before they begin."
          >
            <Link className="btn fq-iri-btn" href={BETA_CTA_HREF}>
              {BETA_CTA_LABEL}
            </Link>
          </DirEmpty>
        ) : (
          <DirGrid label="Journeys">
            {journeys.map((j) => (
              <DirCard
                key={j.id}
                href={`/discover/journeys/${j.slug}`}
                icon="program"
                image={j.cover_image}
                tags={[j.official && 'Official']}
                title={j.title}
                body={j.summary}
                meta={[j.adopt_count > 0 && `${j.adopt_count} on this Journey`]}
              />
            ))}
          </DirGrid>
        )}
      </DirSection>

      {journeys.length > 0 && (
        <DirSection label="Why a Journey" title="Small practices, kept up, with company.">
          <div className="blocks">
            <div className="block">
              <h3>See the next step.</h3>
              <p>
                A Journey puts Practices in an order you can follow. Look at the next step and choose a time that fits your day.
              </p>
            </div>
            <div className="block">
              <h3>Try it with your Circle.</h3>
              <p>Choose a Journey with your Circle and make time to talk about what you tried. You can each take part at your own pace.</p>
            </div>
          </div>
        </DirSection>
      )}

      <KeepGoing
        title="Start your first Journey."
        body="Joining is free. Read a Journey’s steps and choose whether to try it solo or with your Circle."
        primary={{ href: BETA_CTA_HREF, label: BETA_CTA_LABEL }}
        secondary={{ href: '/discover', label: 'Back to Discover' }}
      />
    </DirPage>
  )
}

export interface JourneySale {
  productId: string
  priceLabel: string
  soldOut: boolean
}

export function FrequencyJourney({
  plan,
  facts,
  pillarName,
  author,
  sale,
  image,
  outcomes,
  guarantee,
  faqs,
  reviews,
}: {
  plan: JourneyPlan
  facts: JourneyFacts
  pillarName: string | null
  author: PlanAuthor | null
  /** The offer, priced. Null = a free Journey. */
  sale: JourneySale | null
  image: string | null | undefined
  outcomes: string[]
  guarantee: string
  faqs: JourneyFaqItem[]
  /** The product reviews block, already built by the page (null when nothing sells it). */
  reviews: ReactNode
}) {
  const time = formatMinutes(facts.totalMinutes)
  const buyHref = journeyBuySignInPath(plan.slug)
  return (
    <DirPage side="p">
      <DirHero
        crumbs={[
          { label: 'Discover', href: '/discover' },
          { label: 'Journeys', href: '/discover/journeys' },
          { label: plan.title },
        ]}
        image={image || photo('day-park-yoga.jpg')}
        title={plan.title}
        lede={plan.summary ?? undefined}
        facts={
          <>
            {plan.official && <Fact icon="award">Official</Fact>}
            {pillarName && <Fact icon="compass">{pillarName}</Fact>}
            {facts.phaseCount > 0 && <Fact icon="program">{count(facts.phaseCount, 'phase', 'phases')}</Fact>}
            {facts.lessonCount > 0 && <Fact icon="lesson">{count(facts.lessonCount, 'lesson', 'lessons')}</Fact>}
            {time && <Fact icon="clock">{time}</Fact>}
            {facts.phaseCount > 1 && <Fact icon="event">{cadenceLabel(plan.drip_interval_days)}</Fact>}
            {plan.adopt_count > 0 && <Fact icon="user">{plan.adopt_count} on this Journey</Fact>}
            {author && (
              <Fact icon="host">
                By <Link href={`/people/${author.handle}`}>{author.displayName}</Link>
              </Fact>
            )}
          </>
        }
      />

      <DetailBody
        main={
          <>
            {plan.intro && (
              <section>
                <h2>The story</h2>
                <p className="dd-prose">{plan.intro}</p>
              </section>
            )}

            {outcomes.length > 0 && (
              <section>
                <h2>What you’ll learn</h2>
                <ul className="dd-list">
                  {outcomes.map((line, i) => (
                    <li key={`${i}:${line}`}>{line}</li>
                  ))}
                </ul>
              </section>
            )}

            <section>
              <h2>The path</h2>
              {facts.lessonCount === 0 ? (
                <p className="dd-prose">This Journey hasn’t mapped its phases yet.</p>
              ) : (
                <div className="qa dd-qa">
                  {facts.phases.map((p, i) => {
                    const n = facts.lessonsPerPhase.get(p.id) ?? 0
                    const pt = formatMinutes(facts.phaseMinutes.get(p.id) ?? null)
                    const opens =
                      i === 0 ? 'Opens at start' : `Opens ${phaseOpenLabel(i, plan.drip_interval_days).toLowerCase()}`
                    return (
                      <details key={p.id} open={i === 0}>
                        <summary>
                          <span>
                            {i + 1}. {p.title || `Phase ${i + 1}`}
                            <small>{[count(n, 'lesson', 'lessons'), pt, opens].filter(Boolean).join(' · ')}</small>
                          </span>
                        </summary>
                        <ul className="dd-list">
                          {p.modules
                            .flatMap((m) => m.lessons)
                            .map((l) => (
                              <li key={l.id}>
                                <span>{l.title}</span>
                                {l.estMinutes ? <small>{l.estMinutes} min</small> : null}
                              </li>
                            ))}
                        </ul>
                      </details>
                    )
                  })}
                </div>
              )}
            </section>

            {author && (
              <section>
                <h2>Your guide</h2>
                <Link className="dd-guide panel" href={`/people/${author.handle}`}>
                  <span>
                    <b>{author.displayName}</b>
                    <small>Built this Journey. See their profile.</small>
                  </span>
                </Link>
              </section>
            )}

            {reviews}

            <section>
              <h2>Questions</h2>
              <div className="qa">
                {faqs.map((f) => (
                  <details key={f.q}>
                    <summary>{f.q}</summary>
                    <p>{f.a}</p>
                  </details>
                ))}
              </div>
            </section>

            {guarantee && (
              <section>
                <h2>Your guarantee</h2>
                <p className="dd-prose">{guarantee}</p>
              </section>
            )}
          </>
        }
        side={
          <ActionPanel title={sale ? `Join ${plan.title}` : 'Start this Journey'}>
            {sale ? (
              <>
                <span className="dd-price">{sale.priceLabel}</span>
                {sale.soldOut ? (
                  <>
                    <span className="btn btn-ghost" aria-disabled="true">
                      Full
                    </span>
                    <p className="dd-fine">Every seat is taken for this run.</p>
                  </>
                ) : (
                  <JourneyGuestBuy productId={sale.productId} priceLabel={sale.priceLabel} signInHref={buyHref} />
                )}
              </>
            ) : (
              <>
                <p>Read the phases and access details before you start. Try the steps solo, or choose the Journey with your Circle.</p>
                <Link className="btn fq-iri-btn" href="/sign-in">
                  Create a free account
                </Link>
                <p className="dd-fine">Free to start. Run it with your Circle or solo.</p>
              </>
            )}
            <ShareButton
              path={`/discover/journeys/${plan.slug}`}
              title={`${plan.title} · ${SITE_NAME}`}
              text={plan.summary ?? `A guided Journey on ${SITE_NAME}.`}
              label="Share"
            />
          </ActionPanel>
        }
      />

      {sale ? (
        sale.soldOut ? (
          <KeepGoing
            title={`Join ${plan.title}`}
            body="Every seat is taken for this run. Browse other Journeys or check this page later."
            primary={{ href: '/discover/journeys', label: 'More Journeys' }}
          />
        ) : (
          <KeepGoing
            title={`Join ${plan.title}`}
            body="Read the access details and price before enrolling. You can try the steps solo or choose the Journey with your Circle."
            primary={{ href: buyHref, label: `Get access · ${sale.priceLabel}` }}
            secondary={{ href: '/discover/journeys', label: 'More Journeys' }}
          />
        )
      ) : (
        <KeepGoing
          title="Start this Journey."
          body="Sign up free to start it. Read the phases and access details before you start. Try the steps solo, or choose the Journey with your Circle."
          primary={{ href: '/sign-in', label: 'Create a free account' }}
          secondary={{ href: '/discover/journeys', label: 'More Journeys' }}
        />
      )}
    </DirPage>
  )
}
