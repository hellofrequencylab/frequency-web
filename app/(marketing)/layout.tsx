import { SupportChatLauncher } from '@/components/chat/support-chat-launcher'
import { isSupportChatAvailable, supportChatFlagEnabled } from '@/lib/comms/chat-token'
import { SiteShell } from '@/components/frequency/site/shell/site-shell'

// Shared chrome for the public marketing content pages (/the-lab, /how-it-works,
// /about). Solid light header (these are content pages, not a dark hero). The
// root splash (app/page.tsx) renders its own header over the hero.
//
// PERF (Phase D): this layout must NOT read `cookies()`/`getUser()`. Those are Request-time
// APIs, and (without Cache Components) a single use here opts EVERY child marketing page out of
// static/ISR rendering — silently defeating the `revalidate = 3600` those pages already declare.
// The pages themselves read no request data, so dropping the server auth read here lets them
// prerender (○ static / ● ISR) again. The only auth-dependent chrome is the header's logo link +
// nav mode, which MarketingHeader now upgrades client-side (detectClientAuth) after hydration —
// the page body + SEO are identical for signed-in and signed-out viewers.
export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const chat = supportChatFlagEnabled() && isSupportChatAvailable() ? <SupportChatLauncher /> : null
  // Frequency wears its own public chrome: the kit root, the header v4 mega menu, the ft2 footer and the
  // FX island (components/frequency/site/shell). Its nav is typed data (lib/frequency/site-nav.ts).
  return <SiteShell after={chat}>{children}</SiteShell>
}
