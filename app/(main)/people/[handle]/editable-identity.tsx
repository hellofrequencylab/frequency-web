// The profile bio block. The name · @handle · badges live in the page's Detail
// header band (ADR-173), so this renders bio-only: the member's bio for everyone,
// with a gentle prompt for the owner when it's empty. Editing name + bio now lives
// in the dedicated Edit Profile flow (/settings/profile) — there is no inline edit
// entry point here anymore.
export function EditableIdentity({
  isOwner,
  bio,
}: {
  isOwner: boolean
  bio: string
}) {
  if (bio) {
    return <p className="whitespace-pre-wrap text-sm leading-relaxed text-text">{bio}</p>
  }
  if (isOwner) {
    return <p className="text-sm italic text-subtle">Add a short bio so people know who you are.</p>
  }
  return null
}
