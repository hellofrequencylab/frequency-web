'use client'

import type { ComponentType } from 'react'
import { CircleSettingsModule } from './circle-settings-module'
import { CircleTextModule } from './circle-text-module'
import { CirclePlaceTimeModule } from './circle-place-time-module'
import { CirclePeopleModule } from './circle-people-module'
import { CircleEngageModule } from './circle-engage-module'
import { CirclePracticeModule } from './circle-practice-module'
import { CircleInsightsModule } from './circle-insights-module'
import { HubSettingsModule } from './hub-settings-module'
import { HubPeopleModule } from './hub-people-module'
import { HubLayoutModule } from './hub-layout-module'
import { HubInsightsModule } from './hub-insights-module'
import { HubDangerModule } from './hub-danger-module'
import { NexusSettingsModule } from './nexus-settings-module'
import { NexusPeopleModule } from './nexus-people-module'
import { NexusLayoutModule } from './nexus-layout-module'
import { NexusInsightsModule } from './nexus-insights-module'
import { NexusDangerModule } from './nexus-danger-module'
import { EventSettingsModule } from './event-settings-module'
import { EventPeopleModule } from './event-people-module'
import { PracticeGuidedModule } from './practice-guided-module'
import { PracticeSettingsModule } from './practice-settings-module'
import { PracticeInsightsModule } from './practice-insights-module'
import { ChannelSettingsModule } from './channel-settings-module'
import { ChannelInsightsModule } from './channel-insights-module'
import { ChannelDangerZone } from './channel-danger-zone'
import { JourneySettingsModule } from './journey-settings-module'
import { JourneyBuilderModule } from './journey-builder-module'
import { JourneyExportModule } from './journey-export-module'
import { JourneyDangerModule } from './journey-danger-module'
import { SpaceBasicsModule } from './space-basics-module'
import { SpaceBrandingModule } from './space-branding-module'
import { SpaceSettingsModule } from './space-settings-module'
import { SpacePageModule } from './space-page-module'
import { PersonalProfileModule } from './personal-profile-module'
import { PersonalSpotlightModule } from './personal-spotlight-module'
import { PersonalLayoutModule } from './personal-layout-module'
import { PersonalAppearanceModule } from './personal-appearance-module'

// The collapsed "Engage" inline body (ADR-846): the circle's shared challenges PLUS this week's practice,
// stacked under the ONE `circle.engage` module. Both were separate `engage`-slot rows on the same
// authority (circle.assignTask) for the same subject — what the circle is doing together — so the
// seven-box core-entity shape gives Engage one box. The `circle.practice` catalog row is gone; its picker
// is NOT (it renders right here), mirroring how SpaceProfileSettingsModule stacks three section editors.
function CircleEngageAndPracticeModule() {
  return (
    <>
      <CircleEngageModule />
      <CirclePracticeModule />
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

export const MODULE_COMPONENTS: Record<string, ComponentType> = {
  'circle.settings': CircleSettingsModule,
  'circle.text': CircleTextModule,
  'circle.placeAndTime': CirclePlaceTimeModule,
  'circle.people': CirclePeopleModule,
  // ONE Engage box (ADR-846): the shared challenges + this week's practice, stacked.
  'circle.engage': CircleEngageAndPracticeModule,
  'circle.insights': CircleInsightsModule,
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
