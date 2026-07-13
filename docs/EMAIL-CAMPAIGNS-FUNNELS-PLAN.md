# Email campaigns & funnels — a simple console plan

> **Goal.** One clear place to manage **Campaigns** (send now) and **Funnels** (triggered journeys),
> with drag-and-drop ordering, a guided best-practice setup (Vera or manual), a visual flow view, and an
> email editor that always tells you which campaign/funnel/step you are editing. Built on the pieces we
> already have, not a rebuild.

## The answer up front

We already own every hard part — a block email editor, exact per-campaign analytics, an ordered drip
model, a funnel object with a drop-off rollup, a durable send queue with consent gating, and native
drag-reorder patterns. What's missing is **one console that unifies them, a guided front door, a visual
flow, and context in the editor.** The plan is four moves:

1. **One console, two objects.** Collapse the scattered surfaces (`/admin/marketing/*`, `/admin/beta`
   Campaign tab, `/admin/growth/funnels`) into a single **Messaging** console with exactly two things a
   user creates: a **Campaign** (one email, sent now or scheduled) and a **Funnel** (a triggered journey
   of emails over time). Everything else is a detail inside those two.
2. **A guided front door.** "New" opens a short best-practice flow: pick a goal, answer 3–4 questions,
   then choose **Let Vera draft it** or **Build it manually** — seeded from a best-practice template, never
   a blank page.
3. **A visual flow with drag-and-drop.** A Funnel renders as a clean vertical flow of nodes (trigger →
   emails → waits → branches → goal); reorder by dragging; edit any node's settings in a side panel.
4. **Context everywhere.** The email editor gets an **info bar** naming the Campaign/Funnel, the step,
   the trigger, and the timing — so a writer always knows where they are.

## What we already have (so we build, not rebuild)

| Piece | Where | Reuse for |
|---|---|---|
| Block/canvas **email editor** (entity-blocks, compile → `compiled_html`, merge tags, test-send) | `components/admin/email-studio/*` | The email node editor; add the info bar + DnD. |
| **Campaigns** (one email, `block_json`, schedule, approval, analytics) | `campaigns` table, `lib/studio/campaigns.ts` | The Campaign object, unchanged. |
| **Ordered drip sequences** (steps by `step_order` + `delay_hours`, enrollment tracking, cron) | `nurture_*` (root), `space_drip_*` (Space) | The Funnel's email steps. |
| **Funnel object** (ordered stages, typed soft-links, per-persona templates, drop-off rollup RPC) | `funnels`/`funnel_stages`/`funnel_stage_links`, `lib/funnels/*` | The Funnel spine + flow view. |
| **Exact analytics** (opens/clicks/deliverability by `campaign_id`, timeline) | `lib/email-studio/analytics.ts` | Per-step + per-funnel stats. |
| **Send infra** (outbox queue, consent/suppression send-gate, approval gate, Resend webhook ledger) | `lib/queue/*`, `lib/beta/*` | Unchanged; every send routes through it. |
| **Native drag-reorder** patterns (no new library) | `components/spaces/crm/stage-editor.tsx` (closest), gallery + menu boards | Step + stage reordering. |
| **Empty workspace slots** already wired | `workspace.tsx` (`sendPanel`/`analyticsPanel`/`templateGallery`) | Drop the new panels in. |

**One cleanup this forces (worth doing):** the word "funnel" is overloaded across three unrelated
surfaces today — the Growth-OS `funnels` object, the legacy `entry_campaigns` mislabeled "Funnels" at
`/admin/marketing/funnels`, and the public `/for/<niche>` marketing doors. The console must own ONE
meaning of Funnel (the triggered email journey) and rename the others (Entry campaigns; Landing pages).

## What best practice says (and how we honor it)

| Finding | Source | How we apply it |
|---|---|---|
| A welcome/nurture series is **4–6 emails**, behavioral-triggered, personalized by how they joined. | [InboxArmy](https://www.inboxarmy.com/blog/welcome-email-series/), [Omnisend](https://www.omnisend.com/blog/email-marketing-funnel/) | Funnel templates ship as best-practice 4–6 step journeys, segmented by entry. |
| Welcome emails get **4x opens / 5x clicks** vs regular sends. | [InboxArmy](https://www.inboxarmy.com/blog/welcome-email-series/) | The guided flow leads with "Welcome series" as the default first funnel. |
| **Behavioral triggers** (signup, RSVP, purchase, went quiet) are the foundation. | [Omnisend](https://www.omnisend.com/blog/email-marketing-funnel/) | Trigger picker maps to our real `engagement_events` (`recordEngagementEvent`). |
| Visual builders: **clean nodes, settings in a side panel, yes/no branches obvious, start with 1–2 decision points.** | [Klaviyo](https://help.klaviyo.com/hc/en-us/articles/115003883992), [Munro](https://www.munro.agency/marketing-automation-visual-workflow-builder/) | The flow view is exactly this: minimal nodes, side-panel config, labeled branches, few decisions by default. |
| **Don't over-branch early** — it gets unmanageable. | [Aprimo](https://www.aprimo.com/blog/the-ultimate-guide-to-marketing-workflow-automation) | Funnels default to a linear path; branches are an opt-in "add a split" only when needed. |
| **A/B testing** beats generic best practice. | [InboxArmy](https://www.inboxarmy.com/blog/welcome-email-series/) | Leave a subject-line A/B seam in the email node (P3). |

## The model — one console, two objects (mapped to your 7 asks)

### 1 · Clear management console (ask #1, #4)

A single **Messaging** console (fold the Beta "Campaign" tab + `/admin/marketing/*` + growth funnels into
it). Two tabs, one shared Email library:

- **Campaigns** — a table of one-time sends. Columns: name, audience, status (a ✅ Sent / ⏳ Scheduled /
  ✏️ Draft / ⏸ Paused legend), sent/scheduled date, open & click rate. Reuses `CampaignsTable` +
  `getCampaignMetrics`.
- **Funnels** — a card list of triggered journeys. Each card shows the trigger, a mini flow preview
  (step dots), live enrollee count, and the drop-off rollup. Reuses `funnels` + `getFunnelRollup`.
- **Emails** — the shared library (`email_templates`) of reusable blocks, so a Campaign or a Funnel step
  starts from a template.

Status is always visible and color-legended (the DAWN ✅/⏳/⚠️/🔴 legend), so a user sees what's live at
a glance.

### 2 · Drag-and-drop ordering (ask #2)

Replace the email editor's up/down chevrons and the funnel builder's template-fixed order with **native
drag-reorder**, reusing the CRM stage-editor pattern (`components/spaces/crm/stage-editor.tsx`) — no new
library. Draggable in two places: **email blocks** inside an email, and **steps/stages** inside a Funnel.
Reorder persists through the existing ordering primitives (`moveRow` for blocks; `step_order` /
`funnel_stages.position` for steps).

### 3 · Guided best-practice setup, Vera or manual (ask #3, #6)

"New" opens a **3-screen flow**, never a blank canvas:

1. **Goal** — pick one: Welcome new members · Promote an event · Nurture leads · Re-engage the quiet ·
   Announce/broadcast. Each maps to a best-practice template.
2. **A few questions** — who it's for (segment), the trigger (for a Funnel), tone, and the one action you
   want. 3–4 fields, plain language.
3. **How to build** — two buttons:
   - **Let Vera draft it** → a NEW Vera tool generates the whole campaign or the full 4–6 email sequence
     (subjects + blocks + timing) from the answers, then drops you into the editor to review. (Today Vera
     only drafts 1:1 emails — this is the one net-new AI capability, `lib/ai/vera/tools.ts`.)
   - **Build it manually** → the same template pre-loaded, empty of copy, for you to fill.

Best-practice suggestions ride along: the template itself is the suggestion (a 5-email welcome series with
sensible delays), plus inline tips ("welcome emails see 4x opens — send the first within a minute").

### 4 · Visual flow view (ask #4, #5)

A Funnel renders as a **clean vertical flow** of nodes, top to bottom, per the research (minimal nodes,
side-panel config):

```
  ◉ Trigger  (someone joins)
  │
  �¦ Email 1  "Welcome"        · sent immediately
  │
  ⧗ Wait 2 days
  │
  �¦ Email 2  "Get started"
  │
  ◇ Branch   opened? ─ yes ─► Email 3a
  │                  └ no ──► Email 3b
  │
  ★ Goal  (booked / bought)
```

- **Nodes** stay clean (icon + label + one status line); clicking a node opens its **settings in a side
  panel** (audience, delay, branch condition) — the canvas never gets noisy.
- **Node types:** Trigger · Email · Wait · Branch (yes/no, opt-in) · Goal. Triggers bind to real
  `engagement_events`. Branches are labeled so the path is never a guess.
- Default funnels are **linear** (Trigger → Emails → Goal); "Add a split" introduces a branch only when
  wanted (best practice: few decision points).
- An **Email node** opens the block editor with full context (ask #7).

### 5 · Triggers & paths, editable (ask #5)

The trigger and every branch are first-class, editable nodes with a side panel. The trigger picker lists
the real events we already emit (joined, RSVP'd, purchased, went quiet, tag added). Branch conditions
reuse the automation condition grammar (`evaluateConditions`, ops eq/neq/exists/gt/lt over event context)
— so this is a UI over an engine we already run, not a new rules engine.

### 6 · Best-practice suggestions (ask #6)

Three layers, cheap to ship: **(a)** goal templates ARE the baseline best practice (4–6 email series,
sensible cadence); **(b)** inline tips at each step (timing, subject length, one-CTA rule); **(c)** a
"Review" check before publish that flags gaps (no subject, missing unsubscribe context, a 10-email series,
a first email delayed too long).

### 7 · Email editor info bar (ask #7)

Add a slim **context bar** above the email canvas showing, when the email belongs to a campaign/funnel:

> **Welcome Funnel** · Email 2 of 5 · sends **2 days after** Email 1 · audience **New members** · ✏️ Draft

It links back to the funnel flow and shows the step's trigger/timing so the writer always has orientation.
This pairs with the block-rail alignment already shipped. When an email is a standalone broadcast, the bar
shows the campaign + audience + schedule instead.

## Phased rollout (each phase shippable)

| Phase | Scope | Builds on |
|---|---|---|
| **P1 — Unify the console** | One Messaging console: Campaigns tab + Funnels tab + Emails library, status legend, disambiguate "funnel" naming. | `CampaignsTable`, `funnels` list, `email_templates`. Mostly wiring. |
| **P2 — Editor context bar + DnD** | The info bar (ask #7) + drag-reorder for blocks and steps (ask #2). | `email-canvas-editor.tsx`, CRM stage-editor DnD, `campaigns`↔`funnel_stages` link. |
| **P3 — Guided setup + templates + suggestions** | The 3-screen flow, goal templates (best-practice series), inline tips, pre-publish review (asks #3 manual, #6). | `lib/funnels/templates.ts`, new template seeds. |
| **P4 — Visual flow view** | The node flow (Trigger/Email/Wait/Branch/Goal) + side-panel config, editable triggers/branches (asks #4, #5). | `funnel_stages` + the automation condition grammar; a Wait/Branch node type on `funnel_stages.kind`. |
| **P5 — Vera generation** | The "Let Vera draft it" path: a Vera tool that generates a full campaign or sequence from the answers (ask #3 Vera). | `lib/ai/vera/tools.ts`, the voice primer. |

Order is deliberate: the console + context bar deliver value immediately over what exists; the flow view
and Vera generation are the ambitious end, not the prerequisite.

## The one-screen summary

- **Two objects, one console:** Campaign (send now) and Funnel (triggered journey). Everything else is a
  detail inside them.
- **Guided front door:** goal → a few questions → Vera drafts it or you build it, from a best-practice
  template, never a blank page.
- **Visual flow:** clean nodes, side-panel settings, obvious branches, linear by default — drag to reorder.
- **Context everywhere:** the editor's info bar always names the funnel, step, trigger, and timing.
- **All on rails we own:** campaigns, drips, the funnel object, exact analytics, the send-gate, and a
  proven drag pattern. The net-new pieces are the guided flow, the flow view, and one Vera tool.

## References

- Current system: `docs/COMMS-CRM-ARCHITECTURE.md`, `docs/GROWTH-OS-BUILD-PLAN.md`,
  `docs/OPERATOR-FUNNELS.md`, `docs/AI-VERA.md`, `docs/EMAIL-EDITOR-PLAN.md`.
- Code spine: `lib/studio/campaigns.ts`, `lib/automations.ts`, `lib/nurture/*`, `lib/spaces/automation*`
  + `drip-*`, `lib/funnels/*`, `components/admin/email-studio/*`, `lib/email-studio/analytics.ts`,
  `components/spaces/crm/stage-editor.tsx` (the DnD pattern).
- Voice + naming: `docs/CONTENT-VOICE.md`, `docs/NAMING.md` (resolve the "funnel" overload here).
