'use server'

import { requireAdmin } from '@/lib/admin/guard'
import { findLibraryAssetUsage, type AssetUsageResult } from '@/lib/library/usage'

// The Loom detail drawer's "used on N pages" read (PROG-D4, ADR-1502). Studio-gated with the
// PAGE's own gate, `requireAdmin('janitor', { staff: 'marketing' })`, like every action beside
// page.tsx (LIVE-289): a Marketer who can open the drawer can see where the asset is used. The
// Airwaves usage route beside this is still bare-janitor on purpose (see asset-av-panel.tsx);
// this one reads the Loom's own documents, not the service-role Airwaves tables, so it takes the
// page's gate rather than a narrower one.
//
// Returns the discriminated result unchanged: `ok: false` reaches the panel as "could not check",
// never as zero (the ADR-979 lesson, restated in lib/library/usage.ts).

export async function getLibraryAssetUsage(assetId: string): Promise<AssetUsageResult> {
  await requireAdmin('janitor', { staff: 'marketing' })
  return findLibraryAssetUsage(assetId)
}
