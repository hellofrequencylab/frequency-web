# Launch marketing plan: positioning, ladder, Suite Builder, funnels, content, DAWN

**Status:** proposal, 2026-10-13, awaiting owner rulings (§12). Status lives in
[`docs/BUILD-BACKLOG.json`](BUILD-BACKLOG.json), never here: each workstream below becomes one backlog
row (a `docs/ledger/rows/` fragment) when it is picked up, with a probe that measures the consequence.
This file explains the work and the reasoning. It does not track it.

**Who wrote it.** The marketing agency: eight read-only specialist auditors defined in
`.claude/agents/` and run by the `/marketing-agency` skill (`.claude/skills/marketing-agency/SKILL.md`).
Re-run the skill to measure the product against this plan. Canon still wins on its own ground:
`docs/NAMING.md` on names, `docs/CONTENT-VOICE.md` on voice, `docs/VALUE-LADDER.md` + `lib/pricing/*` on
tiers, `docs/PAGE-FRAMEWORK.md` on layout, `docs/CHECKOUT.md` on payment buttons.

**Scope.** Everything a person sees before and just after they decide: the public site, the niche
doors, pricing, sign-up and induction, first-session member surfaces, in-product nudges, AI marketing
prompts, lifecycle email, the help center, and the DAWN theme on all of it.

---

## 1. The answer

The voice canon is strong, the DAWN tokens are already the production default, and the six Seeker
guides plus the niche doors are close to launch-ready. **The launch risk is not polish. It is truth
and plumbing.** Five things block a good launch:

1. **The site makes money claims the product no longer honors.** The live home page says "selling
   tickets, and taking donations are free from day one" (published from
   `supabase/migrations/20270345004600_home_document_states_the_model.sql:189`). About says "taking
   money is never behind a plan" (`lib/page-editor/templates/about.ts:133`). The six niche doors still
   run the retired ADR-914 rule ("A plan is for the second session", "You keep 100% of what you bring
   in", `lib/marketing/funnel-config.ts:276,367,458,550,645`). ADR-1709 says selling starts at Business.
2. **Three paid rungs cannot be bought.** Collective has no checkout (every call site passes
   `plan: 'business'`). Non Profit verification grants the plan free
   (`lib/spaces/nonprofit-verification.ts:288-301`). Annual billing is advertised on `/pricing` and
   hardcoded `interval: 'month'` in every Space checkout. Crew is comped to every member by
   `BETA_OPEN_ACCESS` (`lib/core/beta.ts:16`) and `BETA_MEMBERS_GET_CREW`
   (`lib/onboarding/funnel-script.ts:20`), so the Member to Crew rung has no buyer.
3. **The operator funnel drops operators on the member feed.** `OPERATOR_CTA_HREF = BETA_CTA_HREF =
   '/join'` (`lib/site.ts:199,224`). Outside `/for/<niche>`, every "Start free" for a business lands on
   `/feed?welcome=vera`, not on Space creation. `/spaces/new` redirects to a bare `/sign-in` with no
   `next` (`app/(main)/spaces/new/page.tsx:32`). Business activation is unmeasured: no `space.created`
   event exists.
4. **Feature grouping is a category picker, not a recommendation.** Eight overlapping layers (Mode,
   Focus, Setup preset, Directory kind, niche doors, `/start` roles, menu families, verticals) ask one
   question three times and land two niches on the wrong preset. §5 replaces it with the Suite Builder.
5. **The paying audience is under-explained and under-nurtured.** 11 of the 19 Space tools have no help
   article. Business operators get no onboarding sequence, no trial-ending email, and no AI help writing
   their own marketing. The welcome email makes a false referral promise ("you both earn",
   `lib/email.ts:2004,2024`).

The fix order is §11: **Truth first** (a week of copy and data fixes, no new features), then **Paths**
(funnels and checkouts that work), then **Suite Builder**, then **Lifecycle and content**, then
**Polish**.

---

## 2. The agency

| Agent | Owns | Headline finding |
|---|---|---|
| `brand-strategist` | Positioning, audiences, hierarchy | Five competing category names; false money and Lab claims |
| `offer-architect` | Ladder, pricing, triggers, checkout | Collective, Non Profit, annual and Crew cannot be bought |
| `suite-architect` | Feature grouping, Suite Builder | Eight grouping layers, one effect; bundle rule 2 hides Contacts, Email, Shop |
| `funnel-architect` | Entry to activation to first sale | Operator CTA is the member CTA; anonymous funnel events dropped |
| `copy-chief` | Copy, CTA lexicon, SEO/AEO | 0 rendered em dashes; ~340 missing contractions; no SoftwareApplication schema |
| `lifecycle-marketer` | Nudges, empty states, AI prompts, email | Single touches, not sequences; operator copy forced into Frequency's voice |
| `help-editor` | Help coverage and IA | Member side good; 11 of 19 Space tools undocumented; FAQ schema lost on money pages |
| `creative-director` | DAWN status, section patterns | DAWN is live; share cards are still indigo; `/go` and `/for` skip the kit |

---

## 3. Positioning

### 3.1 Where it stands

The site calls Frequency a "Community Collective" (`lib/site.ts:48,67`, feeding title, OG, meta and
llms.txt), headlines "Frequency is where your local community happens", and speaks to two readers at
once: the adult with no one to call on a Tuesday (Seeker) and the person who gathers others (Leader,
Builder). The docs name the enemy clearly (the feed, the one-off event). The site buries it and spends
the home page explaining a commercial model, so it reads as a small-business tool with a community
story attached.

**Contradictions to settle:** five category names (`lib/site.ts:48`, `CONTENT-VOICE.md:19`,
`BRIEF-01:13`, the home H1, SEO titles in `funnel-config.ts:230,326,417`); "Collective" is both the
tagline and a paid plan; four definitions of a Circle; The Lab described as a place you can walk into
(`what-is-frequency.ts:~227`, `app/llms.txt/route.ts:244-245`) while `/the-lab` honestly says 2028;
Crew described as "so it stays free for everyone" (`lib/marketing/who-its-for.ts:14`), which
ADR-1084 forbids.

### 3.2 Recommended hierarchy

**Positioning statement.** For adults who look fine on paper but have no one to call on a Tuesday, and
for the people who already gather them, Frequency is a local community network that gets the same few
people into the same real room every week. Feeds and one-off event apps stop at the first night.
Frequency is built for the second one: a standing Circle, a format that works, and a game that
rewards showing up. Joining is free, hosting is free, and you pay when you start charging.

**Category line, one everywhere:** "Local groups that keep meeting." Keep "Community Collective" as the
logo lockup only (owner ruling R1, amends ADR-811/944).

**Three pillars**

| Pillar | Promise | Proof |
|---|---|---|
| The same faces, every week | Circles and a standing time; someone notices when you're gone | Run structure, "Bring nothing", live Circle counts above `SOCIAL_PROOF_FLOOR` |
| Rails for the one who gathers | A first-night script, Starter Circles, a free Space | Hosting free; 0% on your own audience (plus card processing); your data leaves with you |
| A game that gets you off your phone | The Quest and Mindless reward real acts | No streak shame, no global leaderboard |

The Lab is **the horizon, not a pillar**, until a building exists: "Community first, building second."

**Proof per audience:** Seeker (first practice in under five minutes; a Circle near you this week; the
Moonlight Beach origin). Activity-first (run, sauna, supper club Circles: lead with the activity).
Leader ("Host one Circle. We'll hand you the format."). Builder (a free Space runs your page, Circles,
Events, contacts, email, bookings; Business when you start selling). Non Profit (no network fee, plan
stated honestly). Crew (contribute what you want, every amount buys the same Crew).

**Tagline shortlist** (sentence case, no em dashes): "Get people together. Do things on purpose."
(already canon spirit line, strongest) · "See you Thursday." · "Fewer feeds. More Thursdays." ·
"The same faces, every week."

### 3.3 Audience coverage

| Audience | State | Fix |
|---|---|---|
| Seeker | Best served (six guides, `/discover`) | `/the-community` turns to leaders mid-page; make it pure Seeker |
| Activity-first | One text link on `/start` | Add an activity door and a run/sauna/supper club guide |
| Leader | Split across three pages | One Leader landing (`/how-to-start-a-circle`) as Host funnel destination |
| Builder | Six doors, good | Fix door money copy; "Your practice, made perfect." fails the skeptic test |
| Collective buyer | No door | `/for/community-builders` splits into free Circle host vs Collective |
| Non Profit | "Raise more. Keep all of it." is an outcome claim | Honest plan line; verification path from the door |
| Crew patron | Conflicting framing | Lead with support and the Boost, not hosting caps (§4) |

---

## 4. Value ladder

### 4.1 As built

| Rung | Price | Unlocks (code) | Move-up trigger today |
|---|---|---|---|
| Member | free | 1 Circle, 2 Events, 30 guests, tips only (`lib/pricing/meter-limits.ts:79-91`) | Text error "Join Crew to host more" |
| Crew | PWYW, floor $4.99, suggested $10 | Host kit, Boost, uncapped Vera, Supporter mark | `/upgrade` picker; **comped to everyone** |
| Space (free) | free | Every business tool on launch limits | 80% meters, setting a price |
| Business | $49/mo | Selling, depth, 5% once on introductions, 14-day trial | `UpgradeMoment` on price set (works); monthly only |
| Collective | $149 list | Member Spaces, Vera, domain, 3% | **No checkout** |
| Non Profit | $39 | Business depth, 0% fee | **Granted free on verification** |
| Independent | $249, by hand | White-label | None (fine) |

### 4.2 Holes

1. Crew comp has no end date (ADR-1703 retired the flip). Cap messages never fire. **R2.**
2. Collective: "Available below" chip with nothing below (`plan-ladder.tsx:72,85`); `/pricing` "Start a
   Collective" goes to a marketing page.
3. Non Profit earns $0; verified Spaces see "eligible" with no button (`billing-body.tsx:305-309`).
4. Annual billing sold on `/pricing`, not buyable on any Space plan.
5. `/pricing` paid CTAs all go to `/spaces` (`lib/pricing/pricing-grid.ts:337-340`) and drop the plan.
6. A Member who sets a price gets "Start a Space for it" in a new tab, loses the draft, and the click
   is logged as `trial_started`.
7. Crew competes with a free Space that hosts about as much. Crew's real value is support.
8. 25 of 32 meters only show on the billing ladder; cap refusals are plain text with no link; when an
   Event fills, the guest is waitlisted and **the host is never told** (`counted-meters.ts:207`).
9. Trials re-grant on every new Space or resubscribe; no once-per-owner check.
10. "0%" and "You keep 100%" appear without "plus card processing" (`pricing/page.tsx:226,629`, 14
    template claims), against `VALUE-LADDER.md` §2.
11. A published `/edit/pricing` document silently replaces the whole generated page and fee table.

### 4.3 Launch story per rung

| Rung | Job | Promise | Trigger | CTA |
|---|---|---|---|---|
| Member | Find your people | Everything social, free forever | Wants to host | Start a free Space |
| Crew | Back the place you love | Contribute what you want; same Crew at every amount | 3rd attended Event; first Circle; Boost moment | Back Frequency ($5 / $10 / $25) |
| Space | Run your community | Every tool, launch limits, no clock | 80% meter at point of use; full Event; price set | Keep hosting free · Start selling |
| Business | Get paid | Tickets, memberships, donations, shop, deposits; 0% on your own people (plus card processing) | First price; first full Event; CRM/email at 80% | Start 14-day Business trial (monthly or annual) |
| Collective | Run a group of groups | Five Spaces, shared membership, splits, Vera | Second Space; collaborator cap | Bring your Spaces together |
| Non Profit | Raise and run for the mission | Business tools, 0% fee, $39 flat | Nonprofit Space type; turning on donations | Verify, then check out |

The law does not move: people join free, businesses host free, you pay when you start charging.

---

## 5. The Suite Builder (replaces feature grouping)

### 5.1 What is wrong with grouping today

The registry has **19 live tools** (`lib/spaces/functions.ts:45-90`; the "22" in the `bundles.ts`
header is stale). They are grouped by eight layers that overlap. The Space Spark asks Mode, Focus and
Starting setup as three fields; `/spaces/new` asks one 9-row radio and derives the rest. Either way
the operator picks a category; nobody describes their business. Concrete defects:

- Community builders land on the "Solo practice" preset; teachers land on `venue` with no Journeys;
  product businesses get no preset (`bundles.ts:114-116,241,246`).
- "Coach" appears twice in the radio; the membership Focus is "Event space" in one place and "Studio
  or gym" in another (`modes.ts:293,439,448`).
- `defaultToggles` still has zero runtime consumers and names retired keys; `KNOWN_FUNCTION_KEYS`
  (`modes.ts:613`) lists 12 keys, 3 retired, omits 10 live ones, so operator overrides for those tools
  are **silently dropped** today (a live bug).
- Bundle rule 2 forbids a preset from switching on `crm`, `email`, `shop`, but ADR-917 and ADR-1709 made
  them metered, not gated (`function-access.ts:35-43`). The rule hides the tools a business needs on
  day one.

### 5.2 The design

A sorting function. The operator answers four questions; every tool is sorted into **Your core suite
(recommended)**, **Add when you're ready**, and **Also available**, each with a reason ("Because you run
1:1 sessions"). A suggested plan rides alongside as a hint.

**Questions** (`SUITE_QUESTIONS`, plain voice)

1. What do you run? (up to 3) Classes or group sessions · 1:1 sessions or coaching · Programs, courses
   or retreats · Events or a venue · A community or club · Products or a shop · A cause or Non Profit
2. What matters most right now? (up to 2) Fill my events and classes · Sell memberships · Grow my
   audience · Sell programs and packages · Raise funds · Run groups in many places
3. How big is your team? Just me · 2 to 5 · 6 or more · A network of groups
4. Are you charging yet? Not yet · Soon · Yes

**Scoring.** One pure module, `lib/spaces/suite.ts` (data plus one resolver, no React, Next or
Supabase). The 7 core tools (`CORE_SPACE_FUNCTION_KEYS`: Your page, Your people, Circles, Calendar,
Loom Studio, Reviews, Plan and billing) render as an "Always included" strip and are never scored. The
12 optional tools take additive weights per answer:

| Answer | Weights |
|---|---|
| Classes | memberships 3, availability 2, practices 2, qr 2, email 1, crm 1 |
| 1:1 | availability 3, crm 3, journeys 2, practices 2, email 2, memberships 1 |
| Programs | journeys 3, email 2, crm 2, airwaves 1, practices 1 |
| Events / venue | qr 3, collaborators 3, availability 1, email 1, crm 1 |
| Community | qr 2, airwaves 1, practices 1, program 1, email 1 |
| Shop | shop 3, crm 2, email 2, qr 1 |
| Cause | donations 3, email 2, crm 1, qr 1, journeys 1, collaborators 1 |
| Fill | qr 2, email 1, availability 1 |
| Memberships | memberships 3, crm 1, email 1 |
| Grow | email 2, qr 2, crm 2, airwaves 1 |
| Sell programs | journeys 2, availability 1, crm 1 |
| Raise | donations 3, email 1, crm 1 |
| Network | program 3, collaborators 2 |
| Modifiers | team 2+: crm +1 · network size: program +2, collaborators +1 · charging yes: crm +1 |

Score 4+ is core suite, 2 to 3 is add when ready, 0 to 1 is also available. Ties break by registry
order, so output is deterministic and testable. Weights are a starting proposal; tune after the first
20 real setups (R5).

**Suggested plan** (hint only): not charging and solo is Free; charging or a team is Business; a cause
charging or soon is Non Profit; a network is Collective. Vera is offered as an add-on when "Grow" is
picked.

**Worked examples**

| Persona | Core suite | Add when ready | Plan |
|---|---|---|---|
| Solo breathwork coach (1:1 + programs; sell programs + grow; solo; charging) | Contacts, Journeys, Email, Booking | Practices, QR codes, Airwaves | Business |
| Yoga studio (classes; memberships + fill; 2 to 5; charging) | Memberships, QR codes, Contacts | Booking, Email, Practices | Business |
| Run club founder (community; grow + fill; solo; not yet) | QR codes, Email | Contacts, Airwaves | Free |
| Food-access Non Profit (cause + programs; raise + grow; 2 to 5; soon) | Contacts, Email, Donations, Journeys | QR codes, Airwaves | Non Profit |

### 5.3 How it fits the existing machinery

- `suiteToBundle(result)` returns a `CapabilityBundle` (core plus core suite) and goes through the
  unchanged `nextBlobsForBundle` (`bundles.ts:286`). It stays **subtractive**, never writes
  `spaces.plan` or `entitlements.billing`, and keeps `UNDISABLEABLE_FUNCTION_KEY`. A bundle still never
  touches money.
- **Store the answers, not the result**, in `spaces.preferences.suite` (matches `provision.ts:296-299`).
  Settings re-sorts from the answers. **Re-sorting never switches a tool off**; "Use the suggested
  setup" shows a diff and asks (ADR-1281).
- Owner ruling R4 amends rule 2 so the suite may switch on `crm`, `email`, `shop`. `program` stays
  paid depth.

### 5.4 Where it surfaces

1. **Public page** `/find-your-setup` (name to confirm against NAMING, R6): a small client island over
   pure data (keeps `check:shell-weight` clean). Answers live in the URL, so results are shareable and
   crawlable. Three columns, the plan card, then "Start free" to `/join?suite=…`.
2. **`/for/<niche>` doors** become pre-filled answers (`NICHE_SUITE_ANSWERS` replaces the Focus mapping
   in `lib/funnels/definitions.ts:155-163`) with an "Adjust your setup" link. Fixes the
   community-builder and teacher mismatches by construction.
3. **`/start`**: "Run a business? Find your setup." replaces the single text link
   (`app/(marketing)/start/page.tsx:117`).
4. **`/spaces/new` and the Space Spark**: Q1 to Q4 replace Mode, Focus and Starting setup, with a live
   three-column preview. `type` and the Focus variant are derived (Focus keeps driving lexicon, CRM
   pipeline and directory kind). If the Studio kernel lacks a multi-select field, adding one is a kernel
   change that touches every wizard (`docs/STUDIO.md`).
5. **Space settings, Menu and features** (`manage/modules/page.tsx`): rows grouped into the three
   sections, "Change my answers" to re-sort. `/manage/mode` folds into a "Your business" answers editor.

### 5.5 Keep and retire

**Keep:** `nextBlobsForBundle`, `setSpaceBundle` (plus a sibling taking a bundle object),
`CORE_SPACE_FUNCTION_KEYS`, the billing guard, the `general` bundle, Mode `type`, the ModeProfile
lexicon, pipelines, next-best-actions and `kindForMode`, funnel doors as copy, menu families as IA.

**Retire:** `SETUP_PRESETS`, `SETUP_PRESET_BY_MODE`, `setupPresetForMode` (`bundles.ts:146-261`);
`ModeProfile.defaultToggles`; `WIZARD_CHOICES` and `listModeChoices` (`modes.ts:438-455`);
`SETUP_PRESET_OPTIONS` and the Spark `preset` field (`lib/studio/entities/space.ts:84-89,124-131`);
the hand-kept `KNOWN_FUNCTION_KEYS` (derive from the registry; fixes the dropped-override bug).

---

## 6. Funnels

### 6.1 Three funnels, one rule

Every auth-gated destination sends a person with no account to `/join?next=…` and a returning member to
`/sign-in?next=…`. **Never a bare `/sign-in`.** Every funnel carries `seq`, `persona` or `suite` plus
`next` through the induction and across devices.

| Funnel | Entry | Steps | Activation |
|---|---|---|---|
| **Join** (Seeker) | `/`, guides, `/discover`, event pages | Find your people, `/join?persona=visitor`, induction, `/feed?welcome=vera` | Joined a Circle, RSVP'd, logged a practice (week 1) |
| **Host** (Leader) | `/start` Build, `/go/host-one-circle`, how-to-start-a-circle | `/join?persona=builder&next=/circles/templates`, Starter Circle, publish, invite three | First gathering with 3 people (new `circle.first_gathering`) |
| **Business** (Builder) | `/for/<niche>`, `/pricing`, `/spaces`, `/find-your-setup` | `/join?seq=<niche>` or `?suite=…`, induction, `/spaces/new`, first offer, share | Space created, first offer, first booking or sale |

### 6.2 Leaks to close

1. Split the operator CTA from the member CTA (`lib/site.ts:224,263`, `templates/spaces.ts`).
2. `/pricing` hero and paid CTAs go to a start step, not the `/spaces` sales page.
3. `/spaces/new` keeps `next` and `?mode`/`?suite` through sign-in (`spaces/new/page.tsx:32`).
4. Cross-device recovery for niche funnels (`app/auth/callback/route.ts:130`, today only `breathwork`).
5. Route by persona when no `seq`/`next` is set (builder to templates, practitioner to `/spaces/new`).
6. `/sign-in` silently creates accounts that skip the induction (ADR-1371 removed the gate). New
   accounts go through `/join?next=<original>`.
7. Circle invite join lands on the Circle, not `/circles` (`app/join/[slug]/join-button.tsx:16`), with
   inline errors instead of `alert()`.
8. `/rsvp/<token>` success shows `FunnelNextStep` plus "Keep your seat: make an account", not a link home.
9. Soft email capture ("Get the notes") on article closes, `/for/*` and `/pricing`; article CTAs pass
   `persona`.
10. Branch the first-run checklist by persona (`lib/onboarding/steps.ts:60-95`).

### 6.3 Instrumentation

Signed-out events are dropped today (`app/api/track/route.ts:22` returns 204), the induction emits no
beat events, there are no CTA-click events in marketing, `land_to_beta` counts a path that now 308s
(`lib/analytics/journeys.ts:90-106`), and guest RSVPs are untracked. Add an anonymous-safe server action
on the `persona-log.ts` pattern and this event spine:

`funnel.door_viewed` → `funnel.cta_clicked` → `onboarding.funnel_entered` → `onboarding.beat_viewed` →
`lead.captured` → `account.created` → `onboarding.induction_completed` → then per funnel:
Join `circle.joined`, `event.rsvp` (guest included), `practice.verified` · Host `circle.started`,
`circle.invite_sent`, `circle.first_gathering` (new) · Business `space.created{mode,suite}` (new),
`space.offer_published` (new), `commerce.checkout_started`, `commerce.purchase`.

Add a Business journey to `lib/analytics/journeys.ts` and fix `land_to_beta`.

---

## 7. Copy, CTA lexicon, SEO and AEO

**State.** Zero rendered em dashes. The live copy is the code templates in
`lib/page-editor/templates/*` for every page except `/` (only `home` is a published DB document; check
`/pricing` before launch). Biggest voice drift: **missing contractions** (about 340 instances of "do
not", "cannot", "is not", "you are", "does not" across templates, `funnel-config.ts`, `comparisons.ts`
and page metadata), plus narrated feelings in three guide heroes (CONTENT-VOICE §3b).

**Must-fix copy:** the money claims (§1); The Lab tense (`what-is-frequency.ts:165,228,301,352`,
`what-is-frequency/page.tsx:28,30,45`, `llms.txt/route.ts:80,245`); "Frequency Labs" naming the
software (`tools-for-community-builders.ts:116,145,163` and its `page.tsx:22,42`); "Open Mindless"
pointing at the protected `/on-air` (`calm-down-fast.ts:110`, `the-quest.ts:239`); the event-hosts door
selling tickets "free to start" next to "that is Business" (`funnel-config.ts:428,469`); the Eventbrite
comparison contradicting `/for/event-hosts`.

### 7.1 CTA lexicon (one verb per intent)

| Intent | Label | Destination |
|---|---|---|
| Seeker sign-up | Find your people | `/join?persona=visitor` |
| Operator sign-up | Start free | `/join?seq=…` or `?suite=…` (never plain `/join`, never `/sign-in`) |
| Browse without account | See what's near you | `/discover` |
| Learn more | See how it works | the relevant page |
| Free tool | Try Mindless | `/mindless` |
| Business setup | Find your setup | the Suite Builder |
| Paid plan | Go Business | billing (never "Upgrade") |
| Support Frequency | Back Frequency | `/upgrade` |
| Newsletter | Get the notes | `/subscribe` |

Retire: "See how the community works", "Find something near you", "Get the toolkit", "Host your first
Circle" (points at `/the-community`), "Upgrade" (`pricing.ts:238`).

### 7.2 Headline rewrites (owner-reserved copy, OWN-043 applies to home)

| Page | Proposed H1 |
|---|---|
| `/` | Your people are closer than you think. (sub: Small groups that meet every week, near you. Join free. Businesses host free.) |
| `/what-is-frequency` | What is Frequency? Small groups, near you, every week. |
| `/pricing` | Free to join. Free to host. You pay when you start charging. |
| `/spaces` | Bring your people. They join free. You keep the door open. |
| `/the-community` | Friends you see every week, not once a year. |
| `/calm-down-fast` | How to calm down fast when you can't switch off |
| `/how-to-build-community` | How to build community: start smaller than you think |
| `/tools-for-community-builders` | Tools for community builders, in one place |

### 7.3 Search and answer engines

- Add `SoftwareApplication` JSON-LD (free plus Business offer) on `/`, `/what-is-frequency`, `/pricing`;
  `WebApplication` on `/mindless` (`lib/jsonld.ts`). None exists today.
- FAQ blocks (Accordion emits FAQPage) on the home document, `about.ts`, `spaces.ts`.
- `organizationSchema` gains `foundingDate` (2020), `founder`, fuller `sameAs`; `WebSite` gains
  `SearchAction`.
- Comparison pages for **Meetup** and **Facebook Groups** first, then Bumble BFF, Luma, Skool, Mindbody
  (`lib/marketing/comparisons.ts`); fix the "Free to join, always" cost row that hides paid tiers.
- Guides and `/mindless` into the footer (`lib/nav/registry.ts`); guides cross-link to `/vs/*`;
  `/pricing` links to `/vs`.
- Trim seven over-long descriptions; retitle `/the-quest` and `/the-community` for real queries;
  `lastModified` on static sitemap entries from each page's `UPDATED`.
- llms.txt: drop the Lab-as-present line, the "Not a third of the offer" line and the dormant "Opening
  Beta rate" branch; add `/mindless`, `/subscribe`, the Suite Builder.
- Per-page OG cards for guides and `/vs/[slug]` (§10).

---

## 8. Help center

**State.** 71 articles, member side good, no em dashes, no broken links. `pnpm help:coverage` reports
44/50 but counts a tag as coverage. **11 of 19 Space tools have no article.** No article has an image.
`spaces/get-paid.md` and `spaces/billing.md` write FAQs as bold text, so `extractFaq`
(`lib/help/content-core.ts:87`) emits no FAQPage on the two money pages. Every `spaces/*` article is
tagged `audience: member`.

**IA, by task and the five-verb ladder:** Start here · Joining · The Quest · Hosting (Crew) · Running a
Space (one page per tool) · Selling · Billing and plans · Safety and account · Find your people (SEO
track). `audience` front-matter drives a For members / For hosts / For Space owners switch.

**Feature explainer template** (every tool page; front-matter `audience`, `featureKeys`, `plan`):

1. H1: the tool's canonical name, then one sentence, answer first.
2. Who it's for (one line).
3. What it unlocks (2 or 3 bullets, the why).
4. Which plan (link to plans and pricing; never type a price).
5. How to start (3 to 6 numbered steps naming the real buttons, one screenshot).
6. What people see.
7. Limits and what's coming, stated honestly.
8. Questions people ask, as `### Question?` so FAQPage emits.
9. Related (2 or 3 links).

**Launch articles.** P0 (the paid path): Sell memberships · Your Space calendar · Take bookings · Run
your Shop · Send an email campaign · Community Resonance (rename `space-crm.md`, which says "Space
Contacts"; NAMING:347) · Choosing your setup (the Suite Builder). P1: Add your team · Cohosts,
Collaborators and Venue · Who is Vera · The Zap button · Get help or report a bug · Accept donations ·
Reviews · QR codes for your Space. P2: Airwaves, Loom Studio, build a practice, Journal, Around You,
Spotlight, streak freeze and gifting, publish the household bundle draft.

**Fix alongside:** split `groups/events.md` (4,372 words) and rename "Recurring events"
(NAMING:476); category "Circles, Hubs & Events" (Hubs folded); fix canonicals on doomscrolling,
how-to-start-a-circle and what-is-frequency; `lib/help/feature-keys.ts:66` (`store` route);
`check:help` measures one article per `SPACE_FUNCTIONS` key; remove the dated "Open access until 1
December" section (`spaces/plans-and-pricing.md:113`).

---

## 9. Lifecycle and in-product marketing

**State.** The parts exist (Vera persona openers, a 5-step checklist, event reminders and made-it mail,
digests, the upgrade moment, operator playbooks), but they are single touches, not sequences. Business
operators get almost no automation. Nurture sequence tables ship empty.

**Fix the most-seen copy first:**
- Welcome email: remove "you both earn" (false; the referrer is paid on activation) and "connected to
  your community" (`lib/email.ts:1984,2004,2014,2024`).
- Day 1/3/7 notifications: exclamation points, lowercase "circle", and day 7 points at the leaderboard
  that opens only at Regular (`app/api/cron/lifecycle-triggers/route.ts:48-54`).
- Invite card: "Earn Zaps when they join" pays on activation; share text says "find your people",
  which the voice primer bans for share copy (`components/sidebar/invite-friend-button.tsx:41,75`).
- Market Read FOMO lines and lowercase "circle" (`lib/marketing/market-read.ts:127,163-166`);
  unverified "Others are looking too." (`app/(main)/network/page.tsx:494`).

**Moments of need with no prompt:** Vera daily cap (silent fallback); Business trial ending (no
`trial_will_end` handler); Space activation (completeness card exists, no money checklist: payouts,
offer, first Event, contacts, first campaign); Event "No RSVPs yet" (no share or promote CTA,
`events/[slug]/manage/sections.tsx:172`); stage unlocks (banner names the stage, not what woke up);
new Hosts (role_host walkthrough wired, no content seeded); the right rail never promotes hosting or a
free Space.

### 9.1 Day 0 to 30 program

All sends go through the existing gate (`'email','lifecycle'`), triggered by `engagement_events`,
sequences seeded in code.

| Day | Member | Host | Business operator |
|---|---|---|---|
| 0 | Vera opener; welcome with one ask (nearest Circle or this week's Event) | role_host walkthrough (Outreach, Inbox, first-night plan) | Space activation checklist; day-0 email |
| 1 to 3 | Day 2 no Circle: "Three Circles near {home}" (real counts) | Day 1: "Put your first gathering on the calendar" | Day 1 no offer: listing spark · Day 3 no contacts: import or QR nudge |
| On event | Reminders (live); made-it email adds "join the Circle that runs it" | Publish: promote kit · T-3 low RSVPs: "Invite five people" · Day after: host recap | First price: upgrade moment (live) · First sale: "First one in" plus next step |
| 5 to 14 | Day 5 no RSVP: "One thing this weekend" · Day 14 idle: "Your Circle met Tuesday" | Day 14 no second Event: rhythm nudge | Day 7: owner brief with activation score · Trial T-3: value-delivered email |
| 21 to 30 | Day 21: invite (corrected copy) · Day 30: monthly recap | Day 30: Circle health plus Crew | Day 21 idle: done-for-you campaign draft · Day 30: business recap |

### 9.2 AI marketing prompts

1. **Split the voice primer by speaker.** `withOperatorVoice(brand)` keeps the guardrails (no
   fabrication, no em dashes, no health claims, no hype) but drops Frequency's proper-noun rules and
   banned-wellness list, and takes the operator's own tone. Use it in `lib/ai/space-copilot.ts:234`,
   `lib/ai/listing-copy.ts:140` and every operator tool. Today a Space owner's own bio is forced into
   Frequency's voice.
2. **Promote kit** for Event, Circle and Space: a text message, an Instagram caption, a flyer line,
   grounded in real facts and counts above `SOCIAL_PROOF_FLOOR`, activity first.
3. Event drafts (`lib/ai/events-ai.ts:236`): who it's for, what to bring, one reason to come, one CTA,
   a first-timer line.
4. Open the messaging generator to Space operators with their brand voice; explicit no-FOMO rule; a fact
   slot for real counts.
5. Circle compose: the meeting rhythm is a default, not a rule (`lib/ai/circle-compose.ts:77`).
6. A voice lint in CI over deterministic copy (notifications, email builders, empty states): banned
   words, exclamation count, proper-noun case.

---

## 10. Design and DAWN

**DAWN is live.** It is the default token set (`lib/theme/skins.ts:45`); marketing TSX has zero
hardcoded hex; the kit's mobile grammar holds. What remains is the fringe that never adopted it.

**Must convert before launch**
1. **Share cards.** The root card (`app/dev/og-root-card/route.tsx:128-149`, `app/opengraph-image.jpg`,
   `twitter-image.jpg`) and 12 per-entity cards (`lib/og/event-card.tsx:32-73` plus 11
   `opengraph-image.tsx` files) are still the old indigo brand. One shared `lib/og/tokens.ts` on the
   model of `app/(public)/spaces/[slug]/opengraph-image.tsx:34-41`. This is the first thing people see
   when a link is shared.
2. **`/go/[door]`** campaign doors onto `PhotoHero` + `Section` + CTA band
   (`app/(marketing)/go/[door]/page.tsx:40-48`, photo field in `lib/marketing/launch-doors.ts`).
3. **`/for/[niche]`** onto the kit (`components/marketing/funnel/funnel-sections.tsx:69,352,380`), and
   widen the `pad=` ban to `components/marketing/**` and `app/for/**`.
4. **Read back the published `/` and `/pricing` documents** against the kit and the copy canon;
   extend `scripts/maintenance/home-copy-canon.mjs` to flag money claims, retired CTA labels and more
   than two ink bands.
5. **Visual and a11y baselines** for `/sign-in`, `/onboarding`, `/go/*`, one `/for/*`, a Space, an
   Event, a profile (`test/e2e/surfaces.ts`).

**After launch:** named display roles (add `--text-display-section`; 12 `clamp()` heading sizes today),
one eyebrow and the 12px floor (`text-3xs/2xs` ×39 on marketing), radius literals, `/mindless` header,
`--color-info` correction and the stale reference files `pnpm check:dawn-bundle` lists.

### 10.1 Marketing section library (one component per job)

| Pattern | Component | Retire |
|---|---|---|
| Hero | `PhotoHero` with optional facts, `text-display-hero`, `.eyebrow` | `FunnelHero`, marketing `Cover` variants; rename the marketing `PageHero` |
| Proof | `ProofBand`: testimonials plus `Stat` row, real counts or none | `LiveStats`/`StatRow` duplicates |
| Feature grid | `FeatureGrid`: `Card soft` ×3 to 6, amber icon chip | ad hoc grids |
| Suite Builder | `SuiteBuilder` in the kit, reading `lib/spaces/suite.ts` and `lib/pricing`; phone: stacked rows, sticky plan bar clear of the safe area | none |
| Pricing | `PlanCard`/`PlanPrice`/`PlanCta` promoted out of `pricing/page.tsx:747-934`; `PlanBand` and `Tiers` compose it | page-local copies |
| FAQ | `FaqList` plus `faqSchema` | funnel `FaqSection`, `SpaceFAQ` re-export it |
| CTA band | ink, `mk-band`, `.light-strip`, `.amber-glow`; one mid-page, one closing | none |

---

## 11. Launch sequence

Each phase is a set of small PRs, one backlog row each, fragments only. A phase ends when its rows'
probes pass, not when this file says so.

**Phase 0: Truth** (copy and data, no new features; do first)
- Home document migration replacing the money claims with `PLAN_STORY.selling` copy, plus the canon
  gate rule (§1, §10.4).
- About principle; six door money lines and `trustLine`; event-hosts door; Eventbrite comparison.
- The Lab tense everywhere; "Frequency Labs" to "Frequency"; Crew "stays free for everyone" lines.
- "Plus card processing" beside every 0% and 100% claim.
- Welcome email, day 1/3/7 notifications, invite card, Market Read, "Others are looking too".
- "Open Mindless" to `/mindless`; FAQ headings on get-paid and billing; `space-crm.md` to Community
  Resonance.

**Phase 1: Paths** (every CTA reaches a working step; every rung can be bought)
- Operator CTA split; `/pricing` CTAs with `?plan=`; `/spaces/new` keeps `next`; cross-device niche
  recovery; persona routing; `/sign-in` new accounts into the induction.
- Collective checkout; Non Profit charged at $39 after verification; annual toggle on Space checkout;
  trial once per owner; host told when an Event fills; refusals carry an `upgradeHref`.
- Crew decision (R2) implemented.
- Event spine and `space.created`; Business journey; `land_to_beta` fixed; guest RSVP tracked.
- Share cards on DAWN; `/go` and `/for` on the kit; first-session baselines.

**Phase 2: Suite Builder**
- `lib/spaces/suite.ts` and tests with the four personas pinned; ADR fragment for rule 2.
- `/find-your-setup` page, `/for/<niche>` pre-filled answers, `/start` link.
- `/spaces/new` and Spark questions; settings sectioned list; retire presets and `defaultToggles`; derive
  `KNOWN_FUNCTION_KEYS`.
- Help article "Choosing your setup".

**Phase 3: Lifecycle and content**
- Persona sequences seeded; Space activation checklist; trial-ending and host recap emails; Vera cap
  upgrade moment; stage banner names unlocks; role_host walkthrough seeded.
- Operator voice primer; promote kit; operator campaign drafting.
- P0 and P1 help articles on the explainer template; help IA and audience tags.
- SoftwareApplication and FAQ schema; Meetup and Facebook Groups comparisons; footer links; llms.txt.
- Branch the first-run checklist by persona; soft email capture.

**Phase 4: Polish**
- Contractions pass; CTA lexicon sweep; headline rewrites (owner-approved).
- Display roles, eyebrow, 12px floor, section library consolidation.
- Per-page OG cards; metadata trims; activity-first door; `/the-community` split.

---

## 12. Owner rulings needed

| # | Decision | Recommendation |
|---|---|---|
| R1 | Category line and tagline lockup (amends ADR-811/944) | "Local groups that keep meeting." as category; "Community Collective" lockup only |
| R2 | End of comped Crew (`BETA_OPEN_ACCESS`, `BETA_MEMBERS_GET_CREW`; ADR-1703 retired the flip) | Off at public launch; existing comps keep Crew for 60 days, then the picker |
| R3 | Non Profit billing for existing free grants | Grandfather existing grants to a date; new verifications check out at $39 |
| R4 | Amend bundle rule 2 so the Suite Builder may switch on `crm`, `email`, `shop` | Yes; `program` stays paid depth |
| R5 | "Add when ready" tools start off, or on but tucked away, for solo operators | Off, one switch away; revisit after 20 setups |
| R6 | Name and route of the public Suite Builder | "Find your setup" at `/find-your-setup`, checked against NAMING |
| R7 | Home and pricing headline rewrites (OWN-043 owner-reserved copy) | §7.2 as a starting draft |
| R8 | Crew repositioned as support first, host kit second | Yes |

---

## 13. Doc drift to fix in the same passes

`docs/VALUE-LADDER.md:127-211,229` (ADR-914 personal ladder, Collective seats, annual "not done");
`docs/COLLABORATION-AND-UPGRADE-FUNNEL.md:12-17` (cites ADR-914); `docs/PRICING.md:105` (free Space 10%);
`lib/pricing/plans.ts:5-10` and `plan-ladder.tsx:151` comments; `lib/pricing/bundles.ts` header (19 keys);
`docs/OFFER-MODEL.md` §3 (rule 2) and §8 (donations path, re-test first); `docs/GLOSSARY.md:167-177,216`
(retired v3 mechanics); `docs/FEATURE-INDEX.md` §3 to §4 (Vault and Crew, Mindless missing);
`docs/ONBOARDING.md` (`tips.ts` does not exist); `docs/MARKETING-STYLE-GUIDE.md` §1 ("Felt, not stated"
defers to CONTENT-VOICE §3b); design briefs before any DAWN mock work: `design_handoff/BRIEF-01:150`,
`BRIEF-03` §1 and §5, `BRIEF-04:40-46,62`, `BRIEF-05:33`, `MARKETING-BRIEF.md:27,341`,
`docs/OVERVIEW.md:39,76`.
