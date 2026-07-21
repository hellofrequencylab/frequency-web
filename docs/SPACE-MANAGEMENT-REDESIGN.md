# Space Management Redesign — Plan of Record

**Status:** Approved (2026-07-21). Consolidates the Space `/manage` area into one dashboard + four pillars,
with Resonance as the communications center, on a binding **essential-up-front / advanced-off-by-default**
standard. Decision log: **ADR-796** (`docs/DECISIONS.md`). Basis: a 9-agent code survey of the current
system + two deep-research passes (competitor IA + feature-adoption). A presentation of this plan lives as an
artifact; this doc is the source of truth that drives the phased build.

---

## 1. North star

> Fewer, deeper features — not more. Organize everything around **one member record** and **one inbox**, show
> only the **essentials up front**, and let operators **activate advanced features on demand** through a
> per-area control board. Complexity, not missing features, is what kills adoption.

Three principles, binding across the whole business-admin section:

1. **The member record is the spine, and the profile IS the inbox.** One timeline per person spanning every
   channel (email, texts, site messages/DMs, event attendance, program adoption), with a composer in place.
2. **Essential up front, advanced off by default.** Each area shows its primary features immediately; advanced
   features are hidden and OFF until the operator turns them on from that area's **control board** (progressive
   disclosure, ≤2 levels deep — never bury the frequent stuff).
3. **Dashboard is the home.** A command center with actionable metrics and inline CTAs, not another report.

## 2. Target information architecture

**One home + four pillars + a demoted Settings** (nav stays shallow; research caps top-level at 5–7):

| Area | Absorbs | Primary (up front) | Advanced (off by default, control board) |
|---|---|---|---|
| **Dashboard** (home) | — | Revenue 30d · member deltas · activity feed · "needs attention" queue with inline CTAs | Custom widgets, date ranges |
| **Resonance** | People + CRM + **Marketing** + Inbox | Member-360 + unified inbox · broadcast to a segment · 2–3 automation templates · lead capture | Sales pipeline · "tagged → do Y" rule · advanced audience facets · SMS/WhatsApp-from-CRM |
| **Offerings & Money** | commerce | One console: booking · memberships · donations · tickets · shop + earnings | Per-offering fine controls, payout config |
| **Content & Programs** | content | practices · journeys · recordings · images | Attach seam, RSS/podcast, metadata |
| **Settings** (disclosed menu, not a pillar) | identity/admin | brand · team · plan & billing | integrations · danger · advanced theme |

**Decision — Shape A (approved):** Marketing folds **into** Resonance as "Reach" (broadcast + capture launch
from a segment, where the member lives). Marketing ceases to be a top-level tab.

## 3. The communications center (Resonance)

The backbone already exists — this is largely composition, not a new system:

- **One log** (`contact_interactions`), **one recorder** (`recordContactInteraction`), and a **stitcher**
  (`listInteractionsForPerson`) that already merges contact + profile + network_contact touches. Only the
  admin person view uses the stitch today; the Space surfaces read the narrow `'contact'` slice.
- **Read unification** (Phase 0): point the Space contact card + inbox at the person-stitch so DMs and SMS
  already logged against the member's profile appear.
- **Log everything** (approved, Decision 4): add `recordContactInteraction` hooks for the events not yet
  captured — **event attendance** (RSVP / check-in), **program adoption** (enrollment / membership / journey),
  **site messages/DMs**, **SMS**, and **transactional notifications** (via the notification router).
- **Member-360**: identity + tags + membership/purchase history + the full cross-channel timeline + a composer,
  in one surface — the CRM contact card and the inbox thread are the same place.

## 4. Keep / simplify / cut (per the evidence)

- **KEEP (build well):** unified member record + tags + notes; unified inbox; broadcast email to a segment;
  2–3 pre-built automation templates (welcome · onboarding · re-engage); tag-based saved segments; one minimal
  lead-capture that auto-tags; one commerce console; one content console.
- **SIMPLIFY / hide (off by default):** the sales pipeline (also currently read-only — fix create/move/win-lose,
  then gate off by default); a single "tagged → do Y" rule; advanced audience facets; SMS/WhatsApp-from-CRM.
- **CUT (approved, Decision 3):** the blank-canvas **automation rule builder** (ships broken — the only rule
  type never sends — and is named bloat); multiple audiences/lists; lead scoring; predictive/AI segments;
  forecasting/quotas. Replace the builder with the templates above.

## 5. Growth tools to Space scope (approved, Decision 5)

Bring the crew-only "entry-point" powers (branded flyer, A/B links, QR) **down to Space scope**, and surface
per-Space **attribution** (the door/channel is already stamped immutably on every sealed lead). This is the
clearest "grow my membership" gap; the engine exists, it's just scoped to crew/platform today.

## 6. Naming cleanup (do early)

"funnel" names 3 systems, "sequence" 2, "journey" 3. Rename the platform funnels out of collision; pick one
drip engine (space automation vs platform nurture); disambiguate journey (member Journeys vs CRM timeline).

## 7. Phased build-out

| Phase | Ships | Reuses |
|---|---|---|
| **0 · Foundation** | Read-layer comms unification (Member-360 shows all channels) · add logging hooks for event attendance / program adoption / site messages · disable the broken automation path · fix or gate the read-only pipeline · naming cleanup | `contact_interactions`, `listInteractionsForPerson`, inbox threading |
| **1 · Dashboard + Comms Center** | Command-center home · Member-360 profile · unified inbox (turn on inbound email) · track every send via the notification router | threaded inbox, send-and-log pipeline, email tracking fold |
| **2 · Reach** | Fold Marketing into Resonance · broadcast-from-segment · 2–3 automation templates · one lead-capture · crew growth tools + attribution to Space scope | campaigns cron, drip-runner, segments/audiences, entry-point engine |
| **3 · Offerings & Money** | One commerce console + earnings · close money-before-billing defects · optional pipeline as a People view | commerce libs behind `billingLive()` |
| **4 · Content & Programs** | One content console · wire Airwaves attach seam · recording metadata + custom-page editing | recordings/shows/loom CRUD, publish-gate |
| **5 · Settings demotion** | Settings → disclosed menu · advanced features off-by-default behind each area's control board | `SPACE_MODULES` + Module Manager |

## 8. The control-board standard (the spine of every area)

Every area exposes a **control board**: primary features render immediately; advanced features are listed OFF
with a one-tap activate. This reuses the locked `SPACE_MODULES` catalog + Module Manager (which already toggle
per-Space features), extended with an `advanced` marking so advanced modules default OFF and cluster into the
board. The MENU-CONTRACT (ADR-553) stays intact — this is a data + presentation change, not a parallel registry.
