'use client'

import { ChoiceTile } from './choice-tile'
import { WIZARD_THEMES } from '@/lib/spaces/create-wizard'
import type { MegaThemeId } from '@/lib/theme/mega-theme'

/** The look choice as an embeddable step body (no route, no chrome): every theme, "Pick later", and a tag on the
 *  kit the visitor arrived with. Used by the Create a Space wizard and the launch flow alike. */
export function LookStep({
  value,
  arrivedTheme = null,
  onChange,
}: {
  value: MegaThemeId | null
  arrivedTheme?: MegaThemeId | null
  onChange: (theme: MegaThemeId | null) => void
}) {
  return (
    <div className="grid gap-3 @xl:grid-cols-2" role="group" aria-label="Your look">
      {WIZARD_THEMES.map((t) => (
        <ChoiceTile
          key={t.id}
          on={value === t.id}
          title={t.label}
          hint={t.hint}
          tag={arrivedTheme === t.id ? 'Your kit' : undefined}
          onSelect={() => onChange(t.id)}
        />
      ))}
      <ChoiceTile on={value === null} title="Pick later" hint="We start you on the default look. You can switch any time." onSelect={() => onChange(null)} />
    </div>
  )
}
