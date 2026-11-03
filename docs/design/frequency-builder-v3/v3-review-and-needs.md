# Builder v3 and New World: audit, theme blocks, and what we need

Status of every row named here lives in `docs/BUILD-BACKLOG.json` (`pnpm backlog`). This file explains; it does not track.
Source: "Frequency Builder and the New World theme" zip, revision of 2 November 2026 (147 files). Audited 2026-11-03.

## The answer first

1. The zip is two things: the **block builder** (a theme-agnostic editor with 21 roles) and **New World** (a theme, the example, with its own token system). The repo already has half of what the builder needs: 17 theme-agnostic role blocks, a presentation layer, the dial registry and the ten conformance checks. **Five roles do not exist in the repo at all** (Groups, Your first visit, Save a spot, Where we meet, Tools behind it), and four roles lack a variant the builder names. Because role blocks emit the same markup on every theme, adding them once gives all ten site themes the blocks.
2. The builder plan files in the zip (`builder/frequency-web/`) are byte-identical to what #4472 already filed under `docs/design/builder-navigation-research/`, apart from two link paths. The BLD rows are still not real ledger rows. Nothing about the plan changed; the design of the builder did.
3. The zip has seven internal contradictions and ten things that conflict with Daniel's rulings or the repo's rules (section 1). None block the work; each has a decision below.
4. Every existing theme is missing between 3 and 14 of the 21 roles as a native block. Nocturne, Network and Temple are close (15 to 18 native); Designer, Free Human, Wildheart, Bold and Default lean on the role blocks. The role blocks cover 15 of the 21 today at the contract level, so the gap that matters is the five missing roles plus presentation defaults per theme.

## 1. The zip, audited

### Inventory (what every file is)

| Path | Files | What it is | Goes into the repo? |
|---|---|---|---|
| `README.md`, `builder/README.md`, `theme-new-world/README.md` | 3 | The spec: model, shell, panels, dialogs, readiness, keyboard, 21 roles, state shape; how New World renders in the builder | Yes, filed under `docs/design/frequency-builder-v3/` |
| `builder/source/Frequency Builder v3.dc.html` (1,216 lines) | 1 | The builder as a Design Component: template plus a logic class. Holds `ROLES` (21), `PAGE_ROLES`, `accentFromHue`, readiness, Vera, history, the section markup per role | Kept in the project folder (`/mnt/project-files/builder-new-world/`), not committed (221 KB). Rebuilt in TSX, never imported |
| `builder/source/support.js`, `builder/research/support.js` | 2 | The design-component runtime. The two copies are identical | No (design tooling) |
| `builder/Frequency Builder standalone.html` (1.9 MB), `theme-new-world/demo/New World Demo standalone.html` (3.0 MB) | 2 | Bundled builds of the sources for offline use | No. Opened for behaviour, not line-audited (bundled) |
| `builder/source/_ds/...` | 8 | Frequency design-system tokens the builder chrome uses (Commons theme) | No. Already in `design_handoff/frequency/` |
| `builder/source/assets/newworld/*`, `theme-new-world/theme/*` | 6 | `newworld.css` (661 lines, rescoped to `[data-nw]`), `kits.js` (7 kits), logo. The two copies are identical | The CSS and kits are New World's, owned by the New World thread (LIVE-2042) |
| `builder/source/assets/photos/*`, icons, logo | 9 | Seven gathering photos, the 76-icon sprite, the wordmark | Photos: no (placeholders). Icons: BLD-003 adds about 14 |
| `builder/research/*` | 7 | Usability audit (42 findings), audit and proposal, navigation research, build plan (HTML and JSON) | Context only |
| `builder/frequency-web/*` | 30 | `EDITOR-NEXT.md`, `editor-next.json`, 27 BLD ledger rows, draft ADR, run instructions | Yes, filed for real in this change |
| `theme-new-world/package/*` (md) | 7 | Framework, dials, manifest schema, implementation plan, what's new, package readme | Framework is already in the repo (LIVE-1997, `lib/theme/dials.ts`). Plan steps 1 to 4 and 8 are done |
| `theme-new-world/package/frequency/*` | 3 | `kits.services.json` (16 kits), `theme-contract.services.json`, readme | **These are the Services theme, not New World** (finding 2) |
| `theme-new-world/package/reference/*` | 60 | Tokens (three tiers), components, site and product UI kits as `.jsx.txt`, HANDOFF | New World's design system: through the intake routine |

### Findings

**A. The zip contradicts itself**

1. **Services and New World are mixed.** `WHATS-NEW.md` says "Services → New World" (a rename). `HANDOFF.md` has two opening paragraphs, one for each (7 kits, five crossover accents, mixed registers vs 16 kits, six accents). The implementation plan builds `Services*` blocks and `themes.Services`. Daniel's ruling (2026-11-03): two separate themes. Action: treat `reference/tokens`, `kits.js`, `newworld.css` and the JSX as New World; treat `package/frequency/*.services.json` and the plan's Services steps as the Services theme, already built in #4504 to #4508. Do not install one as the other.
2. **Two token systems.** New World uses the alias tier (`--ink-*`, `--chrome-*`, `--flare-*`, `--swell-*`, `--halo-*`, OKLCH accents, `data-th` scoped registers). Services uses `--th-*`/`--sv-*` with named hex accents (Tide, Signal...). They cannot share a contract file. New World needs its own id (`new-world`), own tokens, own `themes.NewWorld` contract entry.
3. **Files referenced but not shipped:** `Web Theme.html`, `Kit Overview.html`, `Conformance.html`, `Theme Feature Page.html`, `Spotlight Layouts.html`, `Templates.html`, `AUDIT.md`, `github.md`. The plan's "done" criteria for steps 5, 7 and 8 point at them, so those acceptance pages cannot be reproduced from this zip. Action: ask Claude Design for them, or define the acceptance pages from the manifest `functions` table.
4. **12 functions vs 21 roles.** The theme framework draws 12 functions on four surfaces. The builder edits 21 roles. They overlap on 12; the other nine (hero, trust, story, circles, firstnight, steps, locations, business, cta) are page structure, not functions. Action: keep both vocabularies, map explicitly (section 2).
5. **Photos named, not shipped.** The package names 12 photos (`circle-sunrise`, `fire-crew`...); the builder maps all of them onto seven files. The README says to drop the real set in. No files for the 12 exist.
6. **Sample content shipped as product copy.** Kits invent businesses and people ("Dre Walker", "Maya Chen"), phone `(555) 010-0142`, hours, prices, times. The builder marks hero, story and quotes `sample: true` and blocks Publish on them; the six niche kits arrive clean ("finished demo Spaces"). In the repo, sample rows must never reach a live page (framework rule: "Sample rows only").
7. **The usability audit (42 findings) is reported "all repaired", but no finding-by-finding mapping to builder behaviour is delivered.** The findings sit in `Builder Usability Audit.dc.html` with WCAG 2.2 references. Action: BLD-901 turns them into a checklist and probes each.

**B. Conflicts with Daniel's rulings (BLD-000, 2026-11-02) and repo rules**

8. **Vera ruling 1 (questions only).** The builder ships a "How Vera helps" switch with "Suggest changes" (in-page diff with Accept). Ship "Ask me questions" only; the diff mode stays off (BLD-402 builds Vera as a coach).
9. **Calendar name, ruling 2.** The builder names the events role "Show what's happening" and the function "What's happening". Ruling: "What's Happening" everywhere, including the Space tab, the door, the email and ⌘K.
10. **Breakpoints, ruling 5.** The builder's device frames are 1280, 820, 390 and the rails collapse at 1240, 1080 and 1360. The member shell moves to shared 600, 840 and 1200. Action: BLD-002 maps the frames onto the shared breakpoints; the rail rules re-derive from them.
11. **Hard claims in sample copy.** "Joining is free, always", "Nothing is added after", "Plans that pause" read as promises. The voice guide says no hard claims and no weekly promises. These are sample words, but a host who keeps them publishes a promise. Action: soften in the repo kit port; the builder's readiness model already flags unchanged sample words.
12. **Hex literals.** The builder chrome carries 11 literal colours (`#C4B8FF`, `#1E1B18`, ...). Repo rule: no hardcoded hex in UI. BLD-001 and BLD-002 move them to tokens. `newworld.css` carries hex only in its token declarations, which is where they belong.
13. **Violet.** `#5B3FD0` (banned) does not appear anywhere in the zip. The builder's selection ring `#C4B8FF` is the Frequency lilac, fine.
14. **BLD-902 uses staging and five outside owners.** Daniel: no staging deployments for QA, and he declined manual test runs. Action: run it as an internal-Spaces cohort behind the `render_path` flag, no staging environment, and ask before any outside owner session.
15. **Theme fence.** The builder is chrome and must never wear a theme; the canvas frame carries the theme (`data-nw`). Correct in the design. In the repo the walking test `app/(main)/no-site-theme-in-member-area.test.ts` must also cover the builder route.
16. **"Midnight" in the zip** appears only as the word in kit copy ("done by midnight"). Nocturne is not named anywhere in the zip.
17. **No em dashes** in any of the zip's copy files (checked: 0 in the builder source, kits and READMEs).

**C. What is strong and should be kept as is**

The model (`Record × Contract × Dials → Surfaces`), the one rule that separates the layers (builder writes structure and words, theme owns appearance), the readiness model feeding four places from one source, the focus/dialog/radiogroup contract, reorder with a single-pointer and keyboard path, "Hide, never break" for functions the kit has off, empty states on every list block, scoped registers per section, ink labels on accent buttons (4.5:1 on all six hues, both registers), and the offline "Offline · changes kept here" save state.

## 2. The 21 roles against the repo

The repo's role registry has 17 roles (`lib/blocks/roles/*.role.json`), each with three structural variants, rendered by `components/page-editor/blocks/roles.tsx`, skinned by tokens, with a per-theme default layout (`components/sites/presentation/`).

| Builder role | Intent (host-facing) | Repo role | Gap |
|---|---|---|---|
| hero | Say who you are | `hero` (split, full, center) | Builder has split, photo, glow, minimal. Add **glow** and **minimal**; `photo` = `full` |
| trust | Show your numbers | `stats` (row, cards, band) | Add **bar** (live counts from the Space) |
| story | Tell your story | `statement` (band, pull, ticker) | Statement has no lines or quote slot. **New role `story`** (heading, soft phrase, three lines, quote by the door, photo) |
| circles | Show your groups | none | **New role `circles`** (live; sticky photo plus timetable rows). Product blocks `CirclesBrowse`, `NetworkCircles` exist but are theme-named |
| events | Show what's happening | `gatherings` (cards, rows, split) | Add **agenda** (week ribbon and agenda rows) |
| firstnight | Explain a first visit | none | **New role `firstvisit`** (numbered thread). `WildheartFirstNight`, `CircleFirstNight` exist, theme-named |
| services | List ways in | `offerings` | none |
| plans | Offer memberships | `membership` | none |
| booking | Let people save a spot | none | **New role `booking`** (next three openings, live). `SpaceBooking` exists, unskinned off Network |
| steps | Explain how it works | `steps` | none |
| reviews | Show what members say | `proof` (quote, wall, stats) | none |
| team | Introduce your hosts | `people` | none |
| gallery | Show the room | `gallery` | none |
| posts | Share what you write | `library` | none |
| shop | Sell a few things | `shop` | none |
| locations | Say where you meet | none | **New role `locations`** (address, hours, neighbourhoods, map). `NetworkKitVenue` is the only near match |
| forms | Take questions | `contact` | none |
| letter | Collect emails | `letter` | none |
| faq | Answer questions | `faq` | none |
| business | Show the tools behind it | none | **New role `business`** (the six Frequency tools). `SpaceBusiness` exists, unskinned off Network |
| cta | Invite people in | `cta` | none |

The repo also has three roles the builder does not name: `chapters`, `statement`, `stats` as a separate figures role. They stay; the builder's ⌘K "Add" lists them under More.

New roles: **circles, firstvisit, booking, locations, business, story** (six). New variants: **hero glow and minimal, gatherings agenda, stats bar** (four). That is BLD-210 and BLD-211.

## 3. Every theme against the 21 roles

● = a native block of that theme's family exists for the role, by block name (the measured version is `pnpm audit:themes`, whose baseline lists 1,110 holes: 138 per theme except Network at 112 and the retired Network at 32). · = no native block; the theme relies on the role block or has nothing.

| Role | Role block, all 10 themes | Nocturne | Network | Temple | Designer | Free Human | Wildheart | Bold | Default |
|---|---|---|---|---|---|---|---|---|---|
| hero | yes | ● | ● | ● | ● | ● | · | ● | ● |
| trust | stats, no bar | ● | ● | ● | · | · | · | · | · |
| story | statement, partial | ● | ● | ● | ● | ● | ● | · | ● |
| circles | **none** | · | ● | · | · | · | · | · | · |
| events | gatherings, no agenda | ● | ● | ● | · | ● | · | · | · |
| firstnight | **none** | · | · | · | · | · | ● | · | · |
| services | yes | ● | ● | ● | ● | ● | ● | · | · |
| plans | yes | ● | ● | ● | · | · | · | · | · |
| booking | **none** | · | ● | · | · | · | · | · | · |
| steps | yes | ● | ● | ● | ● | · | ● | · | ● |
| reviews | yes | ● | ● | ● | ● | · | · | · | · |
| team | yes | ● | ● | ● | ● | · | · | · | · |
| gallery | yes | · | · | ● | ● | · | ● | · | · |
| posts | yes | ● | ● | ● | · | ● | · | · | · |
| shop | yes | ● | ● | ● | · | · | · | · | · |
| locations | **none** | · | ● | · | · | · | · | · | · |
| forms | yes | ● | ● | ● | ● | · | · | · | · |
| letter | yes | ● | ● | ● | · | · | · | · | · |
| faq | yes | ● | ● | ● | ● | · | · | · | · |
| business | **none** | · | · | · | · | · | · | · | · |
| cta | yes | ● | ● | ● | ● | · | · | ● | ● |
| **Native count** | | 15 | 18 | 16 | 10 | 5 | 5 | 2 | 4 |

Reading it: "appropriate blocks" for a theme does not mean a hand-built block per cell. The contract is: every role renders on every theme through the role block plus that theme's presentation (tokens and a default variant), and a theme gets a **native** block only where its design system draws one. So the work per theme is (a) a presentation default for each of the 21 roles (today most themes set 5 to 9 of 17), and (b) native blocks only for roles its design system defines. Per theme:

| Theme | Offered | Register | Accents | Role defaults set today | Spotlight layouts | Email module | Dials declared (schema 2) | What it needs |
|---|---|---|---|---|---|---|---|---|
| Default (`frequency`) | yes | Day | Space accent | 0 (empty by design) | none | none | none | Presentation defaults for the roles; confirm it stays single-look |
| Bold (`bold`) | yes | Day | Space accent | 6 | none | none | none | Same |
| Wildheart | yes | Day | Space accent | 6 | none | none | none | Same; turning-sky as a theme dial |
| Network (`network-kit`) | yes | Day | Space accent | 7 | 6 | yes | none | Defaults for the 5 new roles (already has circles, booking, locations natives); firstvisit and business |
| Temple (`temple-kit`) | yes | Day, candle-dark pieces | 13 profile accents | 8 | 6 | yes | none | Defaults; arch-shape theme dial; natives for circles, booking, locations only if the design system has them |
| Nocturne (`midnight`) | yes | Night | one violet | 9 | none (preset only) | not confirmed | none | Defaults; Day register decision; mono image dial |
| Designer | yes | Day | profile accents | 7 | 6 | yes | none | Defaults; Night register decision |
| Free Human Movement | private | Day, candle-dark | profile accents | 5 | 6 | yes | none | Defaults (stays out of the main picker) |
| **New World** | not yet registered (New World thread) | Night and Day, mixed per section | 6 hue stops plus custom, vividness | n/a | 6 (drawn in #4505 for Services; New World's own in its package) | 11 templates in the package | to declare | Everything: it is the example the 21 roles were drawn against |

Every `editor-schema2.json` entry is empty, so no theme yet offers register, accent swatches, type voice, motion, hero, image, Looks or the first-selection picker. That is LIVE-2044 to 2051 (Phase 4 of the New World list), not this change.

## 4. What we need: connections, assets, surfaces

### Connections (live data each role reads)

Only four live sources are wired through `resolveFeatureSourceItems` today: offerings, events, memberships, tickets (`lib/sites/editor/live-data.ts`). Everything else the builder marks "live" needs a connection.

| Role | Reads | Source in the repo | Status |
|---|---|---|---|
| trust | Four counts: members, groups, nights, years | Space stats | Needs a connection; counts must be real, no sample numbers on a live page |
| circles | Groups with next session, members, price | Circles (`lib/circles`), Space circles | Product blocks exist; role connection needed |
| events | This month's events, RSVP, next three | `lib/sites/site-events`, calendar | `gatherings` role reads events already |
| firstnight | Static steps the host writes | Host copy | No connection; optional per-circle override |
| services | Offerings with price and length | `offerings` source | Wired |
| plans | Memberships that pause | `memberships` source | Wired |
| booking | Next three open times | Booking availability | `SpaceBooking` reads it; role connection needed |
| reviews | Member quotes | Space reviews (`SpaceReviews`) | Host-written quotes today; live reviews need a connection |
| team | Hosts and crew with faces | Space members with host role | `people` role; live option needed |
| gallery | Photos from the room | Space media library | Photo sheet needs the library as a `radiogroup` with descriptions |
| posts | Latest guides and notes | Library/posts | `library` role; live option needed |
| shop | A few products | Marketplace (`lib/marketplace`) | `shop` role; live option needed |
| locations | Address, hours, neighbourhoods | Space address and hours fields | Needs a Space hours field (HOURS is theme copy in the design) |
| forms | A message that reaches a person | Contact inbox / CRM | `contact` role posts today |
| letter | Email sign-up | Signup leads / Email Studio list | `letter` role; same as "Join the list" |
| business | The six Frequency tools | Fixed list, gated by the Space's tools | No data; reads which tools the Space has on |
| all | Save, versions, restore | Site draft and publish snapshot | Versions as restorable drafts need storage |
| all | Readiness | `lib/sites/editor/publish-checks.ts` | Extend with sample, alt and limit checks |
| Vera | Questions only | `lib/ai/voice.ts` | Ask mode only; no rewrite endpoint |

### Assets

| Asset | What | Where it comes from |
|---|---|---|
| Photo set | The 12 named New World photos (circle-sunrise to fire-crew), each with a written description | Not shipped; real photos or licensed set needed. The seven in the zip are placeholders from the design system |
| Photo descriptions | Alt text per photo (`ALT` map, 12 entries) | In the zip; carry into the library as defaults |
| Icon sprite | 76 icons plus about 14 builder icons (BLD-003) on the 24px grid | Design to deliver the 14 |
| Fonts | Unbounded, Hanken Grotesk, Instrument Serif italic (Frequency); Bricolage Grotesque, Lora, DM Mono for New World's `detail` pairing | Frequency fonts live; the `detail` pairing fonts load from Google Fonts in the design. Self-host per the repo's font rule |
| Wordmark mask and Frequency logo | Footer "Runs on Frequency", tools section | In the zip |
| Tokens | New World three tiers (core, alias, `--th-*` bridge), effects, textures | `reference/tokens/`, through the intake routine |
| Theme thumbnails | One per theme per role variant for the Add dialog (64 by 48) | BLD-201 generates from the role JSON `thumb` |
| Look previews | 4 to 6 per theme (live mini-renders) | After dials flip |
| Acceptance pages | Six HTML references named in the zip but not delivered | Request from Claude Design (finding 3) |

### Surfaces

| Surface | Builder width | Roles hidden or frozen | What exists | What is needed |
|---|---|---|---|---|
| Site | 1280 | none | Role blocks plus native blocks on all themes | The 6 new roles, 4 variants, defaults per theme |
| Profile (Space page) | 760 | none | Space page wears the Space's own font set and accent only (theme fence) | Render the 21 roles in the Frequency frame, no site theme |
| Spotlight | 720 | none | 6 layouts for Network, Temple, Designer, Free Human; Nocturne preset | Layouts for New World; doors generated from the roles a Space has on |
| Email | 600 | hides faq, gallery, business, forms, locations; freezes trust, events, circles, plans, booking, services at send | Email modules for Network, Temple, Designer, Free Human, Services | New World's 11 templates; the freeze rule at send |
| Builder chrome | n/a | n/a | Not built (BLD-101 to 108) | Commons-themed shell; never wears a site theme |
| Theme picker | n/a | n/a | Four legacy dials only | First-selection picker (kit, accent, register); LIVE-2043 |

## 5. How it lands

1. **This change (docs and rows):** file `docs/EDITOR-NEXT.md`, `docs/editor-next.json`, the 27 BLD rows, the ADR, and six new rows: BLD-210 (six new roles), BLD-211 (four variants), BLD-212 (presentation defaults for all ten themes), BLD-213 (connections), BLD-214 (assets), BLD-215 (surface parity). Reference copy of the zip's specs in `docs/design/frequency-builder-v3/`.
2. **Next change (code):** BLD-210 and BLD-211 together, because the builder needs them first and they are theme-agnostic: six role JSON files, their renderers, role CSS reading the core tokens, and the four variants. Opt-in: nothing renders unless an owner adds one, so no live site changes.
3. **Then:** BLD-212 (a presentation default per role per theme, one file per theme), then the New World thread's native blocks for the roles its design system draws.
4. **Design checks before each merge:** render signed in and out at 390, 1280, 1440, 1920 and 2000, with the console before and after (theme fence).

## 6. Decisions I need

1. **New roles: one PR or two?** I recommend one (BLD-210 and BLD-211 together), since the builder cannot show a theme until both exist.
2. **Photos.** Real set for the 12 New World names, or ship with the Frequency gathering photos as placeholders until you have them? I recommend placeholders, flagged on the page as "your photo goes here".
3. **Hard-claim copy** ("Joining is free, always"): I will soften in the kit port unless you want the builder's words.
