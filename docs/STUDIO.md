# The Studio: one creation tool for every entity

> **What it is:** the single, familiar **make-something window** used everywhere on
> the site, plus the **kernel** every wizard, review board, and edit re-entry now
> derives from. This doc is the durable plan and, from ADR-986, a **locked contract**.
>
> Authority: running code + `supabase/migrations/` > this doc. Companion: ADR-142,
> ADR-143, **ADR-986**; [PAGE-FRAMEWORK.md](PAGE-FRAMEWORK.md) §9,
> [EDITING-SYSTEM.md](EDITING-SYSTEM.md) (ADR-450 is this kernel's consumer).
>
> **Status legend:** ✅ built · ⏳ in progress · 📐 designed, not built · 🔴 gap.

## The answer up front

**Declare the fields, compose the rest.** ADR-986 settled where the line sits, after a
survey found four wizards sharing no code and eleven creatable entities with none:

- **What a thing CONTAINS is data.** One manifest per entity (`lib/studio/entities/*`):
  its sections, its fields, their kinds and flags. No render code.
- **How a thing LOOKS and BEHAVES is composed**, from the kernel + the kit. One
  renderer per field *kind*, never per entity.

That split is what makes the standard hold: **change the kernel and every wizard
changes; change a manifest and nothing else does.** The dependency arrow points one
way only, and `pnpm check:studio` fails the build if it ever reverses.

| Layer | What | State |
|---|---|---|
| **Kernel** | `lib/studio/kernel/*`: field kinds, the field model, provenance + the clearance gate, moods, the manifest type. PURE and entity-blind | ✅ built (ADR-986) |
| **Catalog** | `lib/studio/registry.ts`: entity → manifest. The one place an entity is registered | ✅ built (ADR-986) |
| **Manifests** | `lib/studio/entities/*`: one declaration per entity | ✅ **15 declared** (was written as 9 until 2026-09-05, which omitted `housing` and all five catalog-only rows). Ten carry a wizard: circle · event · journey · practice · space · business · listing · **housing** · product · service. Five are **catalog-only** (owner decision 2026-08-11 — declared so the catalog is complete and Create can list them, deliberately given no wizard, and they declare no `accepts`/`steer` so nothing can render a drop zone or mood dial): channel · room · hub · nexus · broadcast. `STUDIO_ENTITIES` in `lib/studio/registry.ts` is the authority; count it rather than trusting this cell. |
| **Shell** | `StudioWindow`: overlay panel, chrome, Esc/backdrop close, scroll-lock, sticky footer | ✅ built (ADR-142) |
| **Builder kit** | identity, fields, autosave, footer, launcher, sortable, in `components/studio/kit/` | ✅ built (ADR-143) |
| **Spark kit** | `components/studio/spark/*`: the shell, the doors, the shared drop zone, one renderer per field kind | ✅ built (ADR-986) |
| **Wizards on the kit** | the per-entity flows composing the above | ⏳ none yet: the kit exists, the migration is next |

> **Correction (ADR-986).** This table previously marked the Registry "✅ built
> (journey ready; others declared)". It did not exist. Neither did ADR-450 §3's
> `lib/editing/schema.ts`. Both gaps are why every wizard hand-rolled its own shell;
> the row above is now true, and the guard keeps it true.

## 0. The contract (read before touching a wizard)

- **To add or change an entity's fields:** edit its manifest row in
  `lib/studio/entities/*`. That is the whole change.
- **To add a capability every entity should get** (a new control, a new signal, a new
  mood): change the **kernel**, and add a `FIELD_KIND` if it is a new control.
- **Never** hand-roll a per-entity wizard, review screen, or field style. If you think
  you need to, you need a field kind instead.
- **The kernel stays pure and entity-blind.** No React, no Next, no Supabase, and never
  an import from `lib/studio/entities/`. `pnpm check:studio` enforces all three, plus
  the drift guards in `lib/studio/registry.test.ts`.

### One field list, three planes (the ADR-450 seam)

A field's `placement` decides where it is edited, so creation and editing can never
drift apart: `spark` (guided creation) · `inline` (ADR-450's inline canvas) · `rail`
(ADR-450's Inspector, the default). Same declaration, filtered three ways.

## 1. The shell (built, keep it)

`components/studio/studio-window.tsx`. An entity passes its `eyebrow`, its tools
(children), and its `footer`. Launchable in place **and** deep-linkable to a real URL
(full-screen standalone). Don't re-create chrome; mount this.

## 2. The kit: extract these from the journey builder

The journey builder (`components/studio/journey/*`) already contains the reusable
parts. Promote them to `components/studio/kit/` so the next entity gets them for free:

- **`StudioIdentity`**: emoji + accent + title + summary header (the "give it a face"
  row). Accent tokens live in `lib/studio/accents.ts`. Journey/circle/practice reuse as-is;
  events may swap the emoji for a date chip.
- **`StudioSection` / `StudioField`**: the labeled field-row grammar (the `text-2xs`
  uppercase label + control), so every builder's fields read the same. No bespoke `<label>`.
- **`useStudioDraft`**: the autosave engine: optimistic local state + debounced
  `save(patch)` + the `idle / saving / saved` indicator + error resync. Every builder gets
  "autosaves as you go" by using this hook with the entity's `save` action.
- **`StudioFooter`**: the save-state line + primary action slot (Create / Share / Done).
- ~~**`StudioLaunchButton`**~~: **deleted (2026-08-12).** ADR-986 makes every create entry
  point a deep-linkable Spark link, so a modal launcher has no consumer. Entry points are
  plain `<Link>`s to the Spark route; `StudioWindow` remains the shell for *edit* surfaces.
- **`SortableList`**: the journey's drag-reorder + up/down list (HTML5 DnD, no dep), reusable
  for any ordered child (event agenda, circle pinned items).

> Rule: a builder is **`StudioWindow` + kit blocks + that entity's few bespoke fields**.
> If you're writing chrome, an autosave loop, or a label-row from scratch, stop and use the kit.

## 3. The registry: launch + gating in one place

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
tools accordingly, reusing the existing policy layer (`lib/core/capabilities.ts`), never
re-deciding gating in the UI:

| Entity | Create gate | Edit gate | Admin-only tools |
|---|---|---|---|
| **Journey** | any member (own) | author | publish-to-library = Crew |
| **Practice** | any member | creator / `admin.access` | reward (`reward_zaps`), template/visibility flags = admin |
| **Circle** | member (with a topic) / host+ (managed) | `circle.editSettings` | hub/nexus assignment, status = host+/staff |
| **Event** | Crew+ (member of the circle) | `event.editSettings` | cancel = community ops |

The builder calls the resolver, gets `caps`, and renders the admin tools only when
`caps` allow, so the same window adapts to member / host / admin without forks.

## 5. Per-entity field maps (what each builder composes)

| Entity | Identity | Bespoke tools | Persists via |
|---|---|---|---|
| **Journey** ✅ | emoji · accent · title · summary · intro | path (SortableList of practices) · per-step cadence/note · Pillar balance · share | `lib/journey-plans.ts` + journeys/actions |
| **Practice** ✅ | emoji/icon · title · summary | **Vera composer** (build/edit) · Pillar + sub-category · cadence · long **body** (markdown) · tags · (admin) reward | `lib/practices.ts` + practices/{actions,create-actions} |
| **Circle** | emoji/cover · name · about | type (in-person/online) · topic (channel) · place (geo + "use my location") · member cap | `admin/actions.ts` createCircle + circles/admin-actions |
| **Event** | cover · title · description | when (start/end) · recurrence · place · host circle · RSVP/check-in settings | `events/actions.ts` createEvent + events/admin-actions |

All four data layers + server actions **already exist**: the work is the builder UX, not the backend.

## 6. Migration order (one entity per PR, lowest risk first)

1. ✅ **Journey**: the reference instance (ADR-142).
2. ✅ **Foundation**: the kit (§2: `useStudioDraft`, `useSortable`, `StudioIdentity`
   atoms, `StudioField`, `SaveStatus`/`StudioFooter`; the original
   `StudioLaunchButton` was retired under ADR-986) + the registry (§3); the journey builder now composes it
   (behavior-neutral). The proof the kit fits.
3. ✅ **Practice**: `components/studio/practice/*`: a `NewPracticeButton` launcher
   (now opens the guided builder at `/practices/new`) + a `PracticeBuilder` window
   (replaced `/practices/[id]/edit`), composing `useStudioDraft` (autosave) +
   `StudioField`. Practices keep their own lucide-icon identity (no emoji/accent):
   proof the kit is composed-from, not a rigid template.
   ✅ **Vera-powered (ADR-358):** the Practice builder now mirrors the Journey builder's
   Vera capabilities, retargeted to the atomic Practice. A guided **Spark** wizard
   (`PracticeSpark`, who · the act · outcome · cadence · time → `draftPracticeSpark`)
   drafts the whole Practice for review (deferred creation, like Journeys); the editor
   carries a **Vera composer** (`PracticeComposer`: "Build with Vera" until there's a
   guide, then "Edit with Vera" → `buildPracticeWithVeraAction` / `applyVeraPractice
   ChangeAction`). All paths reuse the shared Vera infra (`withVoice`, `completeRaw`,
   the usage ledger + budget caps) and degrade to hand-entry when Vera is off. New AI
   modules mirror the Journey ones: `lib/ai/practice-spark.ts`, `practice-edit.ts`,
   `practice-shape.ts` (the `withPracticeShape` primer, the twin of `withJourneyShape`).
4. **Circle** ← next. Adds geo + topic; high leverage (the member-create flywheel). Replace
   `NewCircleCompose` (CreateModal) + inline edit.
5. **Event**: adds date/recurrence; host+. Replace `/events/new` + inline edit.
6. **Universal Create**: a single `+` driven by the registry, surfaced in the shell.

Each PR: extract any newly-shared block → compose the entity's tools → wire into
`StudioWindow` → replace the old surface → keep the server actions (re-checked) +
a no-JS fallback.

`components/create-modal.tsx` is a SHELL over `ui/Dialog`, not an overlay of its own
([ADR-1100](DECISIONS.md)). This line used to read "retire it once circles move"; circles moved,
nothing followed, and the eight surfaces it serves are none of them a circle — so the sentence
described a condition that could be met while nothing happened. What was actually duplicated was
the OVERLAY (backdrop, focus trap, ESC, scroll lock, and no portal at all), and that is gone. The
header/form/footer shell stays, because eight callers legitimately want that shape.

## 7. The contract (so it stays one tool)

- **Mount `StudioWindow`; compose the kit.** No bespoke chrome, autosave loops, or label rows.
- **Gating comes from `lib/core/capabilities.ts`**, surfaced via the registry, never re-decided in UI.
- **Autosave is the default** (`useStudioDraft`); server actions re-check ownership + caps.
- **Tokens only** (accents from `lib/studio/accents.ts`); no hardcoded hex, no `text-[10/11px]`.
- **Deep-linkable**: every builder also lives at the entity's route, so it opens standalone.

That's the whole plan: a new entity's "create/edit" becomes *compose the kit against an
existing data layer*, not a new screen.
