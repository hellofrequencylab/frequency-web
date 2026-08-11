repo: hellofrequencylab/frequency-web
branch: main
path: design_handoff

## Last sync
date: 2026-08-11T00:00:00Z
round: the mobile grammar (answers to `BRIEF-07-MOBILE-GRAMMAR.md` §6, Q1-Q7)

### Answered this round (reply in `design_handoff/CHANGES.md`, 2026-08-11 section)
- **The mobile stacking contract (Q1).** Named slots from the safe-area edge up, measured at 390x844 on this app's 17px root, plus six rules for any new fixed element. The phone's bottom edge belongs to the tab bar alone; the score does not get a home there.
- **The score at 768-1023 (Q2).** No change: `DockBar` renders from `md` as a shell sibling, which is what DAWN's own `VaultDock` (fixed, ungated by breakpoint) and the docks card's "rails are not docks" already required.
- **The breakpoint (Q3).** **768**, kept. `--breakpoint-md` is not redefined and `--breakpoint-rail` is not added; DAWN's 1000 is re-scoped to the menu-mode line it actually governs, alongside 1100/1180/1400.
- **The marketing rhythm at 390px (Q4).** Measured, then re-cut: three floor edits (`5rem -> 4.5rem`, `4.25rem -> 3.5rem`, `3rem -> 2.25rem`) restore the desktop role ratio and shrink every gap. The 24px gutter holds, by decision, and gains safe-area insets.
- **Hero fact docks (Q5).** A strip, in flow, below `sm` - DAWN's own `position: static` escape rather than stack/truncate - with the `.mk-hero-dock + *` clearance collapsing to zero beneath it.
- **Thumb zone (Q6).** 44px floor for anything fixed (never the per-generation dip), a seven-slot cap on the tab bar, a two-number gap rule, and a `bottom-0` to `35dvh` reachable band.
- **"You and yours" without a rail (Q7).** The drawer's head-first identity card is correct; the residual is clustering *what you run* into it. The foot-mounted Close stays, restated as "the dismiss goes where the hand is".

### Owed back to DAWN (see the round's "Repo -> DAWN" list)
- `readme.md:404` / `:513` state one 1000px law where `frame.jsx:150-158` runs four thresholds.
- `readme.md:497`'s overlay exception is better stated by mechanism.
- `tokens/utilities.css:84` omits `.mk-cont-soft` from the marketing gutter selector.
- The fact dock has no phone rule outside one per-page `!important` in `operators.html`.
- DAWN carries **no** thumb-zone or tap-target guidance; Q6's rules are the repo's, offered for adoption.

### Previous sync (2026-08-03T21:30:00Z)
- Marketing vertical rhythm rebuilt as a four-role system with a double-count correction; every marketing page retuned.
- Rail open/close controls unified as one quiet affordance at the foot of each rail.
- Pricing restructured on ADR-590 canon (three free doors, then Business/Collective/Non Profit on ink); the Lab reframed as a 2028 vision page with no rates.
- `Glyph` added as a DS primitive, fixing six components that drew raw `data-lucide` nodes; creation wizard and the message-board rebuild added.

## Screen map
| Screen / artifact | Built from |
|---|---|
| `tokens/colors.css`, `tokens/skins.css` | `design_handoff/HANDOFF-TO-DAWN-2026-08-03.md` §2, §3 (mirrors `app/globals.css`) |
| `tokens/spacing.css`, `tokens/typography.css`, `tokens/fonts.css`, `tokens/effects.css` | same handoff §4, §5, §6, §7 |
| `guidelines/brand-voice.card.html` | `BRIEF-02-AUDIENCE-AND-VOICE.md` |
| `guidelines/brand-page-spine.card.html`, `brand-templates.card.html`, `brand-loom.card.html` | `BRIEF-05-DESIGN-DIRECTION.md` |
| `guidelines/quest-rank-badges.card.html`, `colors-rank.card.html`, `quest-icons.card.html` | `BRIEF-01-WHAT-FREQUENCY-IS.md` §3, `BRIEF-02` §3 |
| `ui_kits/app/*` | the live `frequencylocal.com/feed` capture plus `BRIEF-05` in-app principles |
| `ui_kits/marketing/*` | `BRIEF-04-MARKETING-AND-FUNNELS.md` §2, §4, §6 |
| `readme.md` | briefs 01 to 05 |
| `handoff/CHANGES.md` | the reply set for the next repo PR |
