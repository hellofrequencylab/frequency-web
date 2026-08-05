import { Avatar } from '@/components/ui/avatar'

// The identity avatar shown in a profile's Detail title row (the brand mark for an
// entity space, the member's photo for a person). Inline beside the name, sized to
// sit on the title band below the cover — the house pattern shared with VeraProfile.
//
// This is now a NAMED SIZE of the one kit Avatar (components/ui/avatar.tsx), not a second
// implementation of it. The wrapper survives so the ~1 call site keeps its own vocabulary
// (`initials`, `dimmed`) and so "the profile title-band avatar" stays a thing with a name,
// rather than an `xl ring` spelled out at every site that grows one.
// Presentational + server-friendly (no hooks).
export function ProfileAvatar({
  src,
  name,
  initials,
  dimmed = false,
  focus,
}: {
  /** The photo/logo URL; falls back to initials on a tinted disc when null. */
  src: string | null
  /** Alt text for the image. */
  name: string
  /** Two-letter fallback shown when there's no image. */
  initials: string
  /** Demo profiles desaturate their photo so they read as not-quite-real. */
  dimmed?: boolean
  /** The chosen focal point ("x% y%") so the photo keeps its subject in the round crop.
   *  Falls back to the URL's own #fp fragment (ADR-829), then to a centered default. */
  focus?: string | null
}) {
  return (
    <Avatar src={src} name={name} initials={initials} size="xl" ring dimmed={dimmed} focus={focus} />
  )
}
