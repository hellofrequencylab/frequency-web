'use client'

import { useState } from 'react'
import { HeaderImageField } from '@/components/ui/header-image-field'

// The Shop storefront BANNER control (client island). Wraps the shared HeaderImageField so the storefront
// settings form gets the same upload-through-Loom + drag-to-focus experience as every other header image,
// and mirrors the chosen URL + focal point into hidden inputs so the plain server-action <form> around it
// submits them. Controlled locally; the parent form owns the save. No em dashes (CONTENT-VOICE §10).

export function StorefrontBannerField({
  spaceId,
  initialUrl,
  initialFocus,
  disabled = false,
}: {
  spaceId: string
  initialUrl: string | null
  initialFocus: string
  disabled?: boolean
}) {
  const [url, setUrl] = useState<string | null>(initialUrl)
  const [focus, setFocus] = useState(initialFocus)

  return (
    <div>
      <HeaderImageField
        value={url}
        onChange={setUrl}
        focus={focus}
        onFocusChange={setFocus}
        scopeKey={spaceId}
        disabled={disabled}
        label="Shop banner"
        hint="A wide image across the top of your public Shop tab. Optional."
        focusHint="Drag to choose which part of the banner stays in frame."
      />
      {/* Mirror into hidden inputs so the surrounding server-action form submits the values. An empty
          string clears the banner (the action reads '' as null). */}
      <input type="hidden" name="bannerUrl" value={url ?? ''} />
      <input type="hidden" name="bannerFocus" value={focus} />
    </div>
  )
}
