// The `qr-studio` element's config resolver (docs/EMBEDDABLE-ELEMENTS.md §3). Reads the QR design
// editor's per-feature toggles + preset choice from the shared element_settings layer (platform master +
// optional per-space override) and answers, FOR THIS VIEWER, which design controls are available. Unlike
// the header (display-only settings any reader sees), QR Studio's features are ROLE-GATED: each toggle is
// unlocked only for a viewer whose role meets the feature's min-role, so the resolver folds the stored
// layers AND the viewer's role context. FAIL-SAFE: any error / missing def resolves to the full config.
//
// CONSUMED (LIVE-066): StyleEditor takes the resolved config as its `config` prop and hides the controls
// it turns off. The server mounts resolve here and thread it down — /admin/qr (the Studio dashboard's
// five design surfaces), /codes (the member codes hub), and the page share popup via the
// getQrStudioConfig server action (app/(main)/admin/qr/link-actions.ts). The pure fold + the config
// shape live in ./qr-studio-config (client-safe); this module adds only the element-store IO.

import { readElementLayers } from './store'
import { elementDef } from './registry'
import { type ViewerRoleCtx } from './config'
import { pickQrStudioConfig, DEFAULT_QR_STUDIO_CONFIG, type QrStudioConfig } from './qr-studio-config'

export { pickQrStudioConfig, DEFAULT_QR_STUDIO_CONFIG, type QrStudioConfig }

/** Resolve the QR Studio element config for a viewer (optionally scoped to a Space). FAIL-SAFE. */
export async function resolveQrStudio(
  opts: { spaceId?: string | null; viewer: ViewerRoleCtx },
): Promise<QrStudioConfig> {
  try {
    const layers = await readElementLayers('qr-studio', opts.spaceId ?? null)
    return pickQrStudioConfig(elementDef('qr-studio'), layers, opts.viewer)
  } catch {
    return DEFAULT_QR_STUDIO_CONFIG
  }
}
