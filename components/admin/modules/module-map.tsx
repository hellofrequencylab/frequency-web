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
import { EventPlaceTimeModule } from './event-place-time-module'
import { EventPeopleModule } from './event-people-module'
import { EventEngageModule } from './event-engage-module'
import { PracticeSettingsModule } from './practice-settings-module'
import { PracticeInsightsModule } from './practice-insights-module'
import { ChannelSettingsModule } from './channel-settings-module'
import { ChannelInsightsModule } from './channel-insights-module'
import { JourneySettingsModule } from './journey-settings-module'
import { JourneyBuilderModule } from './journey-builder-module'
import { JourneyExportModule } from './journey-export-module'
import { JourneyDangerModule } from './journey-danger-module'
import { SpaceBasicsModule } from './space-basics-module'
import { SpaceModeModule } from './space-mode-module'
import { SpacePageModule } from './space-page-module'
import { PersonalProfileModule } from './personal-profile-module'
import { PersonalSpotlightModule } from './personal-spotlight-module'
import { PersonalLayoutModule } from './personal-layout-module'

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
  'circle.engage': CircleEngageModule,
  'circle.practice': CirclePracticeModule,
  'circle.insights': CircleInsightsModule,
  'hub.settings': HubSettingsModule,
  'hub.people': HubPeopleModule,
  'hub.layout': HubLayoutModule,
  'hub.insights': HubInsightsModule,
  'hub.danger': HubDangerModule,
  'nexus.settings': NexusSettingsModule,
  'nexus.people': NexusPeopleModule,
  'nexus.layout': NexusLayoutModule,
  'nexus.insights': NexusInsightsModule,
  'nexus.danger': NexusDangerModule,
  'event.settings': EventSettingsModule,
  'event.placeAndTime': EventPlaceTimeModule,
  'event.people': EventPeopleModule,
  'event.engage': EventEngageModule,
  'practice.settings': PracticeSettingsModule,
  'practice.insights': PracticeInsightsModule,
  'channel.settings': ChannelSettingsModule,
  'channel.insights': ChannelInsightsModule,
  // Journey rail (ADR-515 Phase 6). Settings mounts the self-contained JourneySettings editor inline;
  // Builder/Layout links out to the full-page builder (the block tree is data-heavy — the hub/nexus
  // pattern); Export is a light inline control; Danger is inline (never banked). Each self-fetches its
  // read-gated bundle (getJourneyRailData) and renders nothing for a non-owner.
  'journey.settings': JourneySettingsModule,
  'journey.builder': JourneyBuilderModule,
  'journey.export': JourneyExportModule,
  'journey.danger': JourneyDangerModule,
  // Space inline config surfaces (inline-first rail, ADR-514). These are the SPACE_SURFACES whose
  // `render` is 'inline' — Basics / Mode / Page — each a thin wrapper that self-fetches its read-gated
  // data and mounts the existing editor in the flattened bar. The Space's feature workflows (Members,
  // CRM, Offerings, Services, QR, Email, Insights, Billing, Danger) stay `render: 'link'` and draw a
  // link-row instead, so they are NOT in this map.
  'space.basics': SpaceBasicsModule,
  'space.mode': SpaceModeModule,
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
}
