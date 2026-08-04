# UX maturity plan — the eight lifts from 74 to 90+

> **What this is.** The 2026-08-04 rebuild grading scored the redesign 74/100 against a
> best-in-class bar: world-class token architecture and design ops (90s), mid-migration
> screen craft (65), and a missing user-evidence loop (40). The owner directed the eight
> improvement recommendations be built into the phased plan as fully mature workstreams.
> This document is those phases. Companion: [ADR-925](DECISIONS.md). Runway placement:
> [BUILD-LIST.md](BUILD-LIST.md). The DAWN sync contract this rides on:
> `design_handoff/SYNC.md`.
>
> **The bar for "mature" used throughout:** each lift has (1) a definition of done that an
> outsider could verify, (2) machine enforcement wherever a machine can hold the line —
> the repo's house pattern (check:tokens, check:menu, the admin-client ratchet), (3) a
> number that moves, reviewed on a cadence, and (4) named owner actions where a human is
> genuinely required. A lift without its gate is a wish; these are not wishes.

Legend: ✅ done · ⏳ in flight · 📋 specced · 🔴 owner-gated. Lift: S ≈ 1 day · M ≈ 2–4
days · L ≈ 1–2 weeks.

---

## Lift 1 — The user-evidence loop (research in every round)

**The gap.** Every design decision to date flows designer → owner → code. The loop is
closed and fast, but no real user has ever been inside it. This is the single largest
distance from world-class: a 40 today, and no amount of craft spends past it.

**Mature means:** no DAWN round ships without user evidence attached, and no quarter
passes without moderated tests on the core journeys.

### Workstreams

**1a. The five journeys, named and instrumented (M).** Canonize the journeys that decide
the product's fate, as a registry the analytics and tests both read
(`lib/analytics/journeys.ts`):
J1 land → join beta · J2 join → first Circle found · J3 first Circle → first event RSVP ·
J4 first practice log → 7-day return · J5 operator: claim → first published surface.
Each journey = an ordered list of `interaction_events`/`engagement_events` markers that
ALREADY exist (the semantic ledger is live); the registry makes the funnel queryable per
journey without new tracking. Deliverable: `journey_funnel(journey_key)` RPC + a
`/admin/insights` Journeys panel (Dashboard template, StatCard row per journey step).

**1b. Moderated tests, quarterly cadence (M, recurring, 🔴 owner).** Five users per
round, on the Vercel preview of the current design-sync branch, tasks = the five
journeys. The repo's contribution: `docs/research/PROTOCOL.md` (task scripts per journey,
consent language via the existing consent scope, note-taking template) and
`docs/research/findings/YYYY-MM-DD.md` per round — findings in git because they are
technical inputs to design, not operator instructions. Owner action: recruiting five
members per quarter (beta list is the pool; a Zap grant is the thank-you — the economy
already supports staff grants).

**1c. Findings feed the DAWN round (S, contract change).** `design_handoff/SYNC.md`
gains a standing section: each outbound handoff includes "what users tripped on" from the
latest findings file; each inbound CHANGES.md is expected to answer them. The two-way
contract already exists — this adds the third voice to it.

**1d. Session-replay lite, consent-gated (M, deferred until traffic justifies).** No new
vendor by default (mirrors the ADR-922 no-vendor stance). Revisit at >1k WAM; if adopted,
gate on the existing `analytics` consent scope and record the decision as its own ADR.

**Gate:** `check:research-freshness` (advisory, not blocking): warns in CI when the
newest `docs/research/findings/` file is older than 100 days. Advisory because a human
cadence cannot be build-blocked honestly — but the warning is visible on every PR.
**Metric:** J1–J5 conversion, reviewed in every DAWN round note; findings file age.

---

## Lift 2 — Adoption-debt sprints with ratchets (spend the system)

**The gap.** The design system's value is unrealized on the surfaces: 4,722 literal
`rounded-*` (0.5% role-token adoption), ~30 hand-rolled progress bars vs the new
ProgressTrack, RowCard at 4 uses vs ~15 bespoke rows, UnderlineTabs vs 4 pill consoles +
3 hand-rolled strips, EntityCard at 32 vs 44 bespoke cards.

**Mature means:** every count above is frozen by a ratchet the day its sweep lands, so
debt can only shrink — the admin-client-baseline pattern, generalized.

### Workstreams

**2a. The ratchet harness (S).** Generalize `scripts/check-admin-client.mjs` into
`scripts/check-adoption.mjs` + `scripts/adoption-baselines.json`: each entry = a name, a
grep-class pattern, a file scope, and a frozen count. Fails CI when a count RISES;
`--update` shrinks baselines after a sweep. One harness, every debt class.

**2b. The sweeps, in payoff order (each M, mechanical):**
| Sweep | From → to | Baseline key |
|---|---|---|
| Radius roles (P3 of the retheme) | 4,722 literal `rounded-*` → `rounded-card/control/pill` by role; codemod + hand-review of the ambiguous tail | `literal-radius` |
| ProgressTrack | ~30 `rounded-full` + inline-width bars → the primitive | `adhoc-progress` |
| UnderlineTabs (owner-ruled 2026-08-03) | 4 pill consoles (via `activeHref`) + 3 hand-rolled strips → the one tab vocabulary; move the component `components/admin/` → `components/ui/` | `tab-vocabulary` |
| RowCard | ~15 bespoke `*-row*` → RowCard slots | `bespoke-rows` |
| EntityCard/PersonCard | bespoke cards → kit, where the card is genuinely an entity browse card (bespoke-by-design cards get an allowlist entry, not a rewrite) | `bespoke-cards` |
| text-subtle at small sizes | Lift 3's contrast sweep feeds this baseline | `subtle-small-text` |

**2c. Cadence.** One sweep per wave alongside screen passes — a sweep is mechanical
review-friendly work that pairs well with a visually-loud screen PR.

**Gate:** `check:adoption` in ci.yml, blocking. **Metric:** the baselines file is the
scoreboard; BUILD-LIST's kit adoption map updates per sweep.

---

## Lift 3 — Accessibility as a gate, not a favor

**The gap.** DAWN caught our AA failure (rail labels at 3.6:1); we should catch our own.
There is no axe audit, no automated contrast validation, no focus-visible sweep, and
dark mode + Midnight have never had a contrast pass.

**Mature means:** a PR that regresses accessibility fails before a human sees it, on all
four render states.

### Workstreams

**3a. Token-pair contrast validation (S, highest leverage).** `scripts/check-contrast.mjs`:
parse `app/globals.css`, compute WCAG ratios for the declared token PAIRS (text/canvas,
muted/surface, subtle/surface, on-ink/ink, on-primary/primary, chrome text pairs …) in
all four render states (DAWN light/dark, Midnight light/dark). Declare the pair table in
the script with the minimum ratio per role (4.5 body, 3.0 large/decorative). This makes
the *palette* unable to regress — the class of failure DAWN found becomes structurally
impossible. Blocking gate in ci.yml.

**3b. axe-core in the e2e suite (M).** `@axe-core/playwright` on the visual-suite
surfaces + feed/room/settings, both modes; serious/critical violations fail. Runs
wherever the visual suite runs (Lift 6's cadence); same PW_BASE_URL plumbing.

**3c. Focus-visible + keyboard sweep (M, once, then held by 3b).** One audit pass over
the interactive kit (Button, IconButton, tabs, dialogs, docks, composer): the global
amber ring reaches everything focusable, no `outline-none` without a replacement, Esc
paths on the new docks/popovers (the Vault dock already has one).

**3d. Reduced-motion completeness (S).** The lift/sheen layer shipped with a
reduced-motion guard; extend the audit to every `animate-*`/`.reveal`/`.stagger`
consumer. Add to the 3a script: every keyframe class must appear inside a
`prefers-reduced-motion` guard block or carry a documented exemption.

**Owner action (🔴, 5 min):** enable the Supabase Auth leaked-password protection that
the advisors have flagged since June — not a11y, but it rides every "turn the gates on"
conversation and keeps being deferred.

**Metric:** axe violation count (target and hold: 0 serious+), contrast pairs all green
×4 states, `subtle-small-text` baseline shrinking (Lift 2).

---

## Lift 4 — The mobile grammar, decided once

**The gap.** Docks, dual rails, and fact-dock heroes are desktop ideas; the three-docks
pass explicitly skipped the mobile drawer; DAWN's references are desktop-first. Mobile
is being inherited, not designed — at 55, the weakest shipped surface.

**Mature means:** a written mobile grammar that DAWN designs against and screen passes
implement, with the same force as the three-docks law has on desktop.

### Workstreams

**4a. The mobile brief to DAWN (M, the next reverse-sync).** Author
`design_handoff/BRIEF-07-MOBILE-GRAMMAR.md` from production truth: what exists today
(bottom tab bar, drawer, safe-area handling in the top bar, the overlay-menu-under-1000px
law already in CHANGES.md) + the open questions only a design round can answer: what the
bottom edge means when a tab bar and a Vault dock compete; how the four-role rhythm
compresses (mobile gaps measured, not scaled); hero fact-docks on a 390px viewport
(stack? collapse to a strip?); thumb-zone rules for the docks; where the rail's
you-and-yours foot goes when there is no rail. Send via the SYNC contract; DAWN answers
with mobile reference frames per screen.

**4b. Mobile visual baselines NOW (S, before the grammar lands).** The Playwright
`mobile` project already exists — Lift 6 extends its coverage. Locking today's mobile
rendering means the grammar's arrival shows up as reviewable diffs, not vibes.

**4c. Implementation wave (L, gated on 4a's round).** The mobile pass over the shell +
the five highest-traffic screens, as its own wave with the same restraint rules as the
docks pass.

**Rule (standing, added to SYNC.md):** every future screen pass states its mobile
behavior explicitly — "mobile: unchanged" is a legal answer; silence is not.

**Metric:** mobile p75 INP/LCP split (the vitals stream already tags nothing by
viewport — add `viewport_class` to the vitals beacon, one field, ADR-922-compatible
since it is still account-free), mobile journey conversion (J1 mobile vs desktop).

---

## Lift 5 — One render path (kill the dual truth)

**The gap.** Marketing pages currently have up to three render rungs (published doc →
template → coded page). The DAWN rebuilds made the coded pages AHEAD of the templates —
the exact drift the three-rung chain was designed to survive, now inverted. Two sources
of truth is a standing invitation for the next drift.

**Mature means:** per marketing route, the Puck template is the single authored truth;
the coded page either IS a thin data/shell wrapper around `BlockRender` or does not
exist. The conversion map (BUILD-LIST kit section + the 2026-08-04 conversion-order
note) is the sequence.

### Workstreams

**5a. Block parity batch (⏳ in flight).** The shared DAWN block set + block-library
restyle + live-value bindings (the `Tiers`/`livePriceKey` pattern extended to the
two-band pricing layout; blocks own their JSON-LD, per the Accordion precedent).

**5b. Template regeneration, in the mapped order (M per page).** about → the-lab →
the-quest → spaces → the-community (needs its missing DAWN reference first — flagged in
the reverse-sync) → home → pricing (partial only, live bindings, never frozen figures).

**5c. Retire the coded bodies (S per page, the actual de-dualing).** Once a route's
template is visually equivalent (Lift 6 proves it): the coded page keeps ONLY metadata +
server-data fetch + `<BlockRender>`; its bespoke JSX body is deleted. `EDITABLE_PAGES`
grows to match. A `check:render-path` guard asserts no gated slug carries a bespoke body
beyond the allowed shell (grep-class check, same harness as Lift 2).

**5d. Seeker articles, second wave (M, SEO-gated).** Blocked on the `DawnHowToSteps`
block emitting HowTo JSON-LD; converting before that is a net SEO loss on the
highest-intent pages. Then the eight slugs join `EDITABLE_PAGES` with a shared
`templates/article.ts` seed.

**Metric:** routes on single-path (target: all gated slugs + articles), `check:render-path`
green, zero template-vs-coded visual diffs in the snapshot suite.

---

## Lift 6 — Visual regression at the real surface area

**The gap.** 5 routes × 2 viewports, light mode only, manual dispatch. The remodel's
blast radius is the whole site in four render states.

**Mature means:** the suite covers every templated marketing page + the load-bearing app
states, in all four render states, on both viewports, and runs automatically where it
can be trusted.

### Workstreams

**6a. Surface expansion (M).** `test/e2e/visual.spec.ts` grows to: all EDITABLE_PAGES
routes (+ articles as they convert) · the app shell trio (feed, a room, settings) via a
seeded storage-state login (a beta test account; credentials via CI secret, 🔴 owner
creates the account) · the Space console. Component-level: a Ladle/story pass is
DEFERRED (a second render harness is real maintenance; page-level covers the kit
transitively for now — revisit if per-component drift bites).

**6b. Four render states (S).** Parameterize the suite over `.dark` × `data-skin`
(default/midnight) by stamping class/attribute pre-navigation; 4 snapshot sets per
surface. This is also Lift 3's dark-contrast audit made permanent.

**6c. Cadence + trust (S).** Keep capture-on-runner (`update_baselines` mode, artifact
→ commit — the sandbox cannot reach deploys; already built). Auto-run the COMPARE job on
PRs that touch `app/globals.css`, `components/**`, or `lib/page-editor/**` via the
paths-filter pattern db-tests uses, against the PR's Vercel preview URL (the
`nextCommitStatus` deployment URL; wire via the deployments API in the workflow).
Masking rule for dynamic regions (live stats, presence) via `mask` selectors so the
suite stays quiet-by-default. Flaky-surface policy: a surface that flakes twice gets a
mask or a wait fix in the same week, never a deletion.

**Metric:** surfaces × states covered (today 10 captures → target ~120), suite
flake-rate <2%, required-check status (🔴 owner flips it required once green two weeks).

---

## Lift 7 — Vitals budgets read every round

**The gap.** Field RUM ships (ADR-922) but nobody reads it; there are no budgets, so
"performance is UX" is a sentiment, not a control.

**Mature means:** per-template p75 budgets with a breach protocol, reviewed in every
DAWN round, wired to the same templated-path names the vitals already record.

### Workstreams

**7a. Budgets (S).** `lib/analytics/vitals-budgets.ts`: per template-class budgets —
marketing LCP ≤ 2.0s / INP ≤ 200ms / CLS ≤ 0.1; app shell LCP ≤ 2.5s / INP ≤ 200ms;
heavy operator surfaces INP ≤ 300ms. Budgets live in code so the review reads one file.

**7b. The readout (M).** `vitals_p75(days, path_template)` RPC over
`interaction_events kind='web_vital'` + an `/admin/insights` Vitals panel: p75 per
templated route vs budget, ✅/⚠️/🔴, 28-day trend. Same panel hosts Lift 1's journey
funnels — one insights surface, not two.

**7c. The round ritual (S, contract change).** SYNC.md's outbound handoff includes the
vitals table; a 🔴 budget on any surface a round redesigns is a stated constraint for
that round ("this page must get lighter, not heavier"). Breach protocol: two consecutive
🔴 weeks on a surface = a perf task enters the next wave ahead of new screens.

**7d. Guard the collector (S).** `SAMPLE_RATE` drops to 0.25 past ~10k daily loads
(ADR-922's own note); add the `viewport_class` field (Lift 4). Keep it account-free —
that invariant is the consent posture.

**Metric:** budget table all-green; time-from-breach-to-fix.

---

## Lift 8 — Interaction-state inventory (the second half of every component)

**The gap.** The system specifies rest states beautifully; loading, empty, error,
optimistic, and disabled states are folk knowledge per component. GateNotice and
EmptyState prove the house can codify states — they are the seeds, not the exception.

**Mature means:** every kit component documents and renders its full state set, and new
components cannot ship without one.

### Workstreams

**8a. The state contract (S).** `docs/INTERACTION-STATES.md`: the canonical state set
(rest · hover · active/pressed · focus-visible · loading · empty · error · disabled ·
optimistic-pending) and which are REQUIRED per component class (an input needs error;
a card does not). The DAWN `.press`/`--motion-*`/`--ease-*` tokens are the only sanctioned
motion vocabulary for state transitions.

**8b. Kit sweep (M).** For each `components/ui/*` primitive + the marketing kit: add the
missing required states — skeleton/`aria-busy` loading for async surfaces (compose the
existing shimmer utilities), inline error styling on form primitives (`aria-invalid`
already wired? verify), pressed states via `.press`, disabled affordances that keep
contrast (Lift 3's script checks disabled pairs too). Each addition lands with a test
asserting the state renders (the primitives' 30-test pattern).

**8c. Optimistic-UI conventions (M).** The repo already does optimistic toggles in
places (reactions, practice toggles); write the convention down (pending style =
`.dimmed` + no layout shift; reconcile-failure = toast + revert) and align the existing
sites to it.

**8d. The gate (S).** Extend `check:elements` (the existing element-contract script):
a new `components/ui` primitive must ship a colocated test exercising its required
states, else CI fails. Machine-checkable proxy: test file exists + names the required
state strings.

**Metric:** kit components at full required-state coverage (inventory table in
INTERACTION-STATES.md, updated per sweep).

---

## Sequencing — how the lifts interleave with the build

The lifts are not a new track; they mount onto the waves already running.

| When | Ships | From lifts |
|---|---|---|
| **Now** (current wave, PR #2014 era) | Block parity + library restyle (⏳) · ratchet harness + contrast script + research protocol doc + budgets file + state contract doc (all S, no dependencies) | 5a · 2a · 3a · 1b-doc · 7a · 8a |
| **Wave +1** | Template regeneration (about → lab → quest → spaces) · radius codemod sweep · axe in e2e · visual suite states ×4 · vitals readout panel · mobile brief to DAWN | 5b · 2b · 3b · 6b · 7b · 4a |
| **Wave +2** | Coded-body retirement + `check:render-path` · UnderlineTabs + ProgressTrack sweeps · visual suite auto-compare on PRs · kit state sweep · first moderated test round (🔴 recruiting) | 5c · 2b · 6c · 8b · 1b |
| **Wave +3** | Seeker articles (HowTo block) · home + pricing-partial conversion · RowCard/EntityCard sweeps · mobile implementation wave (gated on DAWN's mobile round) · focus/reduced-motion audit | 5d · 2b · 4c · 3c/3d |
| **Standing, every DAWN round** | Vitals table + research findings in the outbound handoff; mobile behavior stated per screen pass; ratchet counts only shrink | 7c · 1c · 4-rule · 2 |

**Owner actions collected (the full 🔴 list):** recruit 5 test users/quarter (1b) ·
create the seeded beta test account + CI secret for app-state snapshots (6a) · flip
visual + adoption + contrast checks to required in branch protection once green (2a/3a/6c) ·
the Auth leaked-password toggle (3-note) · the /the-community design gap goes to DAWN
(5b dependency).

**The grade math.** Lifts 1 (40→75), 3 (60→85), 4 (55→80), and the craft spend from
Lifts 2+5+6 (65→85) move the weighted total from 74 to the low 90s — with every point
held by a gate rather than a memory.

---

## Addendum 2026-08-04 — the Road to 100: verified baselines and the corrected work order

> Four-technique verification round (quantitative census · DAWN's own adherence config ·
> render-level diffing · hygiene pass) run after the wave-2 polish. This addendum corrects
> the plan's assumptions with measured numbers and fixes the sweep order by payoff.

### Frozen ratchet baselines (Lift 2's `check:adoption` seeds — measured, reproducible)

| Baseline key | Count | Pattern basis |
|---|---|---|
| `literal-radius` | **5,543** (4,474 steps + 1,069 full; token adoption 1.9%) | `rounded-(sm|md|lg|xl|2xl|3xl|full)\b` |
| `shadow-literals` | **684** (535 are `shadow-sm`) vs 33 lift-* adopters | `\bshadow-(sm|md|lg|xl|2xl)\b` |
| `white-black-literals` | **382** (`app/page.tsx` alone: 29) | `-white\b|white/\d+|-black\b` |
| `subtle-tiny-type` | **832** genuine sub-AA pairings (2xs/3xs) | `text-subtle` within 80 chars of `text-(2xs|3xs)` |
| `raw-button-bg` | **494** (the docs' "~18" was wrong by 27×; corrected here) | `<button` + `bg-primary` within 500 chars |
| `adhoc-progress` | **52** in 42 files; ProgressTrack adopters: **0** | `rounded-full…style={{ width:` |
| `bespoke-cards` / `bespoke-rows` | **35** / **15** files (EntityCard 42 / RowCard 3 importers) | `*-card.tsx` / `*row*.tsx` |
| `handrolled-tabs` | **3** genuine strips + 4 pill consoles (owner-ruled) | `border-b-2` selected-tab |

### The corrected sweep order (payoff per effort — supersedes the earlier P3-first framing)

1. **shadow → lift codemod** (S): one mechanical rename flips the app's depth language from
   4.6% to near-total adoption; zero box-model risk. The single biggest visual win on the board.
2. **white/black literal pass** (M): the only *bug* class — hardcoded monochromes ignore theme
   generations (invisible text on light generations). 382 sites, five directories hold 110.
3. **subtle+tiny AA rule** (M): "text-subtle may not pair with 2xs/3xs" as a check + sweep of
   832 sites concentrated in events/admin/spaces/feed. Changes perceived craft of every list.
4. **ProgressTrack adoption** (S): a shipped primitive earning nothing; 52 bars retire it.
5. **Radius roles** (L): biggest number, worst ratio (per-site role judgment, few-px deltas) —
   ratchet-and-hold at 5,543, spend adoption inside screen passes rather than as its own wave.

### Gate corrections (found by the round, all cheap)

- **`check:tokens` scope hole**: `ROOTS = ['app','components']` — `lib/` is entirely ungoverned
  and holds the largest hex concentration (95). Add `lib` to ROOTS with a reasoned allowlist
  (email templates, spotlight/theme-studio token sources are legitimate).
- **Raw-px gap** (the one real finding from DAWN's adherence config): the guard bans `text-[Npx]`
  only; arbitrary sizing px (`h-[18px]`) passes — ~150 in-app instances. Extend the pattern with
  an icon/OG/print allowlist. The rest of DAWN's lint config is over-strict against its own
  components (verdict recorded: not CI material; TypeScript owns our port's contracts).
- **Preview e2e validity**: Vercel Deployment Protection serves its interstitial to Playwright —
  suites were testing the wall (viewport-tall captures, `/login` redirects). Bypass header now
  wired; 🔴 owner creates the Protection Bypass secret in Vercel + mirrors it as the
  `VERCEL_AUTOMATION_BYPASS_SECRET` Actions secret. Until then, e2e verdicts are valid against
  production only.

### Hygiene state (done this round / carried)

Done: dead utilities + keyframes and the ADR-922 stale CSP entry removed; bundle-era
`design_handoff` root duplicates dropped for the canonical `dawn/tokens/`; RETHEME-PLAN gains
its historical banner. Carried: 6 zero-reference images in `public/images/site` (possible
DB-authored page-doc references — verify against published Puck docs before deleting);
`va.vercel-scripts.com` in script-src looks stale but is an owner CSP call; `.mk-cream`/`.mk-ink`
/`.rank-dot`/`tap-target`/`text-scaled-*` stay as await-adoption contract classes.

### Primitive adoption scoreboard (the round's truth of "implemented globally")

Landed at scale: EmptyState 244 · SectionHeader 141 · StatCard 114 · EntityCard 42.
Shipped-but-idle: ProgressTrack 0 · StreakMeter 0 · Meter 1 · Counter 2 · GateNotice 3 —
the fabric phase's first targets, now with exact counts to ratchet against.
