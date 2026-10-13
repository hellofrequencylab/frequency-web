# Site themes: Stage and Commons

Frequency runs two intentional themes. **Stage** (dark) sells. **Commons** (light) is where the network lives. They share four **crossover hues** at two volumes, plus the logo, the type and the iridescent sweep, so moving from an ad to the app feels like walking from the hall into the lobby of the same building.

## What the data says
- **Light wins for doing.** In NN/g's review of the polarity research, light mode (dark text on a light background) beat dark mode for visual acuity and proofreading, at every age. The advantage grows as text gets smaller. The signed-in network is small text, lists, names, times, forms and messages, so it defaults to light.
- **Dark wins for feeling.** Dark interfaces read as cinematic and premium, and they suit low light. Big display type shrinks the polarity penalty (which is driven by small text), so a marketing site with 40 to 100px headlines and short paragraphs can be dark without a readability cost.
- **People switch by context.** NN/g observed roughly a third of users in dark, a third in light, and the rest switching by context. Night-time dark use is much higher. So Commons honours the system setting and dims to its night room after sunset; it never forces dark.
- **The tradeoff is known.** A 2026 mobile study found light mode gave faster reading and lower workload, while dark mode was rated more comfortable on the eyes. Use light for tasks, dark for atmosphere.
- **Hybrid is best practice.** Light by default, dark used with purpose, is the common recommendation for content sites. Frequency takes that literally: the purpose is the campaign.

## The two themes
| | **Stage** (`data-theme="stage"`) | **Commons** (`data-theme="commons"`, default) |
|---|---|---|
| Job | Stop the scroll, sell the feeling, get the first "Save my spot" | Get you to Thursday: find, RSVP, check in, talk, host |
| Where | Homepage, campaign pages, persona doors, Labs vision, ads, social | Today, Circles, Events, Spaces, profiles, messages, Space tools |
| Canvas | UV void `#0A0612`, plum surfaces | Sand `#FBF7F0`, white cards |
| Crossover hues | **Neon**: violet `#8B5CFF`, magenta `#FF2BD6`, aqua `#3DF2FF`, sun `#FFC46B` | **Deep**: violet `#5B3FD0`, magenta `#B0287F`, aqua `#17788A`, sun `#9A6200` |
| Primary action | Iridescent button (`.fq-iri-btn`) or magenta, with bloom | Deep violet, white text, soft shadow |
| Iridescent | Signature: one phrase per headline, hero CTA, rims | Earned only: trophies, tickets, Crew, a check-in confirmation |
| Aura | Full, behind heroes and closers | Hero areas and the Mindless orb only, low opacity |
| Type | Unbounded at 40–104px, short lines, 18px+ body | Unbounded only for page and card titles; Hanken 16px body, 14px dense |
| Imagery | B-roll, graded dark, grain | Members' real photos at full light, faces first |
| Motion | Drift, beat, shimmer | Breath on live things only; everything else still |
| Night | Always dark | Dims to the Thermal room (system dark or after sunset); crossover hues lift to stay AA |

## Crossover hues: one meaning in both themes
| Hue | Meaning | Stage | Commons |
|---|---|---|---|
| **Violet** | Act: the one thing to do next | Glow and aura base | Primary button, links, focus |
| **Magenta** | Live, now, tonight | Live chips, bloom | Live dot, "starting soon," notifications |
| **Aqua** | Presence: who's there, checked in | Accent, links | Check-ins, "11 of 14 showed up," success |
| **Sun** | Reward | Zaps highlight | Zaps, Gems, earned moments |

The iridescent sweep is these four hues blended, so it's the one element that's identical in both themes.

## The doorway (Stage → Commons)
Sign-up and first-run onboarding are where the themes hand over. The screen starts on Stage (the night you came for) and cross-fades to Commons as you pick your first Circle, like house lights coming up. After that, a member only sees Stage again in campaign moments: a Labs announcement, or the screen for a live event.

## Rules
- Never put long reading (help articles, Space pages, messages) on Stage.
- Never put neon hues on Commons light. Always use the deep values; they pass AA for text.
- Stage body text is at least 18px, in `--text-body` `#D9CFEA` (not pure white), at most 62ch.
- One iridescent element per Commons screen, and only for something earned.
- Data-heavy Space tools (CRM, tickets, payouts) are always Commons, even inside a Stage campaign flow.

## Sources
- NN/g, Dark Mode vs. Light Mode: Which Is Better?
- Vargas (2026), Dark Mode vs. Light Mode: Effects on Mobile Focus, Readability, and Task Performance (Springer)
- Dogtown Media summary of NN/g usage observations; Wildcore and Watsspace summaries of the hybrid recommendation

## Commons member layer
Built in the Members app and now part of core `tokens/themes.css` and `tokens/base.css`.
- **Accent `--pa`:** pastel iridescent gradient `#EEC1EC → #C4B8FF → #A3D4FF → #8FE9FF` (120deg). Use it only where it means something: primary actions, progress, live dots. Text on `--pa` is ink. Pair with `--pa-glow`; use `--pa-soft` for washes and the caught-up card, `--pa-orb` for breathing orbs. Deep violet stays for links, focus and text accents.
- **Ink:** softened for the member surface. Strong `#34312E`, body `#4D4945`, muted `#7C766F`, faint `#A59F98`. Hairline `rgba(30,27,24,.07)`, track `rgba(30,27,24,.06)`.
- **Glass panel** (`.fq-panel`): `--glass-panel` gradient, blur 16 saturate 1.3, `--glass-panel-shadow`, radius 24.
- **Wash** (`.fq-wash`): fixed lilac, aqua and violet radial ellipses behind the page.
- **Tooltip / toast** (`.fq-tip`, `.fq-toast`): dark pill `rgba(52,49,46,.92)`, white text; toasts sit bottom-centre 76px and hide after 2.8s.
- **Logo flow** (`.fq-logo-flow`): the wordmark as a mask over ink 88%, with an iridescent band drifting across it every 16s. Stops under reduced motion.
- **Radii in use:** 14 tooltip, 16 icon buttons and thumbs, 20 listings, 22 small cards, 24 panels, 28 hero and end cap, pill for buttons and chips. Primary CTA 48px, hit target 44px minimum.
