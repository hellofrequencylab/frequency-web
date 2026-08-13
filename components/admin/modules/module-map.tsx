'use client'

import type { ComponentType } from 'react'
import dynamic from 'next/dynamic'
const CircleGuidedModule = dynamic(() => import('./circle-guided-module').then((m) => m.CircleGuidedModule))
const EventGuidedModule = dynamic(() => import('./event-guided-module').then((m) => m.EventGuidedModule))
const JourneyGuidedModule = dynamic(() => import('./journey-guided-module').then((m) => m.JourneyGuidedModule))
const CircleSettingsModule = dynamic(() => import('./circle-settings-module').then((m) => m.CircleSettingsModule))
const CircleTextModule = dynamic(() => import('./circle-text-module').then((m) => m.CircleTextModule))
const CirclePlaceTimeModule = dynamic(() => import('./circle-place-time-module').then((m) => m.CirclePlaceTimeModule))
const CirclePeopleModule = dynamic(() => import('./circle-people-module').then((m) => m.CirclePeopleModule))
const CircleEngageModule = dynamic(() => import('./circle-engage-module').then((m) => m.CircleEngageModule))
const CirclePracticeModule = dynamic(() => import('./circle-practice-module').then((m) => m.CirclePracticeModule))
const CircleJourneyRunModule = dynamic(() => import('./circle-journey-run-module').then((m) => m.CircleJourneyRunModule))
const CircleInsightsModule = dynamic(() => import('./circle-insights-module').then((m) => m.CircleInsightsModule))
const CircleMoveModule = dynamic(() => import('./circle-move-module').then((m) => m.CircleMoveModule))
const HubSettingsModule = dynamic(() => import('./hub-settings-module').then((m) => m.HubSettingsModule))
const HubPeopleModule = dynamic(() => import('./hub-people-module').then((m) => m.HubPeopleModule))
const HubLayoutModule = dynamic(() => import('./hub-layout-module').then((m) => m.HubLayoutModule))
const HubInsightsModule = dynamic(() => import('./hub-insights-module').then((m) => m.HubInsightsModule))
const HubDangerModule = dynamic(() => import('./hub-danger-module').then((m) => m.HubDangerModule))
const NexusSettingsModule = dynamic(() => import('./nexus-settings-module').then((m) => m.NexusSettingsModule))
const NexusPeopleModule = dynamic(() => import('./nexus-people-module').then((m) => m.NexusPeopleModule))
const NexusLayoutModule = dynamic(() => import('./nexus-layout-module').then((m) => m.NexusLayoutModule))
const NexusInsightsModule = dynamic(() => import('./nexus-insights-module').then((m) => m.NexusInsightsModule))
const NexusDangerModule = dynamic(() => import('./nexus-danger-module').then((m) => m.NexusDangerModule))
const EventSettingsModule = dynamic(() => import('./event-settings-module').then((m) => m.EventSettingsModule))
const EventPeopleModule = dynamic(() => import('./event-people-module').then((m) => m.EventPeopleModule))
const PracticeGuidedModule = dynamic(() => import('./practice-guided-module').then((m) => m.PracticeGuidedModule))
const PracticeSettingsModule = dynamic(() => import('./practice-settings-module').then((m) => m.PracticeSettingsModule))
const PracticeInsightsModule = dynamic(() => import('./practice-insights-module').then((m) => m.PracticeInsightsModule))
const ChannelSettingsModule = dynamic(() => import('./channel-settings-module').then((m) => m.ChannelSettingsModule))
const ChannelInsightsModule = dynamic(() => import('./channel-insights-module').then((m) => m.ChannelInsightsModule))
const ChannelDangerZone = dynamic(() => import('./channel-danger-zone').then((m) => m.ChannelDangerZone))
const JourneySettingsModule = dynamic(() => import('./journey-settings-module').then((m) => m.JourneySettingsModule))
const JourneyBuilderModule = dynamic(() => import('./journey-builder-module').then((m) => m.JourneyBuilderModule))
const JourneyExportModule = dynamic(() => import('./journey-export-module').then((m) => m.JourneyExportModule))
const JourneyDangerModule = dynamic(() => import('./journey-danger-module').then((m) => m.JourneyDangerModule))
const SpaceBasicsModule = dynamic(() => import('./space-basics-module').then((m) => m.SpaceBasicsModule))
const SpaceBrandingModule = dynamic(() => import('./space-branding-module').then((m) => m.SpaceBrandingModule))
const SpaceSettingsModule = dynamic(() => import('./space-settings-module').then((m) => m.SpaceSettingsModule))
const SpacePageModule = dynamic(() => import('./space-page-module').then((m) => m.SpacePageModule))
const PersonalProfileModule = dynamic(() => import('./personal-profile-module').then((m) => m.PersonalProfileModule))
const PersonalSpotlightModule = dynamic(() => import('./personal-spotlight-module').then((m) => m.PersonalSpotlightModule))
const PersonalLayoutModule = dynamic(() => import('./personal-layout-module').then((m) => m.PersonalLayoutModule))
const PersonalAppearanceModule = dynamic(() => import('./personal-appearance-module').then((m) => m.PersonalAppearanceModule))

// The collapsed "Engage" inline body (ADR-846): the circle's shared challenges PLUS this week's practice,
// stacked under the ONE `circle.engage` module. Both were separate `engage`-slot rows on the same
// authority (circle.assignTask) for the same subject — what the circle is doing together — so the
// seven-box core-entity shape gives Engage one box. The `circle.practice` catalog row is gone; its picker
// is NOT (it renders right here), mirroring how SpaceProfileSettingsModule stacks three section editors.
//
// Start a Run joins them (circle rail trim). It was the `circle-journey-run` block in the member-facing
// side column: a host write action taxing the column everyone else reads, and unlike the invite block it
// had nowhere else to go. A Run is one Circle going through one Journey together, which is the same
// subject Engage already holds, so it stacks here on the SAME reasoning ADR-846 used rather than adding
// an eighth box. Its own read keeps its original circle.editSettings gate, which the same people hold as
// this module's circle.assignTask (both are granted together to whoever manages the circle), so nothing
// widened and nothing narrowed.
function CircleEngageAndPracticeModule() {
  return (
    <>
      <CircleEngageModule />
      <CirclePracticeModule />
      <CircleJourneyRunModule />
    </>
  )
}

// The collapsed "Profile and Settings" inline body (ADR-782): the three former shell section editors
// (Identity & Branding · Info & Connect · Settings) stacked, so the single `space.basics` module renders
// the full config inline on the rail — matching what the /manage console's card opens (/settings/basics).
function SpaceProfileSettingsModule() {
  return (
    <>
      <SpaceBrandingModule />
      <SpaceBasicsModule />
      <SpaceSettingsModule />
    </>
  )
}

// The render layer of the admin-module registry (ADR-250 step 1). The catalog
// (lib/admin/modules/registry.ts) stays pure metadata — it must, because the module
// components import `moduleById` from it for their own label/icon, so the catalog can
// never import the components back without a cycle. This map closes that loop at the
// render boundary instead: registry decides WHICH modules show for a scope; this map
// turns each module id into its component. Add a module = one catalog entry + one line
// here, with no edit to the dock's dispatch logic.

// ── 🔴 EVERY MODULE IS `next/dynamic`, AND THAT IS A PERFORMANCE FIX, NOT A STYLE CHOICE ────────
//
// These 42 modules are the OPERATOR admin console. They used to be static imports, and this file is
// reached from `components/layout/app-shell.tsx` → `AdminBar` → `settings-panel.tsx` → here, with no
// code-split boundary anywhere on the path. So every module page shipped the entire operator console
// to every MEMBER, who then rendered none of it: `admin-bar.tsx` returns null unless the viewer can
// actually open the rail.
//
// MEASURED, 2026-08-13, against the production build and the first-party vitals sink (ADR-922):
//
//   · median `app/(main)` route  2.78 MB eager JS   vs  1.30 MB outside the shell
//   · `/feed`                    2.88 MB raw / 867 KB gzipped, 49 files
//   · FCP p75 inside the shell   4,623 ms            vs  3,274 ms outside
//   · INP p75                    224 ms              vs  136 ms
//   · TTFB p75                   155 ms              vs  569 ms  ← the SERVER is fast
//
// That last line is the whole diagnosis: the wait a member feels after a reload, before links
// respond, is not the server. It is this file, parsed on their phone.
//
// The proof it was really shipping: the string "This nexus is archived", which exists only in
// nexus-danger-module.tsx, was found inside a shell chunk that every member downloads.
//
// ⚠️ DO NOT "TIDY" THESE BACK INTO STATIC IMPORTS. A static import here is invisible in review and
// costs every member on every page. `dynamic()` keeps each module in its own chunk, fetched when the
// rail actually opens. Nothing about behaviour changes: `hasContent` derives from the section count
// in settings-panel.tsx, not from whether a component is resolved.
//
// There is no guard for this. The repo gates the SERVER artifact (`check:build-budget`) and has
// NOTHING measuring client first-load JS, which is how 1.8 MB accumulated unnoticed. That gap is
// recorded as follow-up work rather than fixed here.

export const MODULE_COMPONENTS: Record<string, ComponentType> = {
  // Edit re-entry (ADR-450 §2 · ADR-994 · ADR-996). ONE surface (guided-module.tsx) behind four
  // entities: each of these is a ~30-line declaration of its manifest, its read-gated getter, and
  // its two actions. The steer dials, the diff, and the put-it-back are written once.
  'circle.guided': CircleGuidedModule,
  'circle.settings': CircleSettingsModule,
  'circle.text': CircleTextModule,
  'circle.placeAndTime': CirclePlaceTimeModule,
  'circle.people': CirclePeopleModule,
  // ONE Engage box (ADR-846): the shared challenges + this week's practice, stacked.
  'circle.engage': CircleEngageAndPracticeModule,
  'circle.insights': CircleInsightsModule,
  // Move this circle (the circle-side half of ADR-843), on the `danger` slot: it is the one circle
  // control whose effect lands outside the circle, so it sits in the obscured band rather than
  // inside the Settings box every other in-place edit shares.
  'circle.transfer': CircleMoveModule,
  'hub.settings': HubSettingsModule,
  'hub.people': HubPeopleModule,
  // hub.layout / nexus.layout / journey.builder are `render: 'link'` since ADR-846 (thin cards whose whole
  // body was one link out, folded into their Settings box as that link row), so these bindings are not
  // mounted today. They stay mapped so the id keeps a working inline body if a future change flips it back.
  'hub.layout': HubLayoutModule,
  'hub.insights': HubInsightsModule,
  'hub.danger': HubDangerModule,
  'nexus.settings': NexusSettingsModule,
  'nexus.people': NexusPeopleModule,
  'nexus.layout': NexusLayoutModule,
  'nexus.insights': NexusInsightsModule,
  'nexus.danger': NexusDangerModule,
  // The former event.placeAndTime + event.engage editors folded into event.settings (Event page
  // overhaul), so the host edits the whole event in one flow. People stays its own module.
  'event.guided': EventGuidedModule,
  'event.settings': EventSettingsModule,
  'event.people': EventPeopleModule,
  // Edit re-entry (ADR-450 §2 · ADR-994): the Guided section leads the practice rail — the Spark's
  // own steer dials (mood · directions · lock) run over the LIVE practice, with the diff shown after
  // each redraw and a one-tap put-it-back.
  'practice.guided': PracticeGuidedModule,
  'practice.settings': PracticeSettingsModule,
  'practice.insights': PracticeInsightsModule,
  'channel.settings': ChannelSettingsModule,
  'channel.insights': ChannelInsightsModule,
  'channel.danger': ChannelDangerZone,
  // Journey rail (ADR-515 Phase 6). Settings mounts the self-contained JourneySettings editor inline;
  // Builder/Layout links out to the full-page builder (the block tree is data-heavy — the hub/nexus
  // pattern); Export is a light inline control; Danger is inline (never banked). Each self-fetches its
  // read-gated bundle (getJourneyRailData) and renders nothing for a non-owner.
  'journey.guided': JourneyGuidedModule,
  'journey.settings': JourneySettingsModule,
  'journey.builder': JourneyBuilderModule,
  'journey.export': JourneyExportModule,
  'journey.danger': JourneyDangerModule,
  // Space inline config surfaces (inline-first rail, ADR-514). These are the space modules whose
  // `render` is 'inline' — Profile and Settings / Page — each a thin wrapper that self-fetches its
  // read-gated data and mounts the existing editor in the flattened bar. The Space's feature workflows
  // (Members, CRM, the seven Offerings & money surfaces, QR, Email, Insights, Billing, Danger) stay
  // `render: 'link'` and draw a link-row instead, so they are NOT in this map. Vera autonomy + the Pipeline
  // are no longer standalone rail modules (modular menu P1b, ADR-544b): they fold into CRM.
  //
  // ADR-782: the former three shell cards (Identity & Branding + Info & Connect + Settings) collapsed into
  // ONE `space.basics` "Profile and Settings" module. Its inline body stacks the three existing section
  // editors (Branding · Info & Connect · Settings) so the rail keeps the full config in one surface.
  'space.basics': SpaceProfileSettingsModule,
  'space.layout': SpacePageModule,
  // Personal "You" apps (ADMIN-RAIL.md Phase 4 / ADR-515 Phase 2) — self-account settings for any
  // signed-in viewer. The rail BODY is just three inline surfaces: Profile (identity), a condensed
  // Spotlight, and a Layout link, each a thin wrapper that self-fetches its read-gated bundle
  // (getProfileRailData). The secondary surfaces (account.appearance / notifications / connections /
  // privacy / billing) are `placement: 'bank'`, so they render as bottom-bank buttons via
  // hrefForEntitySurface and are NOT in this map.
  'account.profile': PersonalProfileModule,
  'account.spotlight': PersonalSpotlightModule,
  'account.layout': PersonalLayoutModule,
  // The Spotlight appearance surface (ADR-525): skin, header, background, and Top Friends — the grid-side
  // replacement for the retired Puck editor's look controls. Inline in the body next to Spotlight/Layout.
  'account.spotlightAppearance': PersonalAppearanceModule,
}
