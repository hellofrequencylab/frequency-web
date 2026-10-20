# Email layout — the standard for every outgoing email

**Status lives in [`docs/BUILD-BACKLOG.json`](BUILD-BACKLOG.json), not here.** This document explains
how a Frequency email is laid out and why ([ADR-1800](DECISIONS.md)); whether a given template follows it
is a backlog row (`EMAIL-029` and up). Names: [`NAMING.md`](NAMING.md). Voice: [`CONTENT-VOICE.md`](CONTENT-VOICE.md).
Source of the look: the MEMBER KIT, `design_handoff/frequency/templates/members/app/app.css` (`.card`, `.btn.pa`,
`.soft`, `.k`, `.h1`, `.why`, `.ap-foot`) over `tokens/themes.css` (never edited). Email mirrors them by hand in
`lib/theme/palette.ts` (every colour, one hex each) and `lib/theme/email-type.ts` (faces, the pastel gradient, the
wash, the card shadow, the wordmark), because a mail client reads no CSS variable.

An email is a member screen that arrived in an inbox: the Event card, with one thing to do.

---

## 1. The grid

| Part | Rule | Why |
| :--- | :--- | :--- |
| Column | One column, 600px, fluid below it (`width="100%"; max-width:600px`), an Outlook ghost table pins 600 | 600 is the width every client renders without horizontal scroll; Outlook ignores max-width |
| Canvas | `--surface-card` #FFFEFC with the `--wash` lilac-to-aqua radial gradients over it, 36px top, 48px bottom, no side gutter | The member app's page: linen with the wash. On a desktop the 600px column is centred on it; on a phone the card is the full width of the screen |
| Header | The wordmark image (`assets/logo/frequency-wordmark.png`, 178px) above the card, left-aligned | `.ap-logo`; the card opens on the headline, not the logo |
| Card | `.card`: white, hairline, radius 24, the kit's soft shadow, padding 40 (28 by 22 on a phone) | The raised member card on a desktop. Under 620px it is full width: no radius, no side borders, no shadow, and the hero loses its corners, so it meets the screen edge |
| Footer | Below the card, centred, 13px, muted ink | Legal and preference lines are read last and must not compete with the action |
| Tables | Every layout table is `role="presentation"`; no `<div>` layout, no floats | Screen readers skip presentational tables; Outlook renders tables only |
| Styles | Inline on every element; one `<style>` block carries only the phone gutter and the night room | Gmail strips a lot of `<style>`; the light layout must survive with inline alone |
| Weight | Under 60 KB of HTML; images hosted, never inline base64 | Gmail clips at 102 KB and shows nothing below the fold |

## 2. Hierarchy: one email, one action

1. **Preheader** (optional, 40 to 90 characters): the line beside the subject in the inbox. Hidden in the body.
2. **Eyebrow label** (optional): `.k`, Unbounded 500 11px, uppercase, 0.14em tracking, muted ink ("You're going", "Welcome").
3. **Headline**: `.h1`, Unbounded 500, 32px, line-height 1.05, tracking -0.04em, `--text-strong`, with at most one word in Instrument Serif italic ("You're in, *Maya.*"). One per email. Says the one fact the email exists for.
4. **Lead**: 16px body, `--text-body`. At most two short paragraphs before the action.
5. **Primary action**: `.btn.pa.lg`, the pastel `--pa` pill (pink, lavender, aqua) with ink text, Hanken 600 15px, 48px tall, radius 999, its glow, inside the first screen. Solid lavender #C4B8FF where no gradient paints. A verb about the real world (Save my spot, View event, Open your feed). Never two pastel pills.
6. **Detail**: facts in the order the reader needs them (when, where, who), then sections separated by a hairline, each with a section title (`.h3`, Unbounded 500, 17px).
7. **Secondary actions**: `.chip` (a quiet pill on `rgba(30,27,24,.04)`) or an ink text link, underlined. Never a second pastel pill.
8. **Audience line**: why the reader got this, 13px muted, inside the card when the template has its own reason (an RSVP, a waitlist), else in the footer.
9. **Footer**: the audience line, the unsubscribe or manage link (underlined, muted), the postal line. Receipts and account mail about the reader's own Space drop the unsubscribe control (`RECEIPT_FOOTER`, `{ unsubscribe: false }`).

A reader on a phone sees the headline, the lead and the button without scrolling. Everything a transactional email has to say fits in one card; a campaign may stack blocks, but the first screen still holds one headline and one action.

## 3. Type

| Role | Face | Size / line / tracking | Ink |
| :--- | :--- | :--- | :--- |
| Wordmark | the image; alt text in Unbounded 600 uppercase | 178px wide | ink |
| Labels, eyebrows (`.k`) | Unbounded 500, uppercase | 11px / 1 / 0.14em | `--text-muted` |
| Headline (`.h1`) | Unbounded 500, one serif italic word | 32px / 1.05 / -0.04em (24px on a phone) | `--text-strong` |
| Section title, card title (`.h3`, `.h2`) | Unbounded 500 | 17 to 22px / 1.2 / -0.025em | `--text-strong` |
| Body | Hanken Grotesk 400 | 16px / 1.55 | `--text-body` #4D4945 |
| Meta, footer | Hanken Grotesk 400 | 13px / 1.6 | `--text-muted` |
| Postal line | Hanken Grotesk 400 | 12px / 1.6 | `--text-muted` |
| Button (`.btn.pa`) | Hanken Grotesk 600 | 15px / 1 | ink on `--pa` |
| Chip (`.chip`) | Hanken Grotesk 500 | 14px / 1 | `--text-body` on `rgba(30,27,24,.04)` |
| Why line (`.why`) | Instrument Serif italic | 16px / 1.4 | `--text-muted` |
| Quote | Instrument Serif italic | 24px / 1.3 | `--text-strong` |

The web fonts load from Google Fonts behind an `<!--[if !mso]>` guard for the clients that honour them
(Apple Mail, iOS Mail, the Outlook apps, Samsung). Every stack falls to Helvetica, then Arial, whose
metrics sit close to Hanken Grotesk, so Gmail and Outlook on Windows wrap in the same places.
Nothing is set below 12px. Nothing is set in an image.

## 4. Colour

Light is the design. Every colour is read off the member kit and mirrored in `lib/theme/palette.ts` under the
`email*` keys; a template never types a hex ([`scripts/probes/email-palette.mjs`](../scripts/probes/email-palette.mjs)).

| Kit rule | Email use |
| :--- | :--- |
| `body{background:var(--surface-card)}` #FFFEFC + `--wash` | the page |
| `.card` white, `inset 0 0 0 1px var(--border-hair)` | the card, a data card (hairline flattened to #EFEEEC) |
| `.btn.pa` `--pa` gradient, `.fq-pa{color:#1E1B18}` | the one action; solid fallback #C4B8FF |
| `.chip` `rgba(30,27,24,.04)` | chips, quiet panels (flattened to #F4F2EF) |
| `.soft` `--pa-soft` | a callout, an invite note (flattened to #F4EFF8) |
| `a{color:var(--text-strong)}` | links are ink, underlined |
| `--text-strong` #34312E, `--text-body` #4D4945, `--text-muted` #7C766F | ink, in that order of weight |
| `--presence` #17788A, `--danger` #C2362B | success and problem eyebrows only |

**The crossover violet #5B3FD0 is not an email colour.** `tokens/themes.css` names it as the Commons
action-primary and link, but the member kit overrides both on every screen (pastel pill, ink links), so a
surface that reads the token file instead of the kit grows a solid purple the app never shows. Email reads the
kit. Muted ink is 4.2:1 on the page, so it carries only labels, meta and the postal line, never a sentence the
reader must act on. No neon hue, no iridescent sweep: Commons reserves them for earned moments in the app.

## 5. The night room (dark mode)

Both shells declare `color-scheme: light dark` and carry one `prefers-color-scheme: dark` block
that re-sets every colour to the Commons night values: canvas #0E0B09, card #18120E, strong
#FBF2E6, body #E3D6C6, muted #B3A391, a solid lavender pill with ink text, ink links. The hooks are
`data-fq` attributes, not classes, so the renderer's inline-only contract holds. Apple Mail, iOS
Mail and the Outlook apps honour it; Gmail on Android inverts on its own, which the warm light
values survive because the card is the only pure white. The wordmark is the ink PNG on a transparent
ground, as in the app; its alt text carries the name where the image does not load.

## 6. Accessibility

- `<html lang="en">`, a `<title>` when the caller gives one, both colour-scheme metas.
- Every layout table `role="presentation"`; every image has alt text that says what it shows, or `alt=""` when decorative.
- Buttons are text in a table cell, so they stay readable with images off and are read aloud; the cell carries the fill, so Outlook paints the whole 48px target.
- Link text names the destination (View event, Manage preferences), never "click here".
- Headings in order: one `<h1>` (or the block `<h2>` family), then section titles.
- A plain-text part is rendered beside every HTML part (the catalog test checks both).

## 7. Blocks (the Studio renderer)

`lib/email-studio/render.ts` draws the same system: headings in Unbounded at the display weight, body
at 16/1.55, the eyebrow as the label style, the button as the pastel pill, data cards (event, circle,
product) as `.card` at radius 24, grid cells as `.soft`, stat numerals in Unbounded, quotes in Instrument
Serif. A Space that set its own accent gets a solid pill in it and its own canvas without the wash; the
night room stays the platform's. The block shell and the member shell share the head, the header and the footer shape,
so a campaign and a receipt read as one sender.

## 8. What a template must not do

- Two buttons, or a button below the fold with nothing above it.
- A hex literal, a system font stack of its own, a solid violet, a radius other than 999 (pill), 20 (soft panel) or 24 (a card).
- Text in an image, a logo as the headline, an emoji in a subject.
- Em dashes, "click here", "unlock", "members-only" ([`CONTENT-VOICE.md`](CONTENT-VOICE.md)).
- Its own footer: every email ends in the shell's.

## Sources

Stripo, *Email design best practices* (2026); Mailsoftly, *Transactional email guide* (2026); Dyspatch,
*Email typography guide* (2026); Omnisend, *Email-safe fonts vs custom fonts* (2026); Campaign Monitor,
*The developer's guide to dark mode in email*; Courier, *Dark mode email design*; Mailjet, *Creating
accessible emails*; Email on Acid, *Accessible design system for email*; Spam Resource, *What is Gmail
clipping*. Tokens and theme rules: `design_handoff/frequency/guidelines/site-themes.md`, `tokens/themes.css`,
`tokens/typography.css`, `tokens/space-motion.css`.

## The stock hero and the shared pieces (ADR-1800)

Every platform email opens on the **stock hero** inside the top of the card: a photo of adults at play under a
blue orb (bottom left) and a purple orb (top right), the ink wordmark set into it. Five ship as pre-composed
images (`public/brand/frequency/email/hero-1..5.jpg`, rebuilt with `scripts/email-hero.py`), one picked at random
per dispatch (`pickStockHero` in `lib/theme/email-type.ts`; pass a number to pin a render). The picture is baked,
not overlaid, because Gmail and Outlook drop CSS overlays. A Space with its own logo or name keeps its own header.

Structure comes from four pieces in `lib/email.ts`; use them instead of inline styles so a new template inherits the look:

- `emailKicker(text)`: the pastel pill over the headline.
- `emailFacts(rows)`: when, where and host on a soft field.
- `emailSection(text)`: a section title in the display face, sentence case.
- `emailRow(title, meta, href)`: a list row with a round pastel go.
