# SYNC.md — "sync DAWN" routine for Claude Code

> **Trigger:** when the user says **"sync DAWN"** (or "apply the DAWN handoff"),
> follow this routine exactly. This file is the standing instruction; it does not
> change between rounds. The per-round changes live in `design_handoff/CHANGES.md`.

## Routine

1. **Read the change set.** Open `design_handoff/CHANGES.md`. It lists this
   round's changes as old→new values / asset swaps / icon or rank mappings. If
   `CHANGES.md` is missing or unchanged since the last sync, stop and tell the user.
2. **Check the bundle came with it.** Run **`pnpm check:dawn-bundle`**. `CHANGES.md` is prose and
   `design_handoff/dawn/` is a file export; they are copied across **separately** and on 2026-08-25
   only the prose arrived, leaving the bundle three weeks behind its own changelog (ADR-1163). The
   guard declares which round the bundle is and fails when the two move apart — read its output
   before applying anything, because a "value diff" against a stale file is a diff against the
   wrong file.

   🔴 **If the bundle HAS been re-exported, three files move in one change** and the guard names
   them: `BUNDLE_ROUND` in `scripts/check-dawn-bundle.mjs`, the ledger in
   `lib/theme/dawn-divergence.test.ts`, and `design_handoff/PROD-AHEAD.md`. Never reconcile a fresh
   bundle by moving DAWN's values into `app/globals.css` — where the two disagree on a colour,
   production measured it and DAWN did not.

3. **Create a branch.** `design-sync/<short-summary>` off the default branch
   (`main`). Never commit directly to `main`.
4. **Apply each change using the mapping below.** Confine raw hex to
   `app/globals.css`. Do not paste DAWN's inline-style JSX into the app; recreate
   any component/layout change in the repo's Tailwind v4 + TSX conventions.
5. **Build + sanity check.** Run the project build (and `npm run dev` to eyeball
   the affected surfaces if a visual change). Fix anything that breaks.
6. **Open a PR.** Title `DAWN sync: <summary>`. Body = the changelog from
   CHANGES.md, plus the three standing-rule lines below: which "what users tripped on"
   rows this round answered (and which it did not), the mobile behavior per screen
   touched, and confirmation that no ratchet count rose. **Do not deploy and do not
   merge** — the user reviews and merges.
7. **Report back** the PR link and a one-line summary of what changed.

## Mapping (DAWN file → this repo)

| Change type (in CHANGES.md) | Apply to | Notes |
|---|---|---|
| Color / shadow / radius **tokens** | `app/globals.css` → the `:root` and `.dark` blocks (and `@theme inline` for shadows) | Value-for-value. Raw hex lives ONLY here. |
| **Effect** classes (`.bg-slat`, `.light-strip`, `.amber-glow`, `.brandmark`, `.rank-badge`, focus ring, keyframes) | `app/globals.css` → the matching CSS blocks | Lifted from globals.css; sync value-for-value. |
| **Fonts / type** | `app/globals.css` + `app/layout.tsx` (`next/font`) | Only touch if family/weights changed. |
| **Logo** | `public/frequency-logo.png` | Drop-in file replace. |
| **App icons** | `public/icons/*` | Drop-in; regenerate the set if the mark changed. |
| **Photography / images** | `public/images/site/*` | Drop-in; keep or update the referenced filename. |
| **Icon choice** (lucide name) | `components/layout/nav-icons.ts` + affected components | Swap the `lucide-react` glyph by name. |
| **Rank → color mapping** | wherever season ranks set the `.rank-badge` `--rank*` vars (search `rank-` in `lib/` + components) | Change the rank's spectrum color name only. |
| **Component / layout visual** | the existing component in `components/**` | Recreate in Tailwind/TSX; do NOT paste inline-style JSX. |

## Templates (new)

DAWN now ships two starting points as **templates** rather than the retired
`@startingPoint` tags. Each is a folder that runs standalone in a browser:

| Template | Entry | What it is |
|---|---|---|
| App shell | `templates/app-shell/AppShell.dc.html` | Top bar, left area rail + account dock, centre column, status rail, Vault dock |
| Marketing page | `templates/marketing-site/MarketingSite.dc.html` | Photographic hero + fact dock, the four-role section rhythm, photo beats, FAQ, beta close |

`chrome.jsx` / `site.jsx` in those folders are **concatenations** of the design-system
kit, assembled so one import loads the whole shell. They are reading material, not
shippable code: recreate them in Tailwind/TSX. `ds-base.js` is the one file a consumer
edits — it points at wherever the compiled system lives.

## Standing rules (every round, both directions)

Three rules that do not change between rounds. They are part of the contract, not part of
a round: a handoff that skips one is incomplete, and a `CHANGES.md` that ignores one is
unanswered. Sources: `docs/UX-MATURITY-PLAN.md` Lifts 1c, 7c, 4 and 2.

### 1. Every outbound handoff carries the evidence, and every inbound answers it

The two-way contract had two voices, designer and repo. This adds the third: the user.

**Outbound (repo → DAWN), two required sections in the handoff doc:**

| Section | Source | Shape |
|---|---|---|
| **What users tripped on** | the newest `docs/research/findings/YYYY-MM-DD.md` | The findings file's own trip table, copied verbatim: severity · journey · where · what happened. Worst-first. |
| **Vitals vs budget** | `lib/analytics/vitals-budgets.ts` + the `/admin/insights` Vitals panel | p75 per templated route against its budget, with ✅ / ⚠️ / 🔴 per row. |

Rules for the two sections:

- If the newest findings file is older than 100 days, say so in one line and send it
  anyway. Stale evidence is still evidence; silence is not.
- If there has never been a round, write "No moderated round has run yet" and link
  `docs/research/PROTOCOL.md`. Never omit the heading.
- A **🔴 budget on a surface this round redesigns is a stated constraint for that round**:
  "this page must get lighter, not heavier." Say it in the handoff, in those words.
- Two consecutive 🔴 weeks on any surface puts a perf task in the next wave, ahead of new
  screens.

**Inbound (DAWN → repo):** `CHANGES.md` is expected to **answer each trip row and each 🔴
budget row**. An answer is any of: a design change that addresses it, a reasoned decline,
or a question back. "Not addressed this round" is a legal answer. Skipping the row is not.
When applying a `CHANGES.md`, check the trip rows are accounted for before opening the PR,
and say which ones were not in the PR body.

### 2. Every screen pass states its mobile behavior

Explicitly, per screen, in both directions. **"Mobile: unchanged" is a legal answer.
Silence is not.**

Mobile is the weakest surface we ship precisely because it has been inherited rather than
decided, one breakpoint at a time. This rule is the smallest thing that stops that from
continuing. The grammar it feeds is `BRIEF-07-MOBILE-GRAMMAR.md`.

- A DAWN screen that changes on a phone comes with a **mobile reference frame**, not a
  description.
- A repo screen pass states the phone behavior in the PR body, next to the desktop one.
- "It reflows" is not a statement of behavior. Name the breakpoint and what moves.

### 3. Ratchet counts only shrink

The adoption baselines (`scripts/adoption-baselines.json`, enforced by `check:adoption`)
are frozen debt counts: literal radius, shadow literals, white/black literals, ad-hoc
progress bars, bespoke cards and rows, hand-rolled tabs.

- A round that **raises** any count fails CI. That is the whole mechanism.
- Baselines are lowered with `--update` **after** a sweep lands, never before, and never to
  make a red build green.
- A genuinely bespoke-by-design component gets an **allowlist entry with a reason**, not a
  rewrite and not a raised baseline.
- New DAWN components arrive as kit primitives, so adopting them should move a count DOWN.
  If a round would push one up, say so in the handoff and get it ruled on first.

## Going the other way (repo → DAWN)

Sync is two-directional. When the repo changes something DAWN documents, say so in the
PR body and DAWN picks it up on the next round. The four files DAWN's recreations are
built from — change any of them and the kit needs a matching pass:

| Repo file | What DAWN built from it |
|---|---|
| `lib/nav-areas.ts` | The nav rail's areas, order, section grouping and labels |
| `components/layout/nav-icons.ts` | `AREA_ICONS` glyph choices |
| `components/feed/post-card.tsx`, `post-replies.tsx`, `lib/feed/reactions.ts` | The post card and its reaction row |
| `app/globals.css` | Every token value, effect class and keyframe |
| `components/layout/app-shell.tsx` | The shell: top bar, both rails, their widths |

## Golden rule
Raw hex appears only in `app/globals.css`; everything else reads semantic tokens
(`bg-primary`, `text-muted`, `var(--color-signal)`). A palette change should be a
one-file edit that propagates everywhere.
