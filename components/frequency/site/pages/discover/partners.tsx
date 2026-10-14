// /discover/partners and /discover/partners/[slug] under the Frequency design: the local shops,
// studios and makers in the community, and one partner's page with its member offers. The pages keep
// their reads, metadata and LocalBusiness JSON-LD; these bodies draw them in the site kit, on the
// Spaces side (sun), since a partner is a business.

import Link from 'next/link'
import { BETA_CTA_HREF, SITE_NAME } from '@/lib/site'
import { FqIcon } from '@/components/frequency/icon'
import { ShareButton } from '@/components/discover/share-button'
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

export interface PartnerRow {
  id: string
  slug: string
  name: string
  category: string | null
  city: string | null
  description: string | null
}

export interface PartnerDetail extends PartnerRow {
  address: string | null
  website: string | null
  offers: { id: string; title: string; description: string | null }[]
}

/** "cafe" → "Cafe": the category is stored lower-case, and DAWN capitalised it in CSS. */
function cap(s: string | null): string | null {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : null
}

export function FrequencyPartners({
  title,
  description,
  partners,
  image,
}: {
  title: string
  description: string
  partners: PartnerRow[]
  image: string | null
}) {
  return (
    <DirPage side="e">
      <DirHero
        crumbs={[{ label: 'Discover', href: '/discover' }, { label: 'Partners' }]}
        image={image || photo('gathering-05.jpg')}
        title={title}
        lede={description}
      />
      <DirSection
        label="Near you"
        meta={partners.length > 0 ? count(partners.length, 'partner', 'partners') : null}
        title="Walk in. Say you’re a member."
      >
        {partners.length === 0 ? (
          <DirEmpty
            title="No partners near you yet."
            body="The first ones are still signing on, so check back soon. Run a shop or a studio? Open a Space and you’re in the network."
          >
            <Link className="btn fq-iri-btn" href="/spaces">
              Open your Space
            </Link>
          </DirEmpty>
        ) : (
          <DirGrid label="Partners">
            {partners.map((p) => (
              <DirCard
                key={p.id}
                href={`/discover/partners/${p.slug}`}
                icon="tag"
                kicker={cap(p.category)}
                title={p.name}
                body={p.description}
                meta={[p.city]}
              />
            ))}
          </DirGrid>
        )}
      </DirSection>
      <KeepGoing
        title="Show up in person."
        body="These are real local shops, studios and makers in the community. Join free to find one near you and walk in."
        primary={{ href: BETA_CTA_HREF, label: 'Find your people' }}
        secondary={{ href: '/discover/spaces', label: 'Browse Spaces' }}
      />
    </DirPage>
  )
}

export function FrequencyPartner({ partner, image }: { partner: PartnerDetail; image: string | null | undefined }) {
  const where = partner.address ?? partner.city
  return (
    <DirPage side="e">
      <DirHero
        crumbs={[
          { label: 'Discover', href: '/discover' },
          { label: 'Partners', href: '/discover/partners' },
          { label: partner.name },
        ]}
        image={image || photo('gathering-05.jpg')}
        title={partner.name}
        facts={
          <>
            {partner.category && <Fact icon="tag">{cap(partner.category)}</Fact>}
            {where && <Fact icon="pin">{where}</Fact>}
            {partner.website && (
              <Fact icon="globe">
                <a href={partner.website} target="_blank" rel="noopener noreferrer nofollow">
                  Website
                </a>
              </Fact>
            )}
          </>
        }
      />
      <DetailBody
        main={
          <>
            {partner.description && (
              <section>
                <h2>About</h2>
                <p className="dd-prose">{partner.description}</p>
              </section>
            )}
            <section>
              <h2>Member offers</h2>
              {partner.offers.length === 0 ? (
                <p className="dd-prose">No member offers right now. Drop in and say hi anyway.</p>
              ) : (
                <div className="tools dd-offers">
                  {partner.offers.map((o) => (
                    <div className="tool" key={o.id}>
                      <span className="fq-icon-tile">
                        <FqIcon name="ticket" />
                      </span>
                      <span>{o.title}</span>
                      {o.description && <p>{o.description}</p>}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        }
        side={
          <ActionPanel title="Join Frequency to claim offers">
            <p>
              Become a member to claim {partner.name}’s offers in person and earn Zaps for showing up. Free to join.
            </p>
            <Link className="btn fq-iri-btn" href="/sign-in">
              Get started
            </Link>
            <ShareButton
              path={`/discover/partners/${partner.slug}`}
              title={`${partner.name} · ${SITE_NAME}`}
              text={partner.description ?? `A community partner on ${SITE_NAME}.`}
              label="Share"
            />
          </ActionPanel>
        }
      />
    </DirPage>
  )
}
