# Frequency brief 03 — Strategy & business (for Claude Design)

> Part of the project-orientation set for Claude Design. Sources: `docs/PRICING.md`
> (its top banners are the live ladder: ADR-1060, ADR-1067, ADR-1084) and
> `lib/billing/pricing-keys.ts`, `docs/BUSINESS-MODEL-PLAN.md` (ADR-552),
> `docs/PLATFORM-VISION.md`, `docs/EXPANSION-FRAMEWORK.md`, owner strategy notes.
> Numbers here are the current canon; older docs carry superseded ladders.

---

## 1. The business model (the current ladder)

| Offer | Price | What it is |
|---|---|---|
| Member | Free forever | The full app: Circles, Journeys, the Quest, Mindless. Rewards accrue for everyone |
| Crew | Contribute what you want: floor $4.99/mo, $24.99 suggested | The paid personal tier: unlocks spending the Vault balance + public rank endorsement. Every amount buys identical access |
| Free Space | Free forever | A real Space that sells, takes payments, and holds a contact list from day one |
| Business | $29/mo, $290/yr | Run your practice: full CRM, email automation, reporting, branded site + custom domain, QR Studio, bookings, tickets, enrollment, check-in, donations, memberships, analytics |
| Collective | $79/mo, $790/yr | Everything in Business plus automations, team roles, multiple pipelines, hosted collaborators, and automatic revenue splits |
| Non Profit | $39/mo flat, $390/yr | The full Collective toolkit for a verified 501(c)(3), donations built in; "never per seat" is an explicit promise |
| Independent | $249/mo, $2,490/yr | Standalone and off the network: white label, your own brand and domain, standard SaaS pricing |
| Vera AI | +$20/mo, $200/yr add-on | Optional on any paid plan; turns community signals into live matches + next-best actions |
| Network rate | Free Member 10% · Crew 8% · free Space 10% · Business 5% · Collective 3% · Non Profit 0% · Independent 0% | Charged only on a sale the network introduced. Your own audience is 0% on every tier, forever, and a tip is always 0% |

- **Annual = two months free** on all plans, framed as "back the build." A year is
  always ten times the monthly rate.
- **One price per plan, no anchor.** The Opening Beta window closed on 2026-08-17
  (ADR-1060). Nothing shows a struck-through list price, a "beta rate" caption, or a
  countdown to a rise. The year is the only discount.
- **Five persona doors** market the same system: coaches-and-healers, studios,
  event-hosts, community-builders, nonprofits, on chrome-free funnel pages at
  `/for/coaches`, `/studios`, `/hosts`, `/communities`, `/nonprofits`. Every dollar
  figure on those pages interpolates from the one code catalog, so a door can never
  quote a price the checkout does not charge. One CTA label everywhere: **Start free**.
- **The paywall is caps + take-rate, never feature locks.** "A Space never shows a
  lock." Free Spaces get everything, capped (1 page, 250 contacts, 15
  bookings/mo, 300 emails/mo, etc.).
- Supporter was retired as a tier. It is now a mark on Crew, earned at or above the
  suggested contribution, and it never buys capability.

## 2. Payments posture (design implication: money is dark)

- **Transactions are live** (ticketing + seller payouts via Stripe Connect, the
  take-rate as application fee). **Recurring billing is live too** (`billing_live`
  on since 2026-07-25), so a plan CTA charges. The FEATURE gates are the separate
  switch and stay in their grace window until 2026-09-01.
- The whole monetization machine shipped dark: flipping it on is an operator act,
  not a deploy.
- **Design law that follows:** no marketing or product visual ends on a $ / paid /
  sale moment. Business stories land on **Captured, Booked, Return** — never
  revenue. "Secure checkout" as a capability may be shown; a live transaction may
  not.

## 3. The growth model: the lone wolf, not the city

The growth unit is the individual, agreed July 2026:

1. **Real single-player mode** — solo Practices, Journeys, the Quest, the global
   community deliver value at N=1 anywhere on Earth. No ghost-town risk, so going
   wide is good.
2. **Lone-wolf → local-host graduation:** arrive alone → practice → level up
   (Ghost → Initiate → Adept → Master) → get called to gather → host a Circle or
   event → become a local nucleus.
3. **Seed wide, fuel density:** seed lone wolves everywhere (~100K social
   following + worldwide ads), watch where density self-forms, then pour fuel
   (concierge business builds, local ads, city captains) on metros that heat up.

North-star metrics: solo activation (first Practice within 7 days), graduation
rate (% of solo members who go on to host), self-formed nuclei, and WAM.

**The two-entity flywheel:** the nonprofit Foundation creates demand (free
membership, programs, Circles); the for-profit Labs serves and captures it
(physical third spaces, subscriptions, marketplace). Online community forms →
people meet in person → density grows → density seeds a Lab → subscriptions fund
more practice → next town. The density heatmap is the expansion decision-engine
and doubles as grant-funder evidence. Labs scale flagship → franchise.

## 4. Business accounts (the operator story)

- A business account IS a Space: a public, claimable, SEO/AI-ranking profile that
  borrows root-domain authority from day one. The AIO pitch: **"Alone, an AI
  engine can't find you. As part of a structured, authoritative network, you're
  citable."**
- **Fee-buydown is the upgrade engine:** a free Space pays 10% on network
  introductions, Business pays 5% and costs $29. The in-product nudge is "You'd have
  saved $X this month on Business." Break-even is $580/mo of network-sourced sales
  (round to "$600" in copy).
- **Concierge importer strategy:** the owner builds business profiles daily
  (events pre-listed) and invites the businesses to claim them. The first businesses
  in a city are worked by hand and carry a charter badge. No discounted rate is
  advertised: everyone sees the one published ladder.

## 5. Strategic position

| Cluster | Names | Their gap |
|---|---|---|
| Horizontal all-in-one | GoHighLevel | Agency-sold, funnel-led, intimidating for solo operators |
| Community platforms | Skool, Circle, Mighty Networks | No real CRM, no public ranking business profile |
| Service CRMs | HoneyBook, Dubsado | No memberships, community, or public profile |
| Fee-stack villains | Mindbody (~23.5% effective), Nas.io (7.9%) | The resented fee stacking the flat 3% counters |

**The claim: Frequency owns the empty quadrant** — the only product combining a
public, claimable, SEO/AIO-ranking profile with full CRM + email + memberships for
non-technical operators. "Your profile is free marketing that ranks; everything
else is the business you run on top." Built for the people inside the offering
(practitioners who show up), not community operators marketing at audiences.

Consumer-side positioning: Calm's warmth + Duolingo's play, minus the guilt, plus
physical reality neither has (brief 02 §5).

## 6. Key dates

| When | What |
|---|---|
| 2026-07-25 | Billing went live. A plan CTA charges the ladder in §1 |
| 2026-08-17 | The Opening Beta price closed (ADR-1060). One published price per plan, and the year is the only discount |
| Sept 1, 2026 | **Graduation:** the feature-gate grace window ends and the meters start to bite |
| Pre-graduation build order | Graduation prompts → invite-gate waves → metered clock → referral/Circle-starter scoring (Zaps + leaderboard) → Business concierge cohort |
| Held phases | Real money verticals (The Collective first), white-label micro-sites, native mobile apps |

Design-relevant: campaign assets for the graduation arc (charter-member framing,
"here while it's still wet paint," charter badges) are the next marketing wave.
That framing is about who arrived early, never about a price: no asset may show a
discounted, struck, or expiring rate.
The free-membership referral prize was retired with the beta program (owner ruling,
2026-08-12), so no asset may offer it: referrals pay Zaps and a leaderboard place.
