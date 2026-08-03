# Frequency brief 03 — Strategy & business (for Claude Design)

> Part of the project-orientation set for Claude Design. Sources: `docs/PRICING.md`
> (ADR-590 flat pricing), `docs/BUSINESS-MODEL-PLAN.md` (ADR-552),
> `docs/PLATFORM-VISION.md`, `docs/EXPANSION-FRAMEWORK.md`, owner strategy notes.
> Numbers here are the current canon; older docs carry superseded ladders.

---

## 1. The business model (current, flat pricing)

| Offer | Price | What it is |
|---|---|---|
| Member | Free forever | The full app: Circles, Journeys, the Quest, Mindless. Rewards accrue for everyone |
| Crew | $9/mo founding (list $12) | The paid personal tier: unlocks spending the Vault balance + public rank endorsement. "Everyone plays, only payers cash in" |
| Business | $49/mo | A Space with full depth: branded site + custom domain, QR Studio, bookings, tickets, enrollment, check-in, donations, memberships, full CRM, email automation, team roles, analytics |
| Non Profit | $29/mo flat | Everything in Business plus donations built in; verified 501(c)(3) only; "never per seat" is an explicit promise |
| Resonance Engine | +$20/mo add-on | Optional on any paid plan; turns community signals into live matches + next-best actions |
| Transaction fee | Flat 3% + card processing | On every channel. Free Spaces pay ~5% — the deliberate incentive to subscribe |

- **Annual = two months free** on all plans, framed as "back the build."
- **Founding-price mechanics:** every price ships as a list anchor with a lower
  founding price, grandfathered for the life of the subscription.
- **Five persona doors** market the same system: coaches-and-healers $69
  (Business + Resonance) · studios $49 · event-hosts $49 · community-builders $69 ·
  nonprofits $29 — chrome-free funnel pages at `/for/coaches`, `/studios`,
  `/hosts`, `/communities`, `/nonprofits`. One CTA label everywhere: **Start free**.
- **The paywall is caps + take-rate, never feature locks.** "A Space never shows a
  lock." Free Business Spaces get everything, capped (1 page, 250 contacts, 15
  bookings/mo, 300 emails/mo, etc.).
- Supporter was retired as a tier; it's now a pay-what-you-want badge on Crew.

## 2. Payments posture (design implication: money is dark)

- **Transactions are live** (ticketing + seller payouts via Stripe Connect, the
  take-rate as application fee). **Recurring billing is OFF** — memberships are
  free during beta; every billing CTA is a disabled preview.
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
- **Fee-buydown is the upgrade engine:** free ~5% vs Business 3% + $49 — the
  in-product nudge is "You'd have saved $X this month on Business." Break-even
  ~$2,450/mo in sales (round to "$2,500" in copy).
- **Concierge importer strategy:** the owner builds business profiles daily
  (events pre-listed) and invites the businesses to claim them. Founding Business
  cohort: capped ~25 per city at ~$39/mo locked (vs $49 list), charged at
  graduation, with a charter badge.

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
| Now (free beta) | "Summer of Frequency" — everyone gets Crew free, all billing CTAs preview-only |
| Sept 1, 2026 | **Graduation:** billing turns on, founding pricing ends. Beta runs to this date |
| Pre-graduation build order | Graduation prompts → invite-gate waves → metered clock → referral/Circle-starter prizes (1yr / 6mo / 3mo free paid membership) → Founding Business concierge |
| Held phases | Real money verticals (The Collective first), white-label micro-sites, native mobile apps |

Design-relevant: campaign assets for the graduation arc (founding member framing,
"here while it's still wet paint," charter badges, referral prizes) are the next
marketing wave.
