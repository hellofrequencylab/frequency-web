// ── One rule for what a DM is called ──────────────────────────────────────────────────────
// A conversation's display name is either its stored `conversations.name` or, when that is
// null, a label derived from the other participants. That derivation existed in two places
// (the DM page and the dock's loader) and had already drifted: the page appended a `+N`
// overflow and the loader did not, so the same six-person thread read "Aisha, Ben, Cal" in one
// renderer and "Aisha, Ben, Cal +3" in the other.
//
// It now needs to exist in a THIRD place. The dock can rename a conversation, and clearing the
// name has to fall back to the derived label instantly rather than after a refetch — so a
// client component needs the same rule the server loader uses. Pure, no imports, safe on both
// sides of the boundary.

export type DmTitlePeer = { id: string; display_name: string }

/** The label for a conversation with no stored name, from the participants who are not me. */
export function deriveDmTitle(others: Array<{ display_name: string }>): string {
  if (others.length > 1) {
    return (
      others.slice(0, 3).map((p) => p.display_name.split(' ')[0]).join(', ') +
      (others.length > 3 ? ` +${others.length - 3}` : '')
    )
  }
  return others[0]?.display_name ?? 'Conversation'
}

/** The stored name if there is one, otherwise the derived label. */
export function dmTitle(name: string | null, participants: DmTitlePeer[], myProfileId: string): string {
  return name || deriveDmTitle(participants.filter((p) => p.id !== myProfileId))
}
