// MEMBER CARDS, the pure half (LIVE-1282, ADR-1874, docs/LOYALTY.md "Member cards"). A member card
// always holds the same /c/<token> link; its FACE decides what a phone tap opens, and the owner (a
// member, or a Space for a card registered to it) sets the face on the website. Types, limits, the
// input normalizer and the tap decision live here with no Supabase and no Next, so the Crew editor,
// the Space editor, the tap route and the tests all read the same rules. The IO is ./store.ts.
//
// Owner rulings 2026-10-22: getting a card is a Crew perk; a card with no face set opens its owner's
// own page (a member's profile, or the Space's page); any Space may offer a cardholder perk.

export type CardMode = 'page' | 'card' | 'link'

export const CARD_MODES: readonly { key: CardMode; label: string; hint: string }[] = [
  { key: 'page', label: 'Open my page', hint: 'Your Frequency page. This is where a new card goes.' },
  { key: 'card', label: 'Show my card', hint: 'Photo, title, links and Save contact.' },
  { key: 'link', label: 'Open my link', hint: 'Your site, your event, your offer.' },
]

export const CARD_LIMITS = { linkMax: 500, perkMax: 120, foundersEdition: 100 } as const

/** What the owner set. A missing row reads as DEFAULT_FACE. */
export interface CardFace {
  mode: CardMode
  linkUrl: string | null
  showPhone: boolean
  showEmail: boolean
  showLinks: boolean
  swapBack: boolean
  paused: boolean
  /** A Space's one-line perk for cardholders. Always null on a member's face. */
  cardholderPerk: string | null
}

export const DEFAULT_FACE: CardFace = {
  mode: 'page',
  linkUrl: null,
  showPhone: false,
  showEmail: false,
  showLinks: true,
  swapBack: true,
  paused: false,
  cardholderPerk: null,
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback
}

/** Normalize a link the owner typed: https only, a bare domain gets https://, anything else is null. */
export function normalizeCardLink(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  let v = raw.trim()
  if (!v) return null
  if (!/^[a-z][a-z0-9+.-]*:/i.test(v)) v = `https://${v}`
  if (v.length > CARD_LIMITS.linkMax) return null
  try {
    const u = new URL(v)
    if (u.protocol !== 'https:' || !u.hostname.includes('.')) return null
    return u.toString()
  } catch {
    return null
  }
}

/** Read a stored row (snake_case) back to a face. Unknown values fall back to the default. Pure. */
export function readFace(row: Record<string, unknown> | null | undefined): CardFace {
  if (!row) return { ...DEFAULT_FACE }
  const mode = row.mode === 'card' || row.mode === 'link' ? row.mode : 'page'
  const linkUrl = normalizeCardLink(row.link_url)
  const perk = typeof row.cardholder_perk === 'string' && row.cardholder_perk.trim() ? row.cardholder_perk.trim() : null
  return {
    mode: mode === 'link' && !linkUrl ? 'page' : mode,
    linkUrl,
    showPhone: bool(row.show_phone, DEFAULT_FACE.showPhone),
    showEmail: bool(row.show_email, DEFAULT_FACE.showEmail),
    showLinks: bool(row.show_links, DEFAULT_FACE.showLinks),
    swapBack: bool(row.swap_back, DEFAULT_FACE.swapBack),
    paused: bool(row.paused, DEFAULT_FACE.paused),
    cardholderPerk: perk,
  }
}

type FaceInputResult = { face: CardFace } | { error: string }

/**
 * Validate what an editor sent. `forSpace` keeps the cardholder perk (a member's face never carries
 * one). Errors are the line the editor prints. Pure.
 */
export function normalizeFaceInput(raw: unknown, forSpace: boolean): FaceInputResult {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const mode: CardMode = r.mode === 'card' || r.mode === 'link' ? r.mode : 'page'
  const typed = typeof r.linkUrl === 'string' ? r.linkUrl.trim() : ''
  const linkUrl = normalizeCardLink(typed)
  if (typed && !linkUrl) return { error: 'That link does not work. Use a full https:// address.' }
  if (mode === 'link' && !linkUrl) return { error: 'Add the link your card should open.' }
  let perk: string | null = null
  if (forSpace && typeof r.cardholderPerk === 'string' && r.cardholderPerk.trim()) {
    perk = r.cardholderPerk.trim()
    if (perk.length > CARD_LIMITS.perkMax) return { error: `Keep the perk under ${CARD_LIMITS.perkMax} characters.` }
  }
  return {
    face: {
      mode,
      linkUrl,
      showPhone: bool(r.showPhone, DEFAULT_FACE.showPhone),
      showEmail: bool(r.showEmail, DEFAULT_FACE.showEmail),
      showLinks: bool(r.showLinks, DEFAULT_FACE.showLinks),
      swapBack: bool(r.swapBack, DEFAULT_FACE.swapBack),
      paused: bool(r.paused, DEFAULT_FACE.paused),
      cardholderPerk: perk,
    },
  }
}

/** The face as the row the store writes. Pure. */
export function faceRow(face: CardFace): Record<string, unknown> {
  return {
    mode: face.mode,
    link_url: face.linkUrl,
    show_phone: face.showPhone,
    show_email: face.showEmail,
    show_links: face.showLinks,
    swap_back: face.swapBack,
    paused: face.paused,
    cardholder_perk: face.cardholderPerk,
  }
}

/** Who the face belongs to. */
export type CardOwner = { kind: 'member'; profileId: string; handle: string } | { kind: 'space'; spaceId: string; slug: string }

/** Where a phone tap goes. `face` renders the virtual card at /card/<token>. */
type TapTarget =
  | { to: 'paused' }
  | { to: 'owner_settings' }
  | { to: 'page'; path: string }
  | { to: 'link'; url: string }
  | { to: 'face' }

/**
 * The tap decision. A paused card shows nothing. The owner tapping their own member card while it is
 * still on its default (page mode) lands on their card settings, the fastest way to set a new card; once
 * they choose a link or the virtual card, their own tap goes there like anyone's, so they can test it
 * (owner ruling 2026-10-22). Otherwise the face's mode decides, except that a signed-out tap on a
 * member card in page mode shows the public card face. Pure.
 */
export function tapTarget(owner: CardOwner, face: CardFace, tapperProfileId: string | null): TapTarget {
  if (face.paused) return { to: 'paused' }
  if (owner.kind === 'member' && face.mode === 'page' && tapperProfileId && tapperProfileId === owner.profileId) return { to: 'owner_settings' }
  if (face.mode === 'link' && face.linkUrl) return { to: 'link', url: face.linkUrl }
  if (face.mode === 'card') return { to: 'face' }
  // A member's profile needs sign-in (proxy.ts), so a signed-out stranger would hit a wall. Their view of
  // "my page" is the public card face instead, which offers Swap contacts and the page behind sign-in.
  if (owner.kind === 'member' && !tapperProfileId) return { to: 'face' }
  return { to: 'page', path: ownerPagePath(owner) }
}

/** The owner's own public page. */
function ownerPagePath(owner: CardOwner): string {
  return owner.kind === 'member' ? `/people/${encodeURIComponent(owner.handle)}` : `/spaces/${encodeURIComponent(owner.slug)}`
}

/** The edition printed on a card. Founders is the first 100 numbers; every later card is a Crew card. */
export function cardEdition(cardNumber: number | null): 'founders' | 'crew' {
  return cardNumber !== null && cardNumber >= 1 && cardNumber <= CARD_LIMITS.foundersEdition ? 'founders' : 'crew'
}

/** "No. 0042" as printed. Null when the card was minted before numbering. */
export function formatCardNumber(cardNumber: number | null): string | null {
  if (cardNumber === null || !Number.isInteger(cardNumber) || cardNumber < 1) return null
  return `No. ${String(cardNumber).padStart(4, '0')}`
}
