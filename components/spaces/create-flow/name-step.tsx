'use client'

import { Field, TextField } from '@/components/spaces/space-form'
import { isSafeSlug } from '@/lib/theme/validate'
import { slugify as slugifyShared } from '@/lib/utils'
import { ChoiceTile } from './choice-tile'

export type SpaceVisibility = 'network' | 'private'

/** The handle a name suggests: lowercase, hyphenated, at most 40 characters, no trailing hyphen. */
export function handleFromName(name: string): string {
  return slugifyShared(name).slice(0, 40).replace(/-+$/g, '')
}

/** The name, handle and who-can-find-it choices as an embeddable step body (no route, no chrome). The parent owns
 *  the values; the handle follows the name until it is edited by hand (`handleTouched`). */
export function NameStep({
  name,
  handle,
  visibility,
  onName,
  onHandle,
  onVisibility,
}: {
  name: string
  handle: string
  visibility: SpaceVisibility
  onName: (value: string) => void
  onHandle: (value: string) => void
  onVisibility: (value: SpaceVisibility) => void
}) {
  const handleValid = handle === '' || isSafeSlug(handle)
  return (
    <div className="space-y-5">
      <TextField
        id="name"
        label="Name"
        hint="The name people will see across the network."
        value={name}
        onChange={onName}
        placeholder="River Yoga"
        maxLength={200}
        required
      />
      <div>
        <TextField
          id="slug"
          label="Handle"
          hint="Your space lives at /spaces/your-handle. Lowercase letters, numbers, and hyphens."
          value={handle}
          onChange={(v) => onHandle(v.toLowerCase())}
          placeholder="river-yoga"
          maxLength={40}
        />
        {!handleValid && <p className="mt-1 text-meta font-medium text-danger">Use lowercase letters, numbers, and hyphens only.</p>}
      </div>
      <Field id="visibility" label="Who can find it">
        <div className="grid gap-3 @xl:grid-cols-2" role="group" aria-label="Who can find it">
          <ChoiceTile
            on={visibility === 'network'}
            icon="globe"
            title="Listed in the directory"
            hint="Anyone can find it in the Spaces directory."
            onSelect={() => onVisibility('network')}
          />
          <ChoiceTile
            on={visibility === 'private'}
            icon="shield"
            title="Private"
            hint="Hidden from the directory. Only you and your members can open it."
            onSelect={() => onVisibility('private')}
          />
        </div>
      </Field>
    </div>
  )
}
