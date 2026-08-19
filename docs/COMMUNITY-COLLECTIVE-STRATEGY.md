# Frequency is a Community Collective (strategy, source of truth)

> **Status:** ✅ Approved direction (2026-07-23), owner-locked. This is the **canonical source of
> truth** for the repositioning, the pricing model, and the site-wide rebuild. Decision record:
> [ADR-811](DECISIONS.md). Full implementation plan: [COMMUNITY-COLLECTIVE-BUILD-PLAN.md](COMMUNITY-COLLECTIVE-BUILD-PLAN.md).
> Supersedes the flat single-Business pricing of ADR-552 / ADR-590 (grandfathered, see §9). **Everything
> ships behind `billing_live` OFF** until one deliberate go-live flip.
>
> 🔴 **THE PARAGRAPH BELOW WAS REVERSED THE SAME DAY IT WAS WRITTEN. Read
> [PRICING.md](PRICING.md)'s ADR-914 banner, not this file, for what anyone is charged.**
> [ADR-914](DECISIONS.md) (2026-07-30) states: *"A free Member **can** sell. Tickets, donations,
> payouts, on day one, with no upgrade. The previous rule (ADR-913: 'the free tier does not sell') is
> REVERSED."* And the rate is the full ladder on network-sourced sales: free Member **10%** · Crew
> **8%** · free Space **10%** · Business **5%** · Collective **3%** · Non Profit **0%** · Independent
> **0%**. So the three rungs the next paragraph calls retired and gone are the three rungs that are
> live, and the sell-wall it describes does not exist. The principle that replaced it is **"never gate
> the transaction, gate the repeat"**.
>
> The paragraph is kept, unedited, because §4 and §5 below are written on top of it and rewriting a
> doc's thesis is not a documentation task. What is fixed here is the claim to authority: this file
> says "canonical source of truth" in its own status line, and on the money model it is not.
>
> ⚠️ Also stale in the status line above: **`billing_live` is ON in production** (measured
> 2026-08-19). The go-live flip has happened, so "everything ships behind `billing_live` OFF" no
> longer describes anything.

> **Money model amended 2026-07-30 ([ADR-913](DECISIONS.md)):** tips carry **no** platform fee on any tier,
> the free Member tier **does not sell** (events + RSVPs only), and the network take-rate is **Crew 8% ·
> Business and Collective 5% · Non Profit 0%**, with **0% whenever the buyer is already the seller's own
> audience**. §4 and §5 below carry the amended rates; the retired `member_free` 10%, Free Space 10%, and
> Collective 3% rungs are gone.

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

Take-rate shown is **network-sourced only**; a seller's **own audience is always 0%**, and a **tip is
always 0%** on every tier (hard promises, ADR-913).

| Tier | Price | Who / the job | Network take-rate |
|---|---|---|---|
| **Member** | $0 | Belong, be found, run a basic page, **create events and take RSVPs**. Does not sell: no tickets, no payments | n/a (cannot sell) |
| **Crew** | contribute-what-you-want (ADR-908, renamed ADR-1084) | The individual creator: the full game + author circles, journeys, programs, **and the right to charge** | **8%** |
| **Business** | **$29/mo flat, $290/yr, all-in** | Run your whole practice. One honest price, no add-on menu | **5%** |
| **Collective** ⭐ | **$79/mo, $790/yr** | The collaboration engine: host collaborators, shared venue + events, shared pricing, revenue splits | **5%** (sells on depth, not on a cheaper fee) |
| **Non Profit** | **$39/mo flat, $390/yr, verified** | Full Collective toolkit, verified 501(c)(3), 3 seats included | **0%** |
| **Independent** | **$249/mo, $2,490/yr** | White-label, `network_connected=false`. Standard SaaS. The anchor | n/a (left the network) |

**"Own audience" is a relationship, never a cookie.** The fee is 0% whenever the buyer follows the Space,
is an active Space member, is in its Space Contacts, is in the seller's own contact list, or has bought
from them before. **Frequency charges once for the introduction. After that they're your people, free.**

- **Add-ons (flat, never a %):** the **Vera AI** add-on **+$20/mo, $200/yr** (ADR-590 renamed it from
  "Resonance Engine", which now names only the matching SYSTEM under the hood, never the product) ·
  operator seats, owner-priced and not yet sold · Founding Steward patronage (opt-in, capped) that backs
  the physical build.
- **One price per tier, and the year is the only discount.** Annual is always ten times the monthly rate
  (two months free). The Opening Beta window CLOSED on 2026-08-17 ([ADR-1060](DECISIONS.md)): no tier
  carries a beta, founding or struck-through rate, and no surface may advertise one.
- **The buy-down:** paying lowers the network take-rate (Crew 8% → Business 5% → Non Profit 0%), so a
  subscription reads as savings and power, never rent. Launch the rate low (5 to 8%) and earn the right to
  raise it as network-sourced revenue grows (the Etsy / Airbnb playbook).

## 5. The money principle (why it is aligned, not extractive)

> **We never take a cut of the work you bring yourself. We take a small, shrinking cut of the success we
> bring you, and we invite you (never require you) to help build what's next.**

- **Tips: 0% platform fee, always, on every tier** (ADR-913). A tip is a gift between two people and we
  are not in it. There is no rung where a tip is taxed.
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

- **No cliffs:** free, then a Crew amount the member chooses, then $29 to $79 (a 2.7x step); each upgrade is an easy yes.
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
