/** Scope-managed rooms retain their domain visibility even when a room admin renames them. */
export function canEditRoomVisibility(room: { visibility: string; scope_id: string | null }): boolean {
  return room.scope_id === null && (room.visibility === 'public' || room.visibility === 'private')
}
