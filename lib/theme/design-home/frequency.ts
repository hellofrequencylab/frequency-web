import type * as Dawn from './dawn'

// The Frequency build's stand-ins for the DAWN front door's modules (ADR-1737, PERF-004).
//
// WHY. Under Frequency, app/page.tsx renders SiteShell + FrequencyHome and returns before its DAWN
// branch. A static import still puts every 'use client' module that branch reaches into `/`'s eager
// first-load JS: the whole block library through `config`, the Puck field pickers, the marketing
// header's mega menu and admin catalog. That was about 300 KB, and it held `/` at its 450 KB
// check:shell-weight cap. An import() inside the branch does not help: Turbopack still collects
// client references through async imports. So the branch reads ./active, and this build's ./active
// points here, where nothing reaches the block library.
//
// These are never called. If the DAWN branch ever runs in a Frequency build, the first one throws
// and names itself, instead of rendering a blank front door.
const absent = <T>(name: string): T =>
  (() => {
    throw new Error(`${name}: the DAWN front door is not in this build (lib/theme/design-home)`)
  }) as unknown as T

export const BlockRender = absent<typeof Dawn.BlockRender>('BlockRender')
export const BlockDocJsonLd = absent<typeof Dawn.BlockDocJsonLd>('BlockDocJsonLd')
export const config = {} as typeof Dawn.config
export const getPublishedData = absent<typeof Dawn.getPublishedData>('getPublishedData')
export const getTemplate = absent<typeof Dawn.getTemplate>('getTemplate')
export const isWellFormed = absent<typeof Dawn.isWellFormed>('isWellFormed')
export const MarketingHeader = absent<typeof Dawn.MarketingHeader>('MarketingHeader')
export const MarketingFooter = absent<typeof Dawn.MarketingFooter>('MarketingFooter')
export const getMenu = absent<typeof Dawn.getMenu>('getMenu')
export const getMenuSettings = absent<typeof Dawn.getMenuSettings>('getMenuSettings')
