// The Network Theme Kit's default accent family, kept apart from lib/theme/network-kit.ts so the shared site-style
// module reads four literals and does not pull the whole token module (and its contract JSON) into every route.
// network-kit.test.ts holds these equal to the Marigold scheme.
export const NETWORK_KIT_ACCENT = { accent: '#E9B949', text: '#8A6410', on: '#1F3440', bg: '#FAF3DE' } as const
