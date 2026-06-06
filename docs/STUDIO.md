# The Studio — one creation tool for every entity

> **What it is:** the single, familiar **make-something window** used everywhere on
> the site. A journey today (ADR-142); circles, practices, and events next. This doc
> is the **best-practice way to bring them all onto it** — the durable plan.
>
> Authority: running code + `supabase/migrations/` > this doc. Companion: ADR-142,
> ADR-143; [PAGE-FRAMEWORK.md](PAGE-FRAMEWORK.md) §9.

## The answer up front

**Compose, don't configure.** The Studio is *not* a generic form-engine driven by a
schema. It's the same philosophy as the page framework (one shell · a few templates ·
a kit of primitives): a **shared window shell** + a **kit of studio building blocks**,
and each entity's builder is **composed** from those blocks — not described by a config
object. Entities differ too much (events have dates + recurrence, circles have geo +
topic, practices have pillar + cadence + a long body) for a one-size form schema to fit
without becoming its own framework to maintain. Shared *look, feel, and interactions*;
bespoke *fields*.

Three shared things make every builder feel identical:

| Layer | What | State |
|---|---|---|
| **Shell** | `StudioWindow` — overlay panel, chrome, Esc/backdrop close, scroll-lock, sticky footer | ✅ built (ADR-142) |
| **Kit** | the building blocks each builder composes (identity, fields, autosave, footer, launcher) | ⏳ extract from journey |
| **Registry** | a thin map: entity → label · icon · launch · who-can-create — powers a universal "Create" + one place for gating | ⏳ |

## 1. The shell (built — keep it)

`components/studio/studio-window.tsx`. An entity passes its `eyebrow`, its tools
(children), and its `footer`. Launchable in place **and** deep-linkable to a real URL
(full-screen standalone). Don't re-create chrome; mount this.

## 2. The kit — extract these from the journey builder

The journey builder (`components/studio/journey/*`) already contains the reusable
parts. Promote them to `components/studio/kit/` so the next entity gets them for free:

- **`StudioIdentity`** — emoji + accent + title + summary header (the "give it a face"
  row). Accent tokens live in `lib/studio/accents.ts`. Journey/circle/practice reuse as-is;
  events may swap the emoji for a date chip.
- **`StudioSection` / `StudioField`** — the labeled field-row grammar (the `text-2xs`
  uppercase label + control), so every builder's fields read the same. No bespoke `<label>`.
- **`useStudioDraft`** — the autosave engine: optimistic local state + debounced
  `save(patch)` + the `idle / saving / saved` indicator + error resync. Every builder gets
  "autosaves as you go" by using this hook with the entity's `save` action.
- **`StudioFooter`** — the save-state line + primary action slot (Create / Share / Done).
- **`StudioLaunchButton`** — generalize `NewJourneyButton`: opens the window in place for
  *create*, navigates to the deep link for *edit*. Takes a registry key.
- **`SortableList`** — the journey's drag-reorder + up/down list (HTML5 DnD, no dep), reusable
  for any ordered child (event agenda, circle pinned items).

> Rule: a builder is **`StudioWindow` + kit blocks + that entity's few bespoke fields**.
> If you're writing chrome, an autosave loop, or a label-row from scratch, stop and use the kit.

## 3. The registry — launch + gating in one place

`lib/studio/registry.ts`: one entry per entity.

```
{ entity: 'practice', label: 'Practice', icon: Sparkles,
  canCreate: (viewer, scope) => boolean,   // resolves caps for THIS instance
  launch: 'modal' | 'route', href: (scope) => string }
```

This powers (a) a **universal "Create" affordance** (a global `+` that lists exactly what
*you* can create here) and (b) **one source of truth for create-gating**, so we never
re-implement "who can make one" per surface.

## 4. Per-instance settings + gating (the "admin create setting per instance")

Each builder receives a **resolved capability set** for the specific instance and shows
tools accordingly — reusing the existing policy layer (`lib/core/capabilities.ts`), never
re-deciding gating in the UI:

| Entity | Create gate | Edit gate | Admin-only tools |
|---|---|---|---|
| **Journey** | any member (own) | author | publish-to-library = Crew |
| **Practice** | any member | creator / `admin.access` | reward (`reward_zaps`), template/visibility flags = admin |
| **Circle** | member (with a topic) / host+ (managed) | `circle.editSettings` | hub/nexus assignment, status = host+/staff |
| **Event** | Crew+ (member of the circle) | `event.editSettings` | cancel = community ops |

The builder calls the resolver, gets `caps`, and renders the admin tools only when
`caps` allow — so the same window adapts to member / host / admin without forks.

## 5. Per-entity field maps (what each builder composes)

| Entity | Identity | Bespoke tools | Persists via |
|---|---|---|---|
| **Journey** ✅ | emoji · accent · title · summary · intro | path (SortableList of practices) · per-step cadence/note · Pillar balance · share | `lib/journey-plans.ts` + journeys/actions |
| **Practice** | emoji/icon · title · summary | Pillar + sub-category · cadence · long **body** (markdown) · tags · (admin) reward | `lib/practices.ts` + practices/actions |
| **Circle** | emoji/cover · name · about | type (in-person/online) · topic (channel) · place (geo + "use my location") · member cap | `admin/actions.ts` createCircle + circles/admin-actions |
| **Event** | cover · title · description | when (start/end) · recurrence · place · host circle · RSVP/check-in settings | `events/actions.ts` createEvent + events/admin-actions |

All four data layers + server actions **already exist** — the work is the builder UX, not the backend.

## 6. Migration order (one entity per PR, lowest risk first)

1. ✅ **Journey** — the reference instance (ADR-142).
2. **Foundation PR** — extract the kit (§2) + add the registry (§3); refactor the journey
   builder onto the kit so it's the proof, no behavior change.
3. **Practice** — closest to journey (members already create them; pillar/cadence/body).
   Replace the inline-create + `/practices/[id]/edit` page.
4. **Circle** — adds geo + topic; high leverage (the member-create flywheel). Replace
   `NewCircleCompose` (CreateModal) + inline edit.
5. **Event** — adds date/recurrence; host+. Replace `/events/new` + inline edit.
6. **Universal Create** — a single `+` driven by the registry, surfaced in the shell.

Each PR: extract any newly-shared block → compose the entity's tools → wire into
`StudioWindow` → replace the old surface → keep the server actions (re-checked) +
a no-JS fallback. Retire `components/create-modal.tsx` once circles move (§2 supersedes it).

## 7. The contract (so it stays one tool)

- **Mount `StudioWindow`; compose the kit.** No bespoke chrome, autosave loops, or label rows.
- **Gating comes from `lib/core/capabilities.ts`**, surfaced via the registry — never re-decided in UI.
- **Autosave is the default** (`useStudioDraft`); server actions re-check ownership + caps.
- **Tokens only** (accents from `lib/studio/accents.ts`); no hardcoded hex, no `text-[10/11px]`.
- **Deep-linkable**: every builder also lives at the entity's route, so it opens standalone.

That's the whole plan: a new entity's "create/edit" becomes *compose the kit against an
existing data layer*, not a new screen.
