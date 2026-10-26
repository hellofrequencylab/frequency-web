import { SupportChatLauncher } from '@/components/chat/support-chat-launcher'
import { isSupportChatAvailable, supportChatFlagEnabled } from '@/lib/comms/chat-token'
import { SiteShell } from '@/components/frequency/site/shell/site-shell'

// Shared chrome for every public /discover page: the SiteHeader (light variant,
// since these are content pages rather than the hero splash) and a footer. The
// authed app is robots-disallowed, so these are the only indexable community
// URLs. SiteHeader is auth-aware — bots/logged-out visitors get the marketing
// nav (the indexable view is unchanged), while a signed-in member keeps the
// same explore menu + account chrome they had in the app, so the menu doesn't
// switch when they cross over from /feed.
//
// authMode="client" is what keeps that promise WITHOUT costing the static render. Reading auth
// during render is a dynamic API, and one anywhere in a layout opts the whole route out of static
// rendering, so the server-auth header was force-dynamicking all 22 pages under here and silently
// voiding their `export const revalidate = 3600` — every visitor and every crawler paid two auth
// round trips plus the page's own full query set, on every hit. Now the anonymous shell (which IS
// the indexable view) renders statically and a member's chrome swaps in after hydration.
export default function DiscoverLayout({ children }: { children: React.ReactNode }) {
  const chat = supportChatFlagEnabled() && isSupportChatAvailable() ? <SupportChatLauncher /> : null
  return (
    <SiteShell surface="commons" after={chat}>
      {children}
    </SiteShell>
  )
}
