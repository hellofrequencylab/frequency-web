# Frequency — Teaser Infographic Design Briefs (6 flows)

Detailed, production-ready specs for Claude Design. Companion to [funnels-brief.md](funnels-brief.md)
(which holds the copy rationale and sources). This file adds the visual system so all
six teasers render as one family. Flow 1 is already built as the reference.

Read the two voice rules first: **proper nouns carry the magic, sentences stay plain**,
and **never narrate the reader's feelings**. No em dashes. Sentence case. Numbers over
adjectives. Money is dark by default (no $ / paid / sale node anywhere).

---

## THE SHARED SYSTEM (applies to all six, do not vary)

**Canvas.** 680 × 440 landscape card, 18px corner radius. (Ask if you need square 1080×1080
or story 1080×1920 crops; the layout below reflows by stacking the node row.)

**Grid.** 40px left/right margin. Three zones top to bottom:
1. Header band (y 0–150): eyebrow, headline, wordmark.
2. Flow band (y 150–340): the node row, vertically centered ~y 250.
3. Footer band (y 340–440): a 1px divider at y378, then one stat line.

**Node system.** Four (or three) circular nodes, r = 32, evenly spaced across the full
width (centers at x = 100, 270, 440, 610 for four nodes). Each node = a filled circle +
1.5px stroke + a simple hand-drawn line-glyph in cream inside. Below each: a 14px/500 label
and an 11.5px muted subline. The final node is the "magic moment": it gets a soft glow ring
(r = 44, accent at 12% opacity) and a 2px accent stroke so it reads brighter than the rest.

**Arrows.** Thin (1.6px) connectors between node edges, warm neutral, single arrowhead
marker. The last arrow may warm toward the accent to build momentum. Always `fill="none"`.

**Base palette (shared, every flow).**
- Background `#1b1620` (deep warm night), card border `#3a2f34`.
- Primary text (headline, labels) `#f5ece0` (warm cream).
- Muted text (sublines, stat) `#c9b8a8`.
- Neutral arrow `#a5734f`.
- The node ramp dims-to-bright left to right so the eye travels toward the payoff.

**Per-flow accent (the ONE color that flow's magic moment glows in).** This is the only
thing that changes the palette between teasers, so the set stays sibling but each has an
identity:
- Flow 1 First Win → warm gold `#ffd25e`
- Flow 2 Focus Ritual → calm lotus teal `#7fd1c4`
- Flow 3 Never Miss Twice → ice blue `#8ab6e0`
- Flow 4 No Lead Left Behind → amber `#e0a24a`
- Flow 5 First Responder → signal coral `#ff8a6b`
- Flow 6 One-Timer to Regular → return green-gold `#c9d16b`

**Type scale.** Eyebrow 13px/500, letter-spacing 2.5, in the accent. Headline 25px/500 cream,
1–2 lines. Node label 14px/500. Subline 11.5px muted. Stat 12.5px muted. Wordmark
"Frequency" 14px/500 top-right in a dimmed accent. Two weights only (400/500). Never below
11px. Sentence case throughout.

**Icons.** Hand-drawn minimal line-glyphs, not stock icons, ~18px, cream stroke 1.6px,
round caps. One idea each (see per-flow). Keep them childlike-simple; this is a camp brand.

**Accessibility.** `role="img"` with `<title>` (the flow in one line) and `<desc>`
(one sentence describing the four steps).

---

## FLOW 1 — The First Win  ·  REFERENCE (built)
**Reader:** the Seeker. **Intent:** kill week-one churn with a fast, earned first reward.
**Accent:** gold `#ffd25e`. **Node ramp:** `#3a2b2f` → `#4a2f2a` → `#5a3a24` → gold-lit.

- **Eyebrow:** The first win
- **Headline (2 lines):** "Yes, it's meditation." / "We made it a game so you'd actually do it."
- **Nodes:**
  1. **Join a Circle** · "+ first Zaps" · glyph: a ring of 5 small dots (people in a circle).
  2. **Start a Journey** · "4-week arc" · glyph: a short winding path with a little flag.
  3. **First Practice** · "5 min before coffee" · glyph: a coffee mug with two steam wisps.
  4. **Day 3: Spark** · "you showed up" · glyph: an 8-ray spark + center dot, glowing gold.
- **Magic moment:** the Spark node ignites. It is the only gold thing on screen; everything
  builds to it.
- **Stat strip:** "Most wellness apps lose 85% of people in week one. The first win keeps them."
- **Art notes:** each node one step brighter than the last, campfire warmth, the eye lands on
  gold. Alt text: a new member joins a Circle, starts a Journey, does a first Practice, and
  lights the day-3 Spark.

---

## FLOW 2 — The Focus Ritual
**Reader:** the Seeker. **Intent:** a 5-minute timed sit that ends by pointing at tomorrow.
**Accent:** lotus teal `#7fd1c4`. **Node ramp:** `#232a2c` → `#26383a` → `#284a48` → teal-lit.

- **Eyebrow:** The focus ritual
- **Headline (1 line, hero):** "Get out of your head, and into your life."
- **Nodes:**
  1. **Open Mindless** · "one timer, two modes" · glyph: a simple lotus mark (three petals).
  2. **Tune out** · "just breath and a clock" · glyph: a soft breathing ring (concentric circle).
  3. **Log the Practice** · "your Airtime ticks up" · glyph: a small upward tick / rising bar.
  4. **A Dispatch from Vera** · "tomorrow's next step" · glyph: a folded note / small envelope,
     glowing teal.
- **Magic moment:** the Dispatch node. The sit doesn't just end, it hands you a note for
  tomorrow. Draw it like a card being set down, softly lit teal.
- **Stat strip:** "A timed session lifts focus about 25%. This one ends by pointing at tomorrow."
- **Art notes:** calmer and quieter than flow 1, more negative space, a slow pulsing ring
  motif. Lotus, softly pulsing. Alt text: a member opens Mindless, tunes out for a timed sit,
  logs the Practice, and receives a Dispatch from Vera for tomorrow.

---

## FLOW 3 — Never Miss Twice
**Reader:** the Seeker. **Intent:** the anti-Duolingo beat. A missed day is forgiven, not punished.
**Accent:** ice blue `#8ab6e0`. **Node ramp:** warm `#4a2f2a` (streak alive) → **muted grey**
`#2e2a30` on the "miss" node (deliberately drained of color) → warm again → ice-blue "freeze".

- **Eyebrow:** Never miss twice
- **Headline (1 line):** "One miss is nothing. Two is a pattern. We catch you at one."
- **Nodes:**
  1. **Log a Practice** · "streak running, Spark banked" · glyph: a small flame.
  2. **Miss a day** · "life happens" · glyph: the same flame, greyed and thin (nearly out).
     THIS node is intentionally desaturated, the only cold-grey node.
  3. **Vera nudges** · "a fact, not a guilt trip" · glyph: a small speech dot / chat bubble.
  4. **Freeze the streak** · "spend a few Gems" · glyph: a snowflake locking the flame, ice blue.
- **Magic moment:** the freeze. Show the greyed flame from node 2 being re-locked under a
  crisp ice-blue snowflake, streak preserved. The turn from grey back to alive is the story.
- **Stat strip:** "A single missed day barely dents a habit. Most apps punish it. This one protects it."
- **Art notes:** the emotional arc is warm → cold/muted → warm/protected. No shame iconography
  (no red, no frowns, no broken hearts). Alt text: a member logs a Practice, misses a day, gets
  a warm nudge from Vera, and freezes the streak so it survives.

---

## FLOW 4 — No Lead Left Behind
**Reader:** the Latent Leader (host). **Intent:** one QR turns a roomful of strangers into a list.
**Accent:** amber `#e0a24a`. **Node ramp:** `#3a2b2f` → `#4a2f2a` → `#5a3a24` → amber-lit.

- **Eyebrow:** No lead left behind
- **Headline (1 line):** "The room's full. Now none of them walk out as strangers."
- **Nodes:**
  1. **Your QR on the table** · "every scan logged" · glyph: a small QR square.
  2. **They scan and RSVP** · "one tap, no clipboard" · glyph: a phone with a check.
  3. **A few questions** · "your Questionnaire" · glyph: a short checklist (3 lines + ticks).
  4. **Roster you can export** · "a list you can work" · glyph: stacked name rows, amber-lit.
- **Magic moment:** the QR square dissolving into a tidy Roster of name rows. Physical to
  digital, the stack of business cards you'd never touch replaced by a list you have.
- **Stat strip:** "80% of event leads are never followed up. Yours are already on the list."
- **⚠️ Copy guardrail:** say "capture them" / "a list you can work," never "auto-files to your
  pipeline." Capture is via Questionnaire + Roster + CSV, not an automatic CRM sync on scan.
- **Art notes:** a physical table edge, a QR by a coffee cup, arrow, clean rows. Warm, tactile.
  Alt text: a host puts a QR on the table, guests scan and RSVP, a short questionnaire captures
  them, and their answers land in an exportable roster.

---

## FLOW 5 — Be the First Responder
**Reader:** the Latent Leader (host). **Intent:** the enquiry opens a real conversation instantly.
**Accent:** signal coral `#ff8a6b`. **Node ramp:** `#3a2b2f` → `#4a2f2a` → `#5a3a24` → coral-lit.

- **Eyebrow:** Be the first responder
- **Headline (1 line):** "78% of buyers pick whoever replies first. Now that's you."
- **Nodes:**
  1. **They browse the Market** · "your Service, contact-only" · glyph: a small storefront tag.
  2. **Send an enquiry** · "one button" · glyph: a paper-plane / send arrow.
  3. **A DM opens instantly** · "seeded with their message" · glyph: a chat bubble, coral-lit,
     with a small buzz/ping mark.
  4. **You reply and arrange** · "while it still matters" · glyph: two chat bubbles (a reply).
- **Magic moment:** the third node. The message bubble arriving the instant the enquiry sends,
  the phone lighting up. No form into the void. Draw motion/immediacy between node 2 and 3.
- **Stat strip:** "Reply within 5 minutes and you're 21x more likely to qualify. The average is 42 hours."
- **⚠️ Copy guardrail:** this path is intentionally moneyless. End at "arrange," never "pay."
  No checkout, no card.
- **Art notes:** speed and immediacy, the one "fast" teaser. A slight motion trail on the sent
  enquiry. Alt text: a buyer browses the Market, sends an enquiry, a direct message opens
  instantly, and the host replies to arrange it.

---

## FLOW 6 — One-Timer to Regular
**Reader:** the Latent Leader (host). **Intent:** one event becomes a reason to come back.
**Accent:** return green-gold `#c9d16b`. **Node ramp:** `#3a2b2f` → `#4a2f2a` → `#5a3a24` →
green-gold-lit. **This is the one flow with a curved return arrow.**

- **Eyebrow:** One-timer to regular
- **Headline (1 line):** "We don't measure screen time. We measure whether you showed up Thursday."
- **Nodes:**
  1. **They show up Thursday** · "check-in, verified" · glyph: a door with a check.
  2. **Join the Space** · "a home, not a one-off" · glyph: a small house / hearth.
  3. **A Run keeps them** · "Meetup + Weekend Gathering" · glyph: a few figures around a table.
  4. **They come back** · "the next date is set" · glyph: a calendar with one date circled,
     green-gold-lit.
- **Magic moment:** the loop. Draw the final arrow curving BACK from node 4 to node 1, because
  the Weekend Gathering is already on the calendar. The return is built in, not begged for.
- **Stat strip:** "Repeat guests are about 21% of your people and 44% of your revenue. Keep them."
- **⚠️ Copy guardrail:** Space membership takes no charge today. The payoff is belonging and
  return, not a sale. No revenue node.
- **Art notes:** the return curve is the hero shape. Warm, communal, a table with people. Alt
  text: a guest shows up on a Thursday, joins the Space, a Run keeps them engaged, and they come
  back because the next gathering is already scheduled.

---

## FLOW 7 — The Marketplace  ·  OVERVIEW (not a chain)
**Reader:** both (Seeker browsing, Latent Leader selling). **Intent:** teach the difference
between the three commerce surfaces in one glance. **This is the one non-linear teaser:** an
overview of three peer surfaces on a spectrum, not a pain→relief chain. Same canvas, palette,
type scale, and wordmark as the others, but the flow band holds **three vertical lane cards**
instead of a node row.

**The one idea:** a spectrum from free neighborly trading to paid commerce. Said by money:
**two boards you settle offline, one storefront that settles in-app.**

- **Eyebrow:** The Marketplace
- **Headline (1 line):** "A free couch. A spare room. A local shop."
- **Subhead (13px muted):** "Three ways to get what you need from your community."
- **Three lane cards (left to right), each a rounded rect with an icon disc, name, and a
  contact/money badge at the bottom. Color-coded by accent to show the spectrum:**

  1. **Classifieds** · accent soft green `#a8c78f`
     - types: "Swap, gift, lend, or ask"
     - who: "Free members and up"
     - flavor: "No fees, just neighbors"
     - glyph: a parcel (rect with a cross flap)
     - badge (connect-only): "Message to arrange"

  2. **Housing** · accent ice blue `#8ab6e0`
     - types: "Rentals, roommates, sublets"
     - who: "Members only"
     - feature: "Resonance roommate matching"
     - glyph: a house
     - badge (connect-only): "Message to arrange"

  3. **The Market** · accent gold `#ffd25e`
     - types: "Products, services, tickets"
     - who: "Paid members and Spaces"
     - flavor: "From your community's Spaces"
     - glyph: a shopping bag
     - badge (on-platform): "Secure checkout"

- **Footer line:** "Classifieds and Housing connect you, you settle offline. The Market adds
  secure checkout."
- **Magic moment / the visual point:** the two left lanes share a "Message to arrange" badge
  (cream/neutral), the right lane's badge switches to accent gold "Secure checkout." The badge
  color is where the money model becomes legible at a glance.
- **⚠️ Copy guardrails:**
  - Market checkout is **flag-gated OFF by default** (rolling out). Do not draw a completed
    purchase, a price total, or "buy now." "Secure checkout" as a capability is fine; a live
    transaction is not. If you want to be maximally honest, tag the Market badge "(rolling out)."
  - Housing is a **members-only** board; don't show it as open to signed-out visitors.
  - These are three **separate** surfaces, not one unified store. "One marketplace" is a
    positioning line, not a claim about a single system.
- **Art notes:** three equal lane cards, spectrum coloring green → blue → gold left to right,
  the money-model badge as the payoff row. Concrete, plain, communal. Alt text: three community
  commerce surfaces (Classifieds, Housing, the Market) shown side by side, the first two
  connect-only and settled offline, the third with on-platform checkout.

---

## Handoff order
Give Claude Design the shared-system section once, then one flow spec per teaser. Build flow 1
first as the locked reference (already rendered), approve its palette and node style, then run
the other five against it so the family stays consistent.
