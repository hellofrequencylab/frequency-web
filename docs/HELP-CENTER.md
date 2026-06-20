# Help Center (public `/help`)

The public, member-facing help center. One of **three documentation homes** (see
[DOCS-PROTOCOL.md](DOCS-PROTOCOL.md)): dev docs (git `docs/`), internal training
(Notion), and this. It is **docs-as-code**: articles live in git as Markdown, ship in
the same PR as the feature they document, version with the code, and deploy statically.

No third-party docs framework and no MDX webpack coupling: content is plain Markdown
rendered with `react-markdown` (already a dependency), so we own it end to end, matching
the repo's anti-lock-in posture.

## Where things live

| Piece | Path |
|---|---|
| Article content | `content/help/<category>/<article>.md` |
| Category metadata | `content/help/<category>/_category.json` |
| Content layer (parse + types) | `lib/help/content.ts` |
| Routes | `app/(help)/help/` (home, `[category]`, `[category]/[slug]`, `changelog`) |
| Chrome (header, sidebar, search) | `app/(help)/layout.tsx` + `components/help/*` |
| Public "What's new" | renders `docs/CHANGELOG.md` at `/help/changelog` |

Public by default: `/help` is not in `proxy.ts` `PROTECTED_PATHS`, so logged-out
visitors and crawlers can read it. Pages are statically generated
(`generateStaticParams`), so help is fast and SEO-friendly.

## Authoring an article

Create `content/help/<category>/<slug>.md` with front-matter:

```markdown
---
title: How to join a Circle
description: Find a local group around what you practice and start showing up.
category: getting-started
order: 2
updated: 2026-05-31
audience: member
featureKeys: [circles, memberships]
status: published
---

Body in Markdown. Use headings, lists, links, bold, blockquotes, code.
Avoid GitHub-flavored tables (remark-gfm is not installed); use lists instead.
```

Front-matter fields:

- **title / description**: shown in nav, search, cards, and `<title>`/meta.
- **category**: must match the folder name.
- **order**: sort order within the category (lower first).
- **updated**: ISO date, shown as "Last updated" and used for freshness.
- **audience**: `member` (default), `host`, `guide`, `janitor`, or `partner`.
- **featureKeys**: the code areas this article documents (e.g. `circles`, `gamification`).
  **This is the drift hook**: when those areas change, the article is flagged for review.
- **status**: `published` (default) or `draft` (hidden from the public site).

Add a new category by creating `content/help/<category>/_category.json`
(`{ "title", "description", "order" }`).

## Versioning

One live version, always reflecting production, plus a changelog. Correct for a web
app + auto-updating mobile (almost no user is ever on an old version), so we do **not**
maintain `/help/v1` trees.

- **`docs/CHANGELOG.md`** ([Keep a Changelog](https://keepachangelog.com), written for
  humans) is the single source for the public [What's new](/help/changelog) page. Add
  entries under `## [Unreleased]` as you ship; on release, rename to `vX.Y.Z` + date.
- **Per-article `updated`** shows freshness on each page.
- Release tags `vMAJOR.MINOR.PATCH` are the machine anchor.

If a breaking app-store version ever lingers in the wild, introduce versioned doc sets
then (a local change), not before.

## How it auto-updates (the pipeline)

Help is one leg of the three-home pipeline in [DOCS-PROTOCOL.md](DOCS-PROTOCOL.md):

1. **Definition of Done**: a user-facing PR adds/updates its `content/help/*.md`.
2. **Drift hook** (`.claude/hooks/docs-drift-check.sh`): nudges when a user-facing route
   changes without a `content/help` change.
3. **`/sync-docs` skill**: updates all three homes in their own voice and stamps Notion.
4. **CI drift check** (`.github/workflows/docs-drift.yml`): annotates a PR when
   user-facing routes change without help/docs updates.

> **Becoming a living help desk.** The pipeline above (drift nudge → a human writes the doc) is the
> baseline. The planned next level is specified in [SUPPORT-SYSTEM.md](SUPPORT-SYSTEM.md)
> (decisions: [ADR-067](DECISIONS.md)): AI/RAG search, an AI doc-writer that drafts updates + a
> staff review checklist, and a measured coverage matrix.

## Future expansion (designed-for, not built)

- **AI search**: the chosen direction is **RAG over `content/help` in Vera's voice**, with citations
  + a human fallback, behind the same `<HelpSearch>` props. See
  [SUPPORT-SYSTEM.md](SUPPORT-SYSTEM.md). (Pagefind/Orama remain the no-AI substring upgrade if ever
  needed.)
- **Subdomain**: serve at `help.frequencylocal.com` by rewriting it to `/help` (all content
  is already under the `/help` path).
- **Non-engineer editing**: a light authoring UI in Studio that commits Markdown via PR,
  keeping git as source of truth.
- **Localization**: `content/help/<locale>/<category>/...` with a locale segment.
- **Per-audience views**: `audience` front-matter already supports filtering (e.g. a
  host-only help section).
