# Membership teaser gate + header quick-nav

Two member-facing additions to the authenticated app shell.

## 1. Header quick-nav (Feed · Circles)

`components/layout/app-shell.tsx` — two text links in the top-right cluster, just
left of the search pill, **desktop only**. Styled in the brand amber ("light
burnt orange", `text-primary`) with an active pill state.

- **Feed** → `/feed` (your live activity stream).
- **Circles** → `/circles` (the web of groups you can find and join — the app's
  "network"). Repoint either by editing the small array in the header; it's a
  one-liner.

## 2. Teaser gate — tease premium content, meter the peek

Goal: a below-tier member can **look** at tier-gated content (a circle, event,
interest, best-practice page) for a limited time, but **can't engage**. When the
timer runs out *or* they click to interact, the content blurs and an "Upgrade
membership" prompt appears. Tease what they don't have.

### How it works

`components/teaser-gate.tsx` — a reusable client wrapper:

```tsx
<TeaserGate
  allowed={teaserAllowed({ role, hasAccess })}
  resourceKey={`circle:${id}`}
  previewSeconds={TEASER_PREVIEW_SECONDS}   // 30
  title="Crew unlocks the full circle"
  body="…"
>
  {gatedBody}
</TeaserGate>
```

- **`allowed` viewer** → renders children untouched. Zero overhead, no client JS
  effects beyond the trivial passthrough.
- **Below-tier viewer**:
  - Content renders fully readable (the tease); scrolling/reading works.
  - **Interaction trigger** — a capture-phase click handler swallows *any* click
    inside the subtree (join, RSVP, like, comment, links) and trips the gate
    immediately. No per-control wiring.
  - **Time trigger** — a countdown (visible "Preview · 18s" pill) metered
    per-resource in `localStorage` (`freq_teaser_meter_v1`), paused while the tab
    is hidden. At zero, the content blurs (`blur-[6px]`, inert) and the upgrade
    modal appears.
  - The meter is **per-resource and remembered**, so a viewer gets one genuine
    peek per circle/event, not infinite refreshes. "Keep looking" dismisses the
    modal but leaves a persistent "Upgrade to unlock" nudge over the blurred body.
- Routes to `/upgrade` (the existing member→Crew upgrade page).

### Tier logic + master switch — `lib/teaser.ts`

- `TEASER_GATE_ENABLED` (**default `false`**) — master switch. While the beta is
  free-for-all, the gate is **wired in but dormant**: `teaserAllowed()` returns
  `true` for everyone, so there's zero change to the live experience. Flip to
  `true` when paid tiers go live.
- `TEASER_MIN_ROLE = 'crew'` — the tier that gets full access (crew and above).
- `TEASER_PREVIEW_SECONDS = 30` — peek length.
- `teaserAllowed({ role, hasAccess })` — `true` if the gate is off, the viewer is
  Crew+, or `hasAccess` is set (non-tier reasons: already a circle member, the
  event host, etc.) — so we only ever tease people who genuinely lack access.

### Where it's wired

- **Circle detail** (`app/(main)/circles/[slug]/page.tsx`) — the body (feed +
  members rail) is wrapped; the title/host/join header stays visible as the hook.
  `allowed = teaserAllowed({ role, hasAccess: isMember })`.

Applying it elsewhere (event detail, interest/channel detail, best-practice
pages) is the same one-liner wrap around the page body. The header/title should
stay outside the gate so there's something to tease toward.

### Design note (soft vs hard gate)

This is a **soft** gate: the teased content is in the DOM (that's what makes the
peek instant and lets them see what they're missing). That's correct for teasing
premium *surfaces*. Genuinely sensitive data should still be gated server-side
before it reaches the client — the teaser gate is presentation, not security.
