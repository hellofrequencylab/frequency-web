// The profile activity area's two views: "Activity" (the merged stream) and
// "Posts" (just this member's authored history). The tabs themselves render via
// the shared UnderlineTabs (the one tab vocabulary) on the profile page; this
// module owns only the ?tab= value type so the page stays server-rendered.
export type ProfileTab = 'activity' | 'posts'
