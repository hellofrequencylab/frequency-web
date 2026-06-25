import { getPlatformSetting, setPlatformSetting } from '@/lib/platform-flags'
import { coerceLayout, sanitizeLayout, type RailLayout } from '@/lib/circles/rail-layout'

// Server-side store for the OPERATOR GLOBAL default circle-rail layout. Kept apart from
// the pure rail-layout.ts because it reaches platform_settings (admin client). The host
// override is stored per-circle on circles.sidebar_order (see circles/admin-actions.ts);
// this is only the network-wide default that applies when a circle has no override.

const PLATFORM_KEY = 'circle_rail_layout'

/** The operator global default layout, or null if none is set (→ coded default applies).
 *  Fail-safe: getPlatformSetting already swallows DB hiccups and returns the fallback. */
export async function getOperatorRailLayout(): Promise<RailLayout | null> {
  const raw = await getPlatformSetting(PLATFORM_KEY, '')
  if (!raw) return null
  try {
    return coerceLayout(JSON.parse(raw))
  } catch {
    return null
  }
}

/** Persist the operator global default. Callers MUST janitor-gate before calling this. */
export async function setOperatorRailLayout(
  layout: { order?: unknown; hidden?: unknown },
  changedBy?: string | null,
): Promise<void> {
  await setPlatformSetting(PLATFORM_KEY, JSON.stringify(sanitizeLayout(layout)), changedBy)
}
