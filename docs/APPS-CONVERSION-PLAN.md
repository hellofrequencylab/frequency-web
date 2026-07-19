# Converting the site to the apps / theme / skin system — phased plan

The target (docs/EMBEDDABLE-ELEMENTS.md): every reusable feature is a **canonical app** invoked by
key, **configured once** (role-gated) and applied site-wide, framed by the **rail/shell** ("theme")
and painted by **design tokens** ("skin"). This is the WordPress mental model (theme / child theme /
plugins) without WordPress's runtime-hook fragility — everything is compile-time, typed, and
CI-enforced.

**What kind of build this is:** an **incremental, multi-PR program — not a rewrite.** Each phase (and
most sub-phases) ships on its own behind the same green gates (types · tests · CodeQL · the contract
checks · preview). Risk stays low because nothing merges unless the guards are green, and the whole
point of the guards is that a conversion can't regress the architecture.

**Lift legend:** ⬤ S = a focused session · ⬤⬤ M = ~a day, some design · ⬤⬤⬤ L = multi-day / broad ·
⬤⬤⬤⬤ XL = a week+, large surface. Sizes are rough; each phase is scoped to be independently mergeable.

## The phases

### Phase 0 — Foundation & guardrails ⬤⬤ M · architectural — ✅ DONE
- Elements **registry + `element_settings` config + role gates** — ✅ (#1819, ADR-792).
- The generic **`<AppElement name=… />` mounter** (`components/elements/app-element.tsx`) + the
  **component map** (`components/elements/registry.tsx`) + the **typed-wrapper** convention — ✅.
- **`check:elements`** hard CI guard (`scripts/check-elements.mjs`, mirrors `check:menu`; wired into
  the `checks` job) + **drift test** (`components/elements/registry.test.ts`: registry ↔ component map
  in lock-step) + classifier test + **CODEOWNERS** on `lib/elements/**` · `components/elements/**` ·
  `scripts/check-*.mjs` + the **PR-template review block** + `docs/REVIEWING-CHANGES.md` — ✅.
- **Apply** the `element_settings` migration (via the migration workflow) — ⏳ deferred (one shared DB;
  code fail-safes to registry defaults until it lands).
- **Ships:** the contract is real and un-mergeable to violate; Loom is the reference app.

### Phase 1 — Owner review/ship system ⬤ S · process
- `docs/REVIEWING-CHANGES.md` + the PR-template "How to review" block — **done**.
- Repo settings (admin, one-time): **require status checks** on `main` + **allow auto-merge**.
- **Ships:** green = shippable; your review is "open the preview, click 2-3 things, merge."

### Phase 2 — Theme (rail/shell) audit ⬤⬤ M · audit/mechanical
- Verify every page composes the shell + a template (PAGE-FRAMEWORK); find + convert any hand-rolled
  layout; the rail stays the single chrome source (MENU-CONTRACT already enforces the menu half).
- **Ships:** the "main theme" layer is uniform and guarded.

### Phase 3 — Skin (tokens) layer ⬤–⬤⬤ S–M · mechanical
- Formalize the token/skin contract; sweep stray hardcoded colors (`check:tokens` already exists);
  document per-Space brand/page-theme as skin overrides; confirm light/dark parity.
- **Ships:** the "child theme" is a documented, tokenized, enforced layer.

### Phase 4 — Convert the reusable elements to apps ⬤⬤⬤–⬤⬤⬤⬤ L–XL total · the bulk
Each is one canonical app (registry row + typed wrapper + config + role gates + registry-mounted,
CI-enforced), independently shippable:
- **4-header Page header** ⬤⬤ M — ✅ DONE (ADR-793): `PageHero` gained layout variants (overlay /
  identity / minimal) + `size`/`leading`/`dimmed`; registered `'header'` with role-gated features
  (layout, height, focal point, links, darken-cover); Journeys + personal profiles converted to the
  immersive `identity` layout. Follow-up: read `element_settings` per-surface + fold the two height
  ladders (`lib/spaces/hero-config.ts`, `lib/events/hero-height.ts`) into the element.
- **4a QR Studio** ⬤⬤ M
- **4b Email editor popup** ⬤⬤ M
- **4c Resonance CRM board** ⬤⬤⬤ L (large surface)
- **4d Practice builder + Journey builder** ⬤⬤⬤ L
- **4e Airwaves** (recordings player + uploader) ⬤⬤ M
- **4f Finish the image/gallery rollout** (remaining raw inputs: community composer, admin seeders;
  onboarding intentionally excluded) ⬤–⬤⬤ S–M
- **Ships:** each reusable feature is the one app everywhere, config + role-gated.

### Phase 5 — Per-space / per-role override UI ⬤⬤ M · feature
- A Space-side editor for `element_settings` overrides (the framework already supports overrides;
  this is the UI within the master's allowances).
- **Ships:** a Space can tune its apps without a deploy, bounded by the platform master.

### Phase 6 — Retire legacy + finalize ⬤–⬤⬤ S–M · cleanup
- Remove forked/duplicate components; fold the bespoke pickers (email `LoomImagePopup`,
  `EventLoomPicker`, `ShowCoverPicker`) onto the one Loom app; finalize the standard docs.
- **Ships:** no divergent copies remain — the system is the only path.

## Rough sequencing / total

Near-term: **Phase 0 → 1** (foundation + you can ship). Then **2 → 3** (theme + skin formalized).
Then **Phase 4** is the long pole — a series of M/L PRs, one app at a time, each safe on its own.
**5 → 6** are smaller and close it out. There is no big-bang cutover; the site keeps working
throughout, and every step is one green-gated, preview-checked PR.
