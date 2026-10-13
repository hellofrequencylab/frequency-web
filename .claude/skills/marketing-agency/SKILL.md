---
name: marketing-agency
description: Run the Frequency brand-marketing agency, eight specialist auditors (brand, offer/value ladder, suite packaging, funnels, copy/SEO, lifecycle/in-product, help center, design/DAWN), and fold their findings into docs/LAUNCH-MARKETING-PLAN.md and backlog fragments. Use when the user says "marketing audit", "launch audit", "run the agency", "check the value ladder", or wants positioning, funnels, copy and presentation reviewed together.
---

# /marketing-agency: the launch marketing audit

The agency is eight read-only specialists in `.claude/agents/`. Each owns one discipline and reports
ranked, cited findings. You are the **agency lead**: you brief them, reconcile their findings where they
conflict, and write the result into the one master plan.

| Agent | Owns |
|---|---|
| `brand-strategist` | positioning, audiences, messaging hierarchy |
| `offer-architect` | value ladder, pricing page, upgrade triggers, checkout story |
| `suite-architect` | feature grouping and the Suite Builder |
| `funnel-architect` | entry points to activation to first sale, instrumentation |
| `copy-chief` | public copy, CTA lexicon, SEO / AEO |
| `lifecycle-marketer` | in-product nudges, empty states, AI prompts, lifecycle email |
| `help-editor` | help center coverage and IA |
| `creative-director` | DAWN theme status, marketing section patterns, a11y |

## Steps

1. **Read the plan first.** `docs/LAUNCH-MARKETING-PLAN.md` is the master plan. Re-run means "measure
   against it", not "write a new one".
2. **Brief.** Give each agent the scope from its definition plus anything the user named. If the
   sandbox is strained, run them sequentially (see `.claude/skills/meta-scan/SKILL.md` §0).
3. **Reconcile.** Where two agents disagree (a name, a tier, a CTA), the canon decides:
   NAMING, then CONTENT-VOICE, then VALUE-LADDER + `lib/pricing/*`. When code and a doc disagree,
   the code wins and the doc is fixed in the same pass.
4. **Write.** Update the plan in place. New work becomes `docs/ledger/rows/<ID>.json` fragments
   (`pnpm ledger:next`, `pnpm ledger:add`), one per finding that needs code, each with a `verify`
   probe that measures a consequence. Never record status in the plan's prose.
5. **Report.** Lead with the answer: the top five launch blockers, then the rest by phase.
