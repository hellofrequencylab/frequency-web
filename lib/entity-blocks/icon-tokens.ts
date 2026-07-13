// ICON TOKENS — the searchable data behind the block icon picker (email overhaul, 2026). A feature / card
// item stores a short `icon` TOKEN the renderer reads: EITHER a curated Lucide icon name (kebab-case, e.g.
// "calendar-heart") OR a single emoji character (e.g. "✨"). This module is the ONE source of truth for the
// picker's two searchable sources and for the pure `isLucideIconName` check the email renderer uses to decide
// whether a token is a site-icon (which email cannot draw) or an emoji glyph (which it can print).
//
// PURE + framework-free (no React / lucide-react import), so it is safe to import from the email renderer
// (server) AND the client picker. The client-only NAME → component map lives in components/entity-blocks/
// block-icon.tsx and is kept in lockstep with LUCIDE_ICON_NAMES here (a drift only degrades an icon to its
// emoji-fallback text, never breaks). Voice canon (no em dashes) on any surfaced copy.

/** One curated Lucide site-icon offered in the picker: its kebab-case token `name` plus extra search
 *  `keywords` (space-separated) so a search matches synonyms, not just the literal name. */
export interface LucideIconEntry {
  name: string
  keywords: string
}

/** The curated Lucide set the picker searches and the renderer can draw. Kept intentionally small + relevant
 *  (community / events / offerings / money / nature / play) so the bundle stays lean and the search stays
 *  useful. Each `name` is a real lucide-react icon (kebab-case) mirrored by block-icon.tsx's component map. */
export const LUCIDE_ICONS: readonly LucideIconEntry[] = [
  { name: 'star', keywords: 'favorite rating best top' },
  { name: 'heart', keywords: 'love like favorite care' },
  { name: 'heart-handshake', keywords: 'care support community give' },
  { name: 'sparkles', keywords: 'magic shine new special' },
  { name: 'calendar', keywords: 'date event schedule when' },
  { name: 'calendar-heart', keywords: 'date event save the date' },
  { name: 'clock', keywords: 'time hour when schedule' },
  { name: 'map-pin', keywords: 'location place where address' },
  { name: 'map', keywords: 'location directions where' },
  { name: 'compass', keywords: 'explore direction find journey' },
  { name: 'globe', keywords: 'world online web global' },
  { name: 'users', keywords: 'people community group members' },
  { name: 'user', keywords: 'person profile member you' },
  { name: 'handshake', keywords: 'deal partner agree welcome' },
  { name: 'message-circle', keywords: 'chat talk comment conversation' },
  { name: 'mail', keywords: 'email letter message contact' },
  { name: 'phone', keywords: 'call contact number' },
  { name: 'send', keywords: 'submit share message' },
  { name: 'bell', keywords: 'notify alert reminder' },
  { name: 'gift', keywords: 'present reward free surprise' },
  { name: 'party-popper', keywords: 'celebrate party fun launch' },
  { name: 'cake', keywords: 'birthday celebrate party' },
  { name: 'coffee', keywords: 'drink cafe break casual' },
  { name: 'wine', keywords: 'drink social evening' },
  { name: 'utensils', keywords: 'food eat dinner meal' },
  { name: 'music', keywords: 'song audio sound play' },
  { name: 'headphones', keywords: 'audio listen podcast sound' },
  { name: 'mic', keywords: 'speak record voice podcast' },
  { name: 'camera', keywords: 'photo picture shoot' },
  { name: 'image', keywords: 'photo picture gallery' },
  { name: 'video', keywords: 'film movie watch clip' },
  { name: 'play', keywords: 'start watch begin' },
  { name: 'pause', keywords: 'stop hold break' },
  { name: 'book-open', keywords: 'read guide learn story' },
  { name: 'book', keywords: 'read learn library' },
  { name: 'bookmark', keywords: 'save later mark' },
  { name: 'pencil', keywords: 'write edit note' },
  { name: 'feather', keywords: 'write light gentle craft' },
  { name: 'quote', keywords: 'testimonial saying words' },
  { name: 'lightbulb', keywords: 'idea insight learn tip' },
  { name: 'check', keywords: 'done yes complete tick' },
  { name: 'circle-check', keywords: 'done complete verified yes' },
  { name: 'award', keywords: 'prize win badge quality' },
  { name: 'trophy', keywords: 'win prize best champion' },
  { name: 'target', keywords: 'goal aim focus' },
  { name: 'flag', keywords: 'goal milestone mark' },
  { name: 'rocket', keywords: 'launch fast start grow' },
  { name: 'zap', keywords: 'fast energy power spark' },
  { name: 'flame', keywords: 'hot streak fire energy' },
  { name: 'sun', keywords: 'day light morning warm' },
  { name: 'moon', keywords: 'night calm rest sleep' },
  { name: 'cloud', keywords: 'weather sky soft' },
  { name: 'leaf', keywords: 'nature grow calm plant' },
  { name: 'flower', keywords: 'nature bloom grow spring' },
  { name: 'tree-pine', keywords: 'nature outdoors forest' },
  { name: 'mountain', keywords: 'nature outdoors climb peak' },
  { name: 'waves', keywords: 'water calm ocean flow' },
  { name: 'house', keywords: 'home place base' },
  { name: 'building', keywords: 'office place business' },
  { name: 'store', keywords: 'shop buy business' },
  { name: 'shopping-bag', keywords: 'buy shop purchase' },
  { name: 'shopping-cart', keywords: 'buy checkout store' },
  { name: 'credit-card', keywords: 'pay money checkout' },
  { name: 'dollar-sign', keywords: 'money price cost pay' },
  { name: 'tag', keywords: 'price label deal' },
  { name: 'ticket', keywords: 'event entry rsvp pass' },
  { name: 'percent', keywords: 'discount deal off sale' },
  { name: 'trending-up', keywords: 'growth increase stats up' },
  { name: 'chart-bar', keywords: 'stats data graph metrics' },
  { name: 'chart-pie', keywords: 'stats data share metrics' },
  { name: 'activity', keywords: 'pulse active health stats' },
  { name: 'settings', keywords: 'options config gear' },
  { name: 'wrench', keywords: 'fix tool build repair' },
  { name: 'shield', keywords: 'safe secure protect trust' },
  { name: 'lock', keywords: 'secure private safe' },
  { name: 'key', keywords: 'access unlock secret' },
  { name: 'search', keywords: 'find look explore' },
  { name: 'filter', keywords: 'sort narrow refine' },
  { name: 'link', keywords: 'url connect chain' },
  { name: 'share-2', keywords: 'send spread social' },
  { name: 'download', keywords: 'save get file' },
  { name: 'upload', keywords: 'send file share' },
  { name: 'thumbs-up', keywords: 'like approve yes good' },
  { name: 'smile', keywords: 'happy friendly good' },
  { name: 'eye', keywords: 'see view watch preview' },
  { name: 'palette', keywords: 'art color creative design' },
  { name: 'brush', keywords: 'art paint creative design' },
  { name: 'puzzle', keywords: 'fit solve piece fun' },
  { name: 'crown', keywords: 'premium best top royal' },
  { name: 'gem', keywords: 'premium value quality jewel' },
  { name: 'diamond', keywords: 'premium value quality' },
  { name: 'wand-2', keywords: 'magic transform special' },
  { name: 'dumbbell', keywords: 'fitness gym strong workout' },
  { name: 'bike', keywords: 'ride cycle active' },
  { name: 'plane', keywords: 'travel trip fly' },
  { name: 'car', keywords: 'drive travel ride' },
  { name: 'sailboat', keywords: 'travel water calm journey' },
  { name: 'anchor', keywords: 'steady ground base water' },
  { name: 'infinity', keywords: 'forever unlimited endless' },
  { name: 'at-sign', keywords: 'email mention handle' },
  { name: 'hash', keywords: 'tag topic channel' },
]

/** The set of curated Lucide token names (kebab-case), for the O(1) `isLucideIconName` check. */
export const LUCIDE_ICON_NAMES: ReadonlySet<string> = new Set(LUCIDE_ICONS.map((i) => i.name))

/** Whether a stored `icon` token is one of our curated Lucide site-icons (vs an emoji character / legacy
 *  glyph). Pure; used by the renderers to pick a drawn icon over printed text. */
export function isLucideIconName(token: unknown): token is string {
  return typeof token === 'string' && LUCIDE_ICON_NAMES.has(token)
}

/** One emoji offered in the picker: the `char` stored as the token plus search `keywords`. */
export interface EmojiEntry {
  char: string
  keywords: string
}

/** A bundled, curated emoji set (kept small + relevant to community / events / offerings copy). The stored
 *  token is the emoji character itself, which every renderer prints as text. */
export const EMOJI_ICONS: readonly EmojiEntry[] = [
  { char: '✨', keywords: 'sparkles magic new shine special' },
  { char: '⭐', keywords: 'star favorite rating best' },
  { char: '🌟', keywords: 'star glowing special shine' },
  { char: '❤️', keywords: 'heart love like red' },
  { char: '🧡', keywords: 'heart orange love warm' },
  { char: '💛', keywords: 'heart yellow love' },
  { char: '💚', keywords: 'heart green love nature' },
  { char: '💙', keywords: 'heart blue love calm' },
  { char: '💜', keywords: 'heart purple love' },
  { char: '🔥', keywords: 'fire hot streak flame energy' },
  { char: '⚡', keywords: 'lightning fast energy power spark' },
  { char: '🎉', keywords: 'party celebrate confetti fun launch' },
  { char: '🎊', keywords: 'party celebrate confetti' },
  { char: '🎈', keywords: 'balloon party celebrate' },
  { char: '🎁', keywords: 'gift present reward surprise' },
  { char: '🎂', keywords: 'cake birthday celebrate' },
  { char: '🥳', keywords: 'party face celebrate fun' },
  { char: '😊', keywords: 'smile happy friendly' },
  { char: '👋', keywords: 'wave hi hello welcome' },
  { char: '🙌', keywords: 'hands celebrate praise yay' },
  { char: '👏', keywords: 'clap applause well done' },
  { char: '👍', keywords: 'thumbs up like approve yes' },
  { char: '🤝', keywords: 'handshake deal partner welcome' },
  { char: '💪', keywords: 'strong muscle fitness power' },
  { char: '🙏', keywords: 'thanks please grateful pray' },
  { char: '💡', keywords: 'idea insight light tip' },
  { char: '📌', keywords: 'pin location save important' },
  { char: '📍', keywords: 'location place where map' },
  { char: '🗓️', keywords: 'calendar date event schedule' },
  { char: '📅', keywords: 'calendar date event when' },
  { char: '⏰', keywords: 'clock time alarm when' },
  { char: '🕖', keywords: 'clock time hour when' },
  { char: '📣', keywords: 'announce megaphone shout news' },
  { char: '📢', keywords: 'announce loud news share' },
  { char: '✉️', keywords: 'email mail letter message' },
  { char: '📩', keywords: 'email inbox message' },
  { char: '💬', keywords: 'chat talk comment message' },
  { char: '📝', keywords: 'note write edit form' },
  { char: '📖', keywords: 'book read learn story' },
  { char: '🎟️', keywords: 'ticket event entry rsvp' },
  { char: '🎯', keywords: 'target goal aim focus' },
  { char: '🏆', keywords: 'trophy win prize champion' },
  { char: '🥇', keywords: 'medal first win gold' },
  { char: '🚀', keywords: 'rocket launch fast grow start' },
  { char: '🌱', keywords: 'seedling grow plant start new' },
  { char: '🌸', keywords: 'flower bloom nature spring' },
  { char: '🌿', keywords: 'leaf herb nature calm' },
  { char: '🍃', keywords: 'leaf nature calm wind' },
  { char: '🌊', keywords: 'wave water ocean flow' },
  { char: '🌞', keywords: 'sun day warm bright' },
  { char: '🌙', keywords: 'moon night calm rest' },
  { char: '⛰️', keywords: 'mountain nature outdoors peak' },
  { char: '🏕️', keywords: 'camp outdoors nature tent' },
  { char: '🧘', keywords: 'meditate calm yoga practice' },
  { char: '☕', keywords: 'coffee drink cafe break' },
  { char: '🍷', keywords: 'wine drink social evening' },
  { char: '🍽️', keywords: 'food eat dinner meal' },
  { char: '🎵', keywords: 'music note song audio' },
  { char: '🎧', keywords: 'headphones audio listen podcast' },
  { char: '🎤', keywords: 'mic speak sing podcast' },
  { char: '📷', keywords: 'camera photo picture' },
  { char: '🎨', keywords: 'art palette creative design' },
  { char: '🎬', keywords: 'film movie video clip' },
  { char: '💰', keywords: 'money bag price cost' },
  { char: '💵', keywords: 'money cash dollar price' },
  { char: '🏷️', keywords: 'tag price label deal' },
  { char: '🛍️', keywords: 'shopping bags buy store' },
  { char: '📈', keywords: 'chart growth up stats' },
  { char: '📊', keywords: 'chart bar data stats' },
  { char: '🔑', keywords: 'key access unlock secret' },
  { char: '🔒', keywords: 'lock secure private safe' },
  { char: '🛡️', keywords: 'shield safe secure trust' },
  { char: '🔗', keywords: 'link url connect chain' },
  { char: '👀', keywords: 'eyes look see watch' },
  { char: '💎', keywords: 'gem diamond premium value' },
  { char: '👑', keywords: 'crown premium best royal' },
  { char: '🧩', keywords: 'puzzle fit piece solve' },
  { char: '🌈', keywords: 'rainbow color hope bright' },
]

/** Case-insensitive substring match of a query against a token name/char + its keywords. */
function matches(query: string, haystack: string): boolean {
  return haystack.toLowerCase().includes(query)
}

/** Search the curated Lucide icons by query (name + keywords). An empty query returns the whole set. */
export function searchLucide(query: string): readonly LucideIconEntry[] {
  const q = query.trim().toLowerCase()
  if (!q) return LUCIDE_ICONS
  return LUCIDE_ICONS.filter((i) => matches(q, `${i.name} ${i.keywords}`))
}

/** Search the bundled emoji by query (keywords). An empty query returns the whole set. */
export function searchEmoji(query: string): readonly EmojiEntry[] {
  const q = query.trim().toLowerCase()
  if (!q) return EMOJI_ICONS
  return EMOJI_ICONS.filter((e) => matches(q, e.keywords))
}
