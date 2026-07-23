# Frequency is a Community Collective (strategy, source of truth)

> **Status:** ✅ Approved direction (2026-07-23), owner-locked. This is the **canonical source of
> truth** for the repositioning, the pricing model, and the site-wide rebuild. Decision record:
> [ADR-811](DECISIONS.md). Full implementation plan: [COMMUNITY-COLLECTIVE-BUILD-PLAN.md](COMMUNITY-COLLECTIVE-BUILD-PLAN.md).
> Supersedes the flat single-Business pricing of ADR-552 / ADR-590 (grandfathered, see §9). **Everything
> ships behind `billing_live` OFF** until one deliberate go-live flip.

## 1. The one-sentence version

Frequency is not another wellness-business tool. It is **the Community Collective**: a collaboration-first
network where independent creators, healers, coaches, and small businesses grow **together**, and eventually
build real-world spaces together. We exist to support every community effort and to help everyone in it
succeed. We make our money from that shared success, never by taxing anyone's core work.

## 2. The strategic reframe

The market is **two silos that never touch**: cold booking/ops tools that cannot do community (Mindbody,
Momence, Vagaro), and warm community/content tools that cannot book a class or run a business (Circle,
Mighty Networks, Skool). **No one owns the intersection**, and no one serves the **solo-to-collective
continuum**: a lone healer who wants to eventually band together with peers into a shared center *without
re-platforming*. That continuum is our thesis, our differentiator, and our path to physical spaces.

Positioning line: **"Frequency is a Community Collective. We exist to support every community effort, and
to help everyone in it succeed, together."**

## 3. The pricing spine: in the collective vs standalone

One idea governs everything:

| World | Who | Pricing | Mechanism |
|---|---|---|---|
| **In the Collective** (`network_connected = true`) | Belongs, feeds and draws from the network | **Highly affordable** ($0 to $79) | We earn a small, shrinking slice of the business the network **brings** them, never their own work |
| **Standalone** (`network_connected = false`) | Wants the software as a private, decoupled tool | **Standard SaaS** (~$249+) | Full market rate; no network lift, no discovery, no referrals in |

This rides the existing `spaces.network_connected` boolean (today dormant: written `true`, driving nothing),
which is a semantically perfect, greenfield switch for exactly this. Belonging becomes the cheap, warm
default; leaving becomes a deliberate, expensive choice. That is the healthiest retention logic there is.

## 4. The tiers

Take-rate shown is **network-sourced only**; a member's own bookings are **always 0%** (a hard promise).

| Tier | Price | Who / the job | Network take-rate |
|---|---|---|---|
| **Member** | $0 | Belong, be found, run a basic bookable page, take payments | ~10% |
| **Crew** | $9/mo | The individual creator: the full game + author circles, journeys, programs | ~8% |
| **Business** | **$29/mo flat, all-in** | Run your whole practice. One honest price, no add-on menu | ~5% |
| **Collective** ⭐ | **$79/mo (beta $49)** | The collaboration engine: host collaborators, shared venue + events, shared pricing, revenue splits | ~3% |
| **Non Profit** | **$39/mo flat, verified** | Full Collective toolkit, verified 501(c)(3), 3 seats included | ~0% |
| **Independent** | **~$249/mo** | White-label, `network_connected=false`. Standard SaaS. The anchor | n/a (left the network) |

- **Add-ons (flat, never a %):** operator seat **+$12/mo** · Resonance Engine (AI) **+$20/mo** · Founding
  Steward patronage (opt-in, price-locked, capped) that backs the physical build.
- **Beta:** Collective ships at a **$49 founding price** under a $79 list anchor, locked for the life of the
  subscription.
- **The buy-down:** every paid tier lowers the network take-rate, so a subscription reads as savings and
  power, never rent. Launch the rate low (8 to 10%) and earn the right to raise it as network-sourced
  revenue grows (the Etsy / Airbnb playbook).

## 5. The money principle (why it is aligned, not extractive)

> **We never take a cut of the work you bring yourself. We take a small, shrinking cut of the success we
> bring you, and we invite you (never require you) to help build what's next.**

- **Own bookings, clients, classes: 0% platform fee, always, flat subscriptions only.** In this vertical a
  take-rate on a cash-poor solo's thin margins is the single most-resented cost; the tools people love
  (Punchpass, OfferingTree) win by taking 0%. Research: solo healers are genuinely cash-poor (41% of yoga
  pros earn under $10K/yr from their practice).
- **Network-generated business: a modest, un-resented take-rate.** Cross-referrals, discovery, marketplace,
  collective sales, money the network *found* for them. Gumroad proves people happily pay ~30% on a customer
  they would never have found alone; Substack's network drives 40%+ of its subscriptions. This is the
  aligned engine, and it exists only because of collaboration.

**Three revenue engines, target mix ~50-60% recurring / ~25-35% network take / ~10-15% mission + white-label.**

## 6. The four brand promises (marketing weapons)

The whole vertical is scarred by add-on creep, lock-in, and take-rate gouging. We make the opposites explicit,
provable promises:

1. **We never take a cut of your bookings.**
2. **One honest price, no surprise invoices.**
3. **Month to month. Take your data and leave anytime.**
4. **See exactly what the network earned you** (a live "network sourced you $X" readout, our honest receipt).

## 7. The mission and the buildings

Collaboration and shared success are the message, loud and clear in the marketing, always as **invitation,
never guilt** (the behavioral research is firm that guilt suppresses participation). Physical spaces (healing
centers, Labs) are funded neither from thin platform margin nor by assuming they throw off surplus (Soho
House is 30 years old, worth $2.7B, and still unprofitable). Instead:

- A **separate, community-owned vehicle** (a co-op / community-shares / Reg CF raise) where members become
  literal **co-owners** of the building. Proven playbook: >95% of UK community-share offers hit target; one US
  community center raised $1.3M from 500 members.
- The **digital company stays conventional and fast**; member-ownership goes where it is emotionally
  load-bearing (the spaces). Optionally a Stocksy-style dividend for practitioners.
- Patronage converts a ~1-10% minority; model on ~10% and push **recurring "sustaining"** framing (public
  radio's biggest lesson). One clean **Founding Steward** tier, price-locked, capped, tied to "backing the build."

## 8. Positioning psychology

- **No cliffs:** $9 to $29 to $79 are 3.2x and 2.7x steps; each upgrade is an easy yes.
- **A high $249 anchor** makes Collective the obvious serious-operator choice, and it is loss-framed (leaving
  costs more because you forfeit network reach).
- **$29 is the "most popular" volume tier;** a genuinely complete free tier is the reciprocity hook.
- **Never gate core value or community size.** Cap depth, scale, seats, and collaboration; never contacts or
  members (that taxes the growth a community mission wants to maximize).

## 9. Naming, canon, and grandfathering

- **"Collective" is canonical** as both the **brand essence** ("Frequency, a Community Collective") and the
  **$79 tier** (your own collective within the Collective, a collective of collectives). See
  [NAMING.md](NAMING.md).
- **Quest usage is untouched:** the Quest's "collective standing" / `collective-goal` belongs to the game we
  are all on and stays. The stray marketing "The Collective" paid-content label (MARKETING-BRIEF §6) is
  renamed in the marketing phase to free the word.
- **Grandfather:** existing `business` / `nonprofit` spaces keep resolving; the flat-$49 Business model is
  marked historical. No live account changes until go-live.

## 10. Research basis

Grounded in four industry-research streams (creator/community platform pricing, the wellness-practitioner
software vertical, value-based / network monetization, and mission-funded + real-world expansion). Key
proof points: Nas.io's "pay to buy down your rate" hybrid; Substack owning discovery to justify a 10% take
with zero feature gates; the wellness vertical's hatred of take-rate on core bookings; Gumroad's higher take
on network-sourced sales; community-shares funding physical venues. Full synthesis lives in
[COMMUNITY-COLLECTIVE-BUILD-PLAN.md](COMMUNITY-COLLECTIVE-BUILD-PLAN.md) §Appendix.

## References

[ADR-811](DECISIONS.md) · [COMMUNITY-COLLECTIVE-BUILD-PLAN.md](COMMUNITY-COLLECTIVE-BUILD-PLAN.md) ·
[NAMING.md](NAMING.md) · [CONTENT-VOICE.md](CONTENT-VOICE.md) · [PRICING.md](PRICING.md) ·
[COLLABORATION-AND-UPGRADE-FUNNEL.md](COLLABORATION-AND-UPGRADE-FUNNEL.md) · [SPACES.md](SPACES.md)
