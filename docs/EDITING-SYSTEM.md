# The unified editing system — "One Edit, two planes"

> **One way to edit everything.** A single `Edit` toggle turns any ownable surface — a practice,
> circle, event, profile, page, all the way up to the **Space/brand** — into a live, in-place editor,
> with one Inspector rail beside it for the structured and structural settings. This replaces the
> 9+ ad-hoc editing surfaces inventoried in 2026-06-29 with one model that scales from a single
> practice to the whole white-label brand. Decision record: [ADR-450](DECISIONS.md). Authority:
> running code + `supabase/migrations/` > this doc. Status legend: ✅ built · 🟡 partial · 📐 designed · 🆕 net-new.

---

## 1. Why (the problem this kills)

A practice detail page today shows **three** ways to edit the same thing: a header "Edit practice"
button, an action-row "Edit practice" link to a full-page studio, and a "Settings" slide-out — two
different products on one page. Site-wide the recon found **9+ distinct editing mechanisms**
(Practice Spark wizard, Practice Builder studio, the Settings drawer, the Layout editor, Theme
Studio, Space branding, inline tuning, menu editor, circle/sequence wizards), each with its own
entry point, form code, and persistence. There is **no shared model**, so every surface feels
different and every new entity reinvents its editor.

**The fix is convergence, not new tech.** The platform already has every primitive: URL-driven
Edit Mode ([ADR-138](DECISIONS.md), `useEditMode`), inline editors (`InlineText`/`InlineCover`),
the scope-aware Settings drawer (`useSettingsPanel` + the module registry), the block-area Layout
editor ([ADR-270/272](DECISIONS.md)), and a **live-preview** Theme Studio. The job is to make all
of them one model and retire the outliers.

---

## 2. The model — one verb, two planes

> **Flip `Edit` on → the page becomes editable in place → the Inspector rail slides in beside it.**

| Plane | Owns | Built from (today) | Default |
|---|---|---|---|
| **Inline canvas** | The content that *is* the page: title, summary, description, body, cover, labels, blocks. Edited directly on the real, shippable page. | `useEditMode` + generalized `InlineText`/`InlineCover` | **Primary** (inline-first) |
| **Inspector rail** | What isn't on the canvas or is structural: **Guided/Vera**, Layout (blocks), Settings (status/visibility/permalink/SEO), Appearance (theme, Space scope), Danger zone. | `useSettingsPanel` drawer (desktop) + mobile sheet, one shared body | Secondary |

Edit Mode = **inline canvas + Inspector rail together**, entered by one toggle, shared by every
scope. Out of Edit Mode the page is exactly the member-facing page; nothing chrome-heavy leaks.

### The three rules

1. **One affordance, everywhere.** Exactly one capability-gated **`Edit`** toggle per page, in
   `PageHeading` (the page-framework header), shown when `canEdit(viewer, scope)`. No per-surface
   bespoke "Edit X" / "Settings" buttons. The screenshot's collision is removed by construction.
2. **The wizard is a *mode*, not a *place*.** The stepped, Vera-assisted flow runs from the
   Inspector rail **over the live page** ("Build with Vera" / "Edit with Vera"), writing the same
   fields you can also touch inline. The only separate full screen is **first creation** (a Focus
   surface — there is no entity to stand on yet); after creating, you land on the live page in Edit
   Mode and never return to a separate studio.
3. **Brand/global styles are the same model at the top scope.** Editing a Space's brand is just
   `Edit` at Space scope: inline-edit the brand mark; the Inspector rail holds the theme axes
   (skin / generation / occasion / accent) previewing on the **real page you are standing on**.
   This is the white-label Brand Studio (T1/T4) for free.

### The Inspector rail — same sections, every scope

In fixed order, each rendered only when it applies to the scope + viewer:

| Section | Purpose | Source |
|---|---|---|
| **Guided** | The Vera build/edit flow (optional, AI-assisted) | practice composer → generalized |
| **Layout** | Block areas + interior template ([ADR-270/272](DECISIONS.md)) | `LayoutEditor` ✅ |
| **Settings** | Status, visibility, permalink, SEO, scope-specific fields | per-scope field schema 🆕 |
| **Appearance** | Theme axes + brand (Space scope, or per-page override) | Theme Studio + brand editor, unified 🆕 |
| **Danger** | Archive / delete / cancel | `EventDangerZone` → generalized |

---

## 3. The one missing abstraction — a per-scope field schema

Today each of the 7 entity settings modules hand-rolls its form, which is why nothing feels shared.
Introduce **one declarative schema per scope kind** and **one renderer**:

```ts
// lib/editing/schema.ts (shape, illustrative)
type EditField = {
  key: string
  label: string
  type: 'text' | 'longtext' | 'richtext' | 'image' | 'select' | 'duration' | 'cadence' | 'tags' | 'toggle' | 'permalink'
  placement: 'inline' | 'rail'        // inline-first: content → inline, config → rail
  section?: 'settings' | 'appearance' // rail grouping
  capability: string                  // re-gated server-side
}
type EditScope = { kind: ScopeKind; fields: EditField[]; load(id): Promise<Row>; save(id, patch): Promise<void> }
```

- **Inline fields** (`placement: 'inline'`) render through one inline-editor kit on the canvas.
- **Rail fields** render through one settings-form component in the Inspector.
- Every scope (practice, circle, event, profile, page, **space**) is *defined*, not *coded*. Adding
  a field is a schema line; adding a scope is one `EditScope`. This is what makes editing identical
  everywhere — it is literally the same renderer over different data.

---

## 4. Convergence map (what each of today's 9 surfaces becomes)

| Today | Becomes |
|---|---|
| Practice Spark wizard (`/practices/new`) | **First-creation Focus surface** (kept; the one separate screen) |
| Practice Builder studio (`/practices/[id]/edit`) | **Retired as a destination** → inline canvas + Inspector "Guided" |
| Practice Settings module (drawer) | One `EditScope` for `practice`, rendered by the shared form |
| Header + action-row "Edit practice" buttons | **One `Edit` toggle** in `PageHeading` |
| Layout editor | Inspector **Layout** section (unchanged engine) |
| Theme Studio + Space branding (two UIs) | Inspector **Appearance** section at Space scope (one surface, live preview on the real page) |
| Inline tuning (`InlineText`/`InlineCover`, admin-only) | The **inline canvas** for all scopes |
| Menu / circle / sequence wizards | Same model: inline + rail; wizards become "Guided" where AI helps |

---

## 5. Rollout sequence

1. **Pilot — Practice** (build first): collapse the three entry points to one `Edit` toggle; make
   title/summary/description/body/cover inline; move the Vera composer into the Inspector "Guided"
   section; keep status/permalink/category/cadence/duration in the Inspector "Settings"; first-run
   creation stays a Focus screen. Prove the pattern end to end on one surface.
2. **Extract the kit**: `lib/editing/schema.ts` + one inline-editor kit + one settings-form
   component, with the practice scope as the first `EditScope`.
3. **Roll to scopes**: profile → circle → event → page, each as an `EditScope` (no new editor code).
4. **Space/brand**: the Appearance section + brand at Space scope (feeds white-label T1/T4).

Each step is independently shippable, capability-gated, and verified (inline writes re-gate
server-side; RLS enforces ownership — see the T0 convergence).

---

## 6. Principles

- **Inline-first.** If a member can see it, the owner edits it in place. The rail is for
  configuration, not content.
- **The page is the preview.** No separate canvas, no "save and refresh to see it." Theme/brand
  changes preview on the real page being edited.
- **Capability is law, not chrome.** The `Edit` toggle and every field re-gate server-side; the UI
  gate is courtesy, the server gate is truth.
- **One renderer.** Scopes are declared via the field schema; no per-entity form code.
- **Voice + framework canons hold.** Copy follows [CONTENT-VOICE.md](CONTENT-VOICE.md); pages compose
  the kit per [PAGE-FRAMEWORK.md](PAGE-FRAMEWORK.md); the `Edit` toggle lives in `PageHeading`.
