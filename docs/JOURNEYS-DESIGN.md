# Journey surfaces: e-learning page design (research-backed)

> The design rules behind the Journey redesign, grounded in a six-cluster research sweep
> (lesson-player UX · syllabus nav · landing-page conversion · retrieval practice · progress
> science · mobile/cohort/visual/a11y). Pairs with [JOURNEYS.md](JOURNEYS.md) (the system) and
> [PAGE-FRAMEWORK.md](PAGE-FRAMEWORK.md) (the kit). Decision record: ADR-252.
>
> **Sourcing note:** every load-bearing claim was cross-verified across independent authoritative
> sources, but the research environment blocked direct page fetches (HTTP 403), so exact
> percentages are snippet-confirmed. Treat figures as directional; the *direction* of each rule is
> well-corroborated. Full source list at the bottom.

---

## 1. The rules (lead with the answer)

| # | Rule | Why / source |
|---|---|---|
| 1 | **Lead with outcomes, not the syllabus.** "By the end you can do X," not a topic list. | LearnWorlds, Thinkific, NN/g "value prop is a promise of value" |
| 2 | **Constrain reading measure to ~50 to 75 characters/line (~66 ideal); body ≥16px.** | Baymard line-length; Bringhurst canon; NN/g glanceable type |
| 3 | **One clear next action per lesson screen.** | Duolingo single-path redesign; iSpring lesson UX |
| 4 | **Two-pane player: collapsible syllabus + content; video on top, scroll for the rest.** | Kajabi/Teachable course-player docs; Stylokit teardown |
| 5 | **Never-empty progress bar** (pre-filled / endowed progress lifts completion, ~19%→34%). | Nunes & Drèze 2006 (JCR); Kivetz et al. 2006 (JMR, goal-gradient) |
| 6 | **Cooperative / shared progress over global ranking.** Low ranks demotivate. | HICSS 2025; competence-frustration study 2023; SDT relatedness (Deci & Ryan) |
| 7 | **Knowledge checks = retrieval practice; show corrective feedback; keep low-stakes.** | Roediger & Karpicke 2006; Butler & Roediger 2008; Agarwal 2014 (lowers anxiety) |
| 8 | **Videos ≤6 minutes** (engagement maximized ≈6 min; ~100% watch-through under 6). | Guo, Kim & Rubin 2014 (6.9M sessions); Brame 2016 (corroborates) |
| 9 | **Progressive disclosure for the syllabus; caret as the expand signifier; accordion-collapse on mobile** (heading + icon both tappable). | NN/g progressive-disclosure, accordion-icons, mobile-accordions |
| 10 | **Don't make the first viewport look finished. Let content peek to invite scroll.** | NN/g "illusion of completeness" |
| 11 | **Social proof needs counts** (show the number adopting, not a bare badge). | Baymard ratings-distribution (95% rely on reviews) |
| 12 | **Cover art is framing, not content. Keep decorative imagery OUT of lessons.** Extraneous images hurt learning in 13/14 experiments (coherence principle). | Mayer & Fiore 2014 |
| 13 | **A11y baseline:** 4.5:1 text contrast, ≥24px (AA) / 44px (AAA) targets, captions, visible focus, honor `prefers-reduced-motion`. | WCAG 2.1/2.2; WebAIM; Apple HIG; Material |

---

## 2. Per-surface decisions (mapped to our routes)

**Browse index `/journeys` (IndexTemplate).** Outcome-led `EntityCard`s carrying a 16:9 cover, the
Pillar accent, and adopt-count social proof. The "start" path is never buried under decoration.

**Discovery / landing `/journeys/[slug]` (DetailTemplate).** The highest-leverage page:
- Hero band: cover + name + **one-line outcome** + a **first-person primary CTA** ("Start this Journey").
- Then **curriculum preview as outcomes** (Phases, each "what you'll be able to do"), the **host byline**,
  **social proof** (adopt count), and a **reward preview** (Gems / certificate).
- Content peeks above the fold (rule 10); no full-screen hero, no autoplay video.

**Lesson player `/journeys/[slug]/learn`.** Two-pane:
- **Left:** collapsible Phase → **Module** → Lesson syllabus: caret signifier, done checkmarks,
  current lesson highlighted, future phases shown locked once drip lands (J-backlog #1). A
  **never-empty progress bar** at the top.
- **Right:** the active lesson at a **~65ch measure**, **text-base** body, **video on top** (≤6 min),
  and **one** next action ("Mark complete & continue").
- **Mobile:** the syllabus collapses to an accordion sheet; ≥44px tap targets; single scroll.

**Progress.** Never-empty bar; phase + journey celebration moments; the **cohort meter** when in a Run;
streak with a **freeze** (a missed day shouldn't reset momentum, per Lally 2010; Duolingo).

**Knowledge-check.** Inline question + options, **instant correct/incorrect feedback + retry**, no
penalty, framed as "check your understanding" (formative, anxiety-lowering, per Agarwal 2014).

---

## 3. Imagery & visual

- **Covers: 16:9, photographic, warm** (picsum seeded for now; swappable to curated art later). The
  cover frames the journey; it is not part of the teaching surface.
- **Inside lessons, imagery must teach** (a diagram, the actual ≤6-min video). Decorative "seductive
  details" raise extraneous load and *hurt* comprehension (rule 12). Allowed hosts: `**.supabase.co`,
  `picsum.photos`, `i.pravatar.cc` (Next image allowlist).

## 4. Anti-patterns to avoid

- Full-screen / autoplay hero video (slow load, distracts from CTA, illusion of completeness).
- **Global leaderboards** on a cohort product (demotivate lower-ranked learners).
- A wall of metrics on the landing page instead of outcomes.
- Full-bleed lesson prose wider than ~75ch.
- Right-facing chevron as an expand signifier (reads as "navigate," not "expand"; use a caret).

## 5. Sources (cross-verified; figures snippet-confirmed)

1. Guo, Kim & Rubin (2014), *How Video Production Affects Student Engagement* (L@S): the ≤6-min finding. DOI 10.1145/2556325.2566239.
2. Brame (2016), *Effective Educational Videos* (CBE-LSE): corroborates Guo.
3. Roediger & Karpicke (2006), *Test-Enhanced Learning* (Psych Science): testing effect.
4. Karpicke & Roediger (2008), *The Critical Importance of Retrieval* (Science).
5. Butler & Roediger (2008), *Feedback Enhances… Multiple-Choice Testing* (Memory & Cognition).
6. Agarwal et al. (2014), *Retrieval practice reduces test anxiety* (JARMAC): low-stakes framing.
7. Dunlosky et al. (2013), *Improving Students' Learning* (PSPI): practice testing + spacing rate "high utility."
8. Nunes & Drèze (2006), *The Endowed Progress Effect* (JCR 32(4)): never-empty bar.
9. Kivetz, Urminsky & Zheng (2006), *Goal-Gradient Hypothesis Resurrected* (JMR 43(1)).
10. NN/g: Progressive Disclosure; Accordion Icons (caret); Accordions on Mobile; Illusion of Completeness; Scrolling and Attention; F-Pattern; Progress Indicators.
11. Baymard: Line-Length Readability; Ratings-Distribution Summary.
12. Mayer & Fiore (2014), *Coherence/Signaling/Redundancy principles*: decorative imagery hurts learning.
13. WCAG 2.1/2.2 (target size, contrast 1.4.3, reduced motion C39); WebAIM checklist; Apple HIG / Material (44/48px targets).
14. Reich & Ruipérez-Valiente (2019), *The MOOC Pivot* (Science): real self-paced completion (~3 to 6%).
15. SDT: Deci & Ryan (2000) relatedness; HICSS 2025 (collaborative > competitive); competence-frustration & leaderboards (2023).
16. Platform teardowns: Kajabi / Teachable course-player docs (two-pane, sidebar, resume); Duolingo home-screen redesign (single path); LearnWorlds / Thinkific / Maven (outcome-led landing pages).
