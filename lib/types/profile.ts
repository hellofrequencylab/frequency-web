// The identity triple every "person" surface needs — directory, messages, the
// app shell, any people list. Compose site-specific row shapes from this base
// instead of re-declaring the same three fields:
//
//   type Profile = ProfileIdentity & { id: string; community_role: CommunityRole }
//
// (Circle/event row shapes are intentionally NOT shared — those are per-query
// projections that select different columns and nested joins.)
export type ProfileIdentity = {
  display_name: string
  handle: string
  avatar_url: string | null
}
