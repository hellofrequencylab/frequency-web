import { redirect } from 'next/navigation'

// LEGACY SPACE SETTINGS HUB — now a bare redirect (ADR-552 Phase 4). The old 7-card hub is gone: the
// unified `/spaces/<slug>/manage` console is the ONE owner surface, so this route just forwards there.
// Every real editor (basics, billing, members, offerings, enroll, qr, email, the CRM board, and the
// Menu-and-features Module Manager) lives on its own sub-page under /manage or /settings and stays
// reachable; the console links to each. The console runs its OWN access gate + type check, so a
// non-manager still 404s there and the route never leaks.

export default async function SpaceSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  redirect(`/spaces/${slug}/manage`)
}
