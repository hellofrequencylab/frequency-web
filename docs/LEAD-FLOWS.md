# Lead flows & personas

**The intake spine.** We ask every arriving visitor one question (*who are you?*) and
carry that answer (their **persona**) through everything: it routes their marketing track,
branches the beta induction, and is stamped on the member so the site and Vera can tailor
the experience forever. **Lead flows** are the assignable surfaces that ask it.

> Source of truth: this doc + the code. Decision + rationale: [ADR-125](DECISIONS.md#adr-125-personas--lead-flows--the-self-identified-intake-rework).
> Operator "how to assign a flow / read the segments" guidance lives in Notion (Training & Strategy), linked back here.

---

## The two layers

| Layer | What it is | Lives in | Job |
|---|---|---|---|
| **Lead flow** | A named, shareable top-of-funnel you drop behind any entry point (QR, IG bio, partner button, city page) | `lib/onboarding/lead-flows.ts` · `/start/<flow>` | Frame the visit → ask the persona → record the lead → route into the induction |
| **Persona** | WHO the visitor said they are: the self-identified fork | `lib/onboarding/personas.ts` | Routes the marketing track · branches the induction reel · stamped on the member |

The persona is the **through-line**: captured in the lead flow (if used), re-confirmed in the
induction's Welcome beat, and persisted on the profile.

---

## Personas

Five types. **Visitor is the default fall-through**; the rest are the forks worth a track.

| Persona | id | "Who am I" | Marketing track (what we show) | Tag |
|---|---|---|---|---|
| 🧍 Visitor / regular member | `visitor` | "I want to find my people" | Feed · circles · events · why join | `persona_visitor` |
| 🛠️ Practitioner | `practitioner` | "I have something to offer" | Host & build programs · grow a following · worldwide marketplace | `persona_practitioner` |
| 🏪 Partner business | `partner` | "I run a local spot" | Loyalty rewards · gamified foot traffic · local discovery | `persona_partner` |
| 🤝 Community builder / volunteer | `builder` | "I want to help build it" | Lead a circle · welcome crew · earn guide | `persona_builder` |
| 💡 Investor / Lab champion | `investor` | "I want a Frequency Lab in my town" | A Lab in your town · ground-floor partner · build the movement | `persona_investor` |

Each persona's full copy (pitch, the persona-true tour reel, the track's three bullets, and
its learn-more link) is authored in `lib/onboarding/personas.ts`. The reels **reuse the three
product renders** (feed · circles · events) with persona-true captions. No new components.

Every persona's `marketingTag` **must be registered** in `lib/traits/registry.ts`
(`assignTag` throws on unknown keys). They're `category: 'marketing'`, `systemManaged: true`.

---

## Lead flows

Authored in `lib/onboarding/lead-flows.ts`. Each has a slug, a splash, the personas to
surface, and a source. Starter set:

| Flow | URL | Personas | Email gate | Use |
|---|---|---|---|---|
| `welcome` (default) | `/start` → `/start/welcome` | all five | no (router) | General front door |
| `event` | `/start/event` | all five | yes (capture) | In-person / QR at an event |
| `partner` | `/start/partner` | all five, opens on **Partner** | yes (capture) | Local-business outreach |

- **`captureEmail: false`** → a pure router: the persona rides into the induction on the URL;
  the induction's own deferred sign-in collects the account at the end.
- **`captureEmail: true`** → asks for an email and records a **nurture lead** (`captureLead` →
  `contacts`) *before* routing, so we keep the signal even if they bounce.

**Assign a flow anywhere** by linking to its URL: `https://…/start/<flow>`. Attribution
(utm/referrer/source) still flows through the existing acquisition system (ADR-095); the flow's
own `source` is stamped on the lead.

---

## Data: where the persona lands

| Stage | Where | Shape |
|---|---|---|
| Lead (pre-signup, capture flows) | `contacts.meta` | `{ persona, lead_flow, persona_captured_at, acquisition }` |
| Carried through induction | cookie `fq_persona` (30d, lax) | survives the deferred sign-in round-trip |
| Member (at completion) | `profiles.meta.persona` (top-level) | `'visitor' | 'practitioner' | …` |
| Member segmentation | `member_tags` | one `persona_*` tag (governed, queryable) |

`meta.persona` is read broadly by the site/Vera; the tag is the queryable segment. Both are
written by `app/onboarding/beta/actions.ts` (`writeBetaInduction` + the returning-member
`mergeBetaInduction`), mirroring the beta-cohort tag + `fq_beta_seq` pattern.

---

## How it relates to beta sequences

Beta **sequences** still exist and still tag cohorts. They skin the induction copy by
*which link you clicked*. They are now DB-built versions managed at `/pages/sequences`
plus the reserved `beta-default` base flow (the three code templates retired; see the
onboarding-splash overhaul ADR). **Persona is an orthogonal axis**: it's what the
visitor *told* us they are. A member can have both a `beta_*` cohort tag and a
`persona_*` tag. Lead flows generalize the *sequence-splash* idea (an assignable entry
surface) but ask the question instead of guessing.

---

## Extending it

- **A new persona** → add to `lib/onboarding/personas.ts` (id in `PERSONA_ORDER` + a
  `Persona`), register its `persona_*` tag in `lib/traits/registry.ts`, done. The picker, the
  induction reel branch, and persistence all read the catalog.
- **A new lead flow** → add a `LeadFlow` to `lib/onboarding/lead-flows.ts`; `/start/<slug>` and
  its static params come for free.
- **Dedicated track pages** (practitioner tools, the loyalty program, the Lab pitch) are the
  natural next step. Today each persona's `track.learnMoreHref` points at the closest existing
  pillar page. Swap them to bespoke pages when built.
- **Operator-assignable flows** (a DB layer over `lead-flows.ts`, `vera_config`-style): the
  deferred next phase; callers won't change.
