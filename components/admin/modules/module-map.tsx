'use client'

import type { ComponentType } from 'react'
import { CircleSettingsModule } from './circle-settings-module'
import { CircleTextModule } from './circle-text-module'
import { HubSettingsModule } from './hub-settings-module'
import { NexusSettingsModule } from './nexus-settings-module'
import { EventSettingsModule } from './event-settings-module'
import { ChannelSettingsModule } from './channel-settings-module'

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
  'hub.settings': HubSettingsModule,
  'nexus.settings': NexusSettingsModule,
  'event.settings': EventSettingsModule,
  'channel.settings': ChannelSettingsModule,
}
