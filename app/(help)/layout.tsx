import { SupportChatLauncher } from '@/components/chat/support-chat-launcher'
import { isSupportChatAvailable, supportChatFlagEnabled } from '@/lib/comms/chat-token'
import { SiteShell } from '@/components/frequency/site/shell/site-shell'

// Help-center chrome: shared marketing header/footer + a sticky sidebar (search +
// topic nav). Public (not in proxy.ts PROTECTED_PATHS), statically generated.
export default async function HelpLayout({ children }: { children: React.ReactNode }) {
  const chat = supportChatFlagEnabled() && isSupportChatAvailable() ? <SupportChatLauncher /> : null
  return <SiteShell after={chat}>{children}</SiteShell>
}
