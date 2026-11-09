'use client'

import { SegmentedControl } from '@/components/ui/segmented-control'
import { BUILDER_SURFACES, surfaceSpec, type BuilderSurface } from '@/lib/builder/surfaces'
import styles from './surfaces.module.css'

// SHOW AS (BLD-301): Site, Profile, Spotlight, Email in the top bar. One control, the kit's segmented box, each segment
// carrying its action id so ⌘K lists the same four (lib/builder/commands.ts). The canvas, the Add sheet and the notes
// under the canvas all read the one `surface` in lib/builder/state.ts; this component only shows it and dispatches.

export function SurfaceSwitcher({ surface, onChange }: { surface: BuilderSurface; onChange: (surface: BuilderSurface) => void }) {
  return (
    <div className={styles.switcher} title={surfaceSpec(surface).says}>
      <SegmentedControl<BuilderSurface> label="Show as" value={surface} onChange={onChange} size="sm"
        segments={BUILDER_SURFACES.map((s) => ({ value: s.id, label: s.label, data: { 'data-action': `surface-${s.id}` } }))} />
    </div>
  )
}
