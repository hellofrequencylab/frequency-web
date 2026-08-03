---
name: frequency-design
description: Use this skill to generate well-branded interfaces and assets for Frequency ("Community Collective"), either for production or throwaway prototypes/mocks/decks. Contains the DAWN design system — warm-editorial guidelines, colors, type, fonts, assets, and UI kit components for prototyping the public marketing site and the in-app community.
user-invocable: true
---

Read the `readme.md` file within this skill, and explore the other available files.

DAWN is Frequency's design system: a warm editorial community look — calm,
magazine-like layouts on a warm cream/ink palette where type and space carry the
personality, with a cinematic wood-slat "dark beat" seamed by glowing amber
light-strips. Amber is the only chrome accent; success is a teal, never green.

Key files:
- `readme.md` — the full design guide (content fundamentals, visual foundations,
  iconography) + the manifest of everything available.
- `styles.css` — the single global-CSS entry point; `@import` it to get every
  token, font, and brand motif. Raw hex lives only in `tokens/colors.css`.
- `tokens/` — colors (plus the Midnight skin in `skins.css`), typography, the
  feel layer (radius by role, motion, density), fonts, and the signature effects
  (`.bg-slat`, `.light-strip`, `.amber-glow`, `.brandmark`, `.rank-badge`).
- `components/` — reusable React primitives (Button, Card, Badge, RankBadge,
  Avatar, Input, Tabs, SectionHeading, Toast, EmptyState, …). Each has a
  `.prompt.md` with a usage snippet.
- `ui_kits/marketing/` and `ui_kits/app/` — full interactive recreations of the
  public splash and the in-app member feed; the best reference for composition.
- `assets/` — the wordmark, app icon, and warm brand photography.

If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy the
assets you need out and create static HTML files for the user to view — link
`styles.css` and load the brand fonts (Nunito for everything, Anton for marketing
headlines only, Geist Mono for numerals, via Google Fonts), then compose with the
tokens and the patterns in the readme. If working
on production code, copy assets and read the rules here to become an expert in
designing with this brand.

Honor the house rules: plain sentences with the proper nouns carrying the magic,
never narrate the reader's feelings, sentence case, no em dashes, the skeptic test
on every line, honest counts only, Lucide icons (emoji rare and only in game UI or
social), "group, don't box" card discipline, and money stays dark: no flow ends on
a price or a sale. Season ranks are Ghost, Initiate, Adept, Master.

If the user invokes this skill without any other guidance, ask them what they
want to build or design, ask a few focused questions, and act as an expert
designer who outputs HTML artifacts _or_ production code, depending on the need.
