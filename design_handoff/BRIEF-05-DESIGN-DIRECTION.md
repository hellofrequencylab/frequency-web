# Frequency brief 05 — Design direction (for Claude Design)

> Part of the project-orientation set for Claude Design. This is the *why* behind
> the token values in `HANDOFF-TO-DAWN-2026-08-03.md` (the styles handoff). Scope
> is the **DAWN theme plus the Midnight skin** — each in light + dark.
> Sources: `docs/DESIGN.md`, `docs/DESIGN-LANGUAGE.md`,
> `docs/MEMBER-DESIGN-SYSTEM.md`, `docs/PAGE-FRAMEWORK.md`, `docs/ICONS.md`,
> `docs/LOOM-DESIGN-LANGUAGE.md`, ADR-052.

---

## 1. The direction, named

**Warm editorial community.** Calm, magazine-like layouts on a warm cream canvas,
where type and space carry the personality and content sits openly rather than
inside a grid of identical bordered boxes. Friendly, human, unmistakably not a
SaaS admin template.

**The diagnosis it answers** — it was never the palette or the font; three habits
made the app read as a template:

1. Everything in an identical bordered card (1px border + flat shadow + same
   radius on every block). Uniform boxes = no authored hierarchy.
2. Type too small and unexpressive (11px labels, tiny gray uppercase
   micro-headers). Nothing felt like a printed heading.
3. Flat, hard elevation (crisp pure-black shadows) instead of gentle warm depth.

DAWN is the name of the token system; components only ever use semantic tokens.

## 2. The physical-space reference (where the look comes from)

The visual language is drawn literally from Frequency's real venues: **black
wood-slat walls, warm amber LED light strips, teal water, lush greenery,
campfire warmth.**

- `.bg-slat` = the wood-slat wall (vertical slat texture over warm near-black
  "ink," with a faint amber sheen where the LED light grazes the slats).
- `.light-strip` = the LED strip (a glowing amber hairline at every dark↔light
  seam).
- `.amber-glow` = the warm radial light behind hero CTAs and inside dark bands.
- Dark mode is warmed toward dark wood — espresso slats lit by amber, never
  neutral charcoal.

## 3. The principles

### In-app

1. **Type is the hero.** Larger base, expressive headings, generous line-height.
2. **Group, don't box.** A card means "this is a distinct object" (a Circle, an
   event). Lists and rail sections group with a title + spacing, at most a
   hairline divider.
3. **Warm, soft depth.** Diffused warm-tinted shadows over hard borders; borders,
   when used, are hairline and warm.
4. **Editorial hierarchy.** A few large anchor areas, quieter supporting detail.
   Density is fine when hierarchy is right; never a wall of equal weight.
5. **Human touches.** Real photography of gatherings, occasional hand-feel
   accents, so it reads as made, not generated.

Heading face: **Nunito bold in-app; Anton for marketing headlines only.** (A warm
serif was trialed for in-app headings and reverted — it read as a different
product.) Type is roles, not pixels: page title / section title / card title /
body / meta, floor at 12px-equivalent, never arbitrary 10/11px content type.

### Marketing

1. **Editorial, not "SaaS landing page."** Heavy Anton display headlines,
   generous whitespace, photography carrying emotion. No gradient-blob filler.
   Every page reads like a magazine spread with a purpose.
2. **One warm world, lit from within.** Amber is the single hero accent; teal is
   a rare secondary; green/success never appears in marketing chrome. Color =
   brand, never decoration.
3. **Light and dark are a rhythm, not a theme toggle.** The cinematic ink band is
   a deliberate beat — max ~2 per page (one mid-page, one at the closing CTA),
   always seamed with a light-strip. Dark is punctuation, not wallpaper.
4. **A predictable cadence.** Shared vertical rhythm and container widths;
   surprise comes from content and imagery, never from spacing that jumps.
   Adjacent sections never repeat the same tone (no canvas→canvas).
5. **The kit is the source of truth.** If a pattern appears twice, it's a
   component. Pages never hand-roll sections, buttons, or card chrome.
6. **Honest, grounded confidence.** Real photos, real counts, plain copy.
   Restraint IS the brand.

The three marketing surfaces form a deliberate sequence: **canvas** (warm sand,
outdoor/connective) → **surface** (white, indoor/focus) → **ink** (the cinematic
dark beat).

### Member app

1. **Design for the body, not the dashboard.** Lens words: *missed, exhale,
   home*. Lead with people, places, and next actions — never a metrics wall.
2. **The gamified-stat law:** primary member pages show ONLY the four game counts
   (Zaps, Gems, Streak, Season rank). Everything else is quiet inline context.
   Non-game surfaces (messaging, settings) show zero stats. Member numbers are
   playful glyph+tile, never analytics drill-downs — deltas and KPI walls belong
   to the operator register.
3. **No dead ends.** Every entity cross-links to neighbors; movement is the
   product.
4. **Calm motion** (≤300ms, reduced-motion honored), honest empty states (an
   empty pane teaches the next step with one CTA), AA accessibility floor.

**One site, three rooms:** Marketing (the editorial pitch) · Member app (the warm
home) · Admin (the workshop, data-led). Same tokens, type, and tiles — only
register and content change. Members never see operator KPIs.

## 4. The composition system (how pages are built)

- **One shell, five templates:** Stream (a flow) · Index (a collection to
  browse) · Detail (one entity: context band + underline tabs) · Dashboard
  (metric-led operator workspace) · Focus (centered, rail-less compose/edit).
  Building a page is two decisions: pick a template by what the content is,
  register its chrome. The same header/content/rail grammar repeats inside a
  Detail page at smaller scale — one spatial logic, learned once.
- **The kit** (compose, never re-declare): PageHeading (the one header grammar) ·
  EntityCard / PersonCard / RowCard · StatCard · SectionHeader · UnderlineTabs
  (the ONE tab vocabulary — no pill tabs) · EmptyState · form primitives.
- Speed is structural: server-rendered by default, slow sections stream in behind
  skeletons matched to their final dimensions.

## 5. Iconography & illustration

- **Lucide is the icon set** (Phosphor/Tabler gap-fill only). Icons are
  referenced by meaning, sized via the type scale, colored via currentColor from
  DAWN text tokens. Decorative by default. Standalone game icons sit in the amber
  chip treatment (~22px glyph on primary-bg, rounded-xl).
- **The Loom illustration language** for drawn graphics: flat, warm, FILLED
  shapes (not thin line-art) in the DAWN palette — calm, rounded, product-UI
  feel. Amber-led, teal accent. Big rounded corners, roomy spacing, one focal
  point. Frame product moments as a screen/card with faint inner cards.
  **Don't:** thin line-art-only, raw hex, gradients/shadows/3D, clutter,
  photorealism, faces/fingers/realistic anatomy (figures stay minimal,
  recognizable by pose).

## 6. The Midnight skin (the one alternate look)

Midnight is the white-label/cinematic counterpart to DAWN: cool slate and
indigo-leaning surfaces in place of the warm cream and espresso, with the warm
amber accent deliberately kept so it still reads as Frequency. Its feel is
sharper — tighter, more architectural radii instead of DAWN's soft corners. It
exists in both light and dark modes, and everything it doesn't override (signal,
broadcast, semantic states, ranks) inherits DAWN's values. Full token sheets are
in the styles handoff §3. Every principle in this brief applies unchanged under
Midnight; only the palette temperature and corner language shift.

## 7. The do/don't list (recurring across every design doc)

**Never:**
- Hardcode hex (raw hex lives only in the token file).
- Use 10/11px arbitrary type for content, or all-caps micro-label section headers.
- Box a list that isn't an object; stack identical bordered cards.
- Put green/success in marketing chrome.
- More than ~2 ink bands per page, or an ink band without its light-strip seam.
- Adjacent same-tone sections; ad-hoc hover transforms; bespoke one-off heroes,
  buttons, or FAQ blocks.
- Em dashes in brand copy (voice canon, brief 02).
- Non-game stats on primary member pages; analytics deltas in the member register.
- Blank empty panes.

**Always:**
- The presentation test: "If this were screenshotted into a deck or forwarded to
  a customer right now, would it look intentional?" New UI should look like it
  always belonged.
