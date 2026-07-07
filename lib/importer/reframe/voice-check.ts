// ─────────────────────────────────────────────────────────────────────────────
// SMART BUSINESS IMPORTER — the REFRAME voice guard (P2, docs/BUSINESS-IMPORTER.md §4.6,
// docs/CONTENT-VOICE.md §10). PURE + framework-independent (no React / Next / Supabase / AI),
// so the whole "does this generated line pass the Frequency voice checklist?" question is
// exhaustively unit-testable with ZERO IO.
//
// TWO jobs, both deterministic:
//   • sanitizeGenerated(text) — a mechanical fix pass: strip em dashes (CONTENT-VOICE §10 hard
//     rule: never an em dash), collapse whitespace. This ALWAYS runs, so no em dash can survive
//     even if the model slips one in.
//   • checkVoice(text) — the §10 skeptic-test heuristics: flag em dashes, banned vibe-verbs /
//     surface jargon / hype words (CONTENT-VOICE §5), health claims, and shouting. Returns a
//     structured verdict the reframe run uses to REGENERATE once, then flag amber (§4.6) rather
//     than ship copy that fails the checklist.
//
// This is a HEURISTIC net, not the whole doc: it catches the mechanical, list-checkable failures
// (banned tokens, em dashes, health words). The judgment failures (skeptic test, narrating
// feelings) still lean on the voice primer in the prompt. No em dashes in THIS file's own strings.
// ─────────────────────────────────────────────────────────────────────────────

/** The em dash (U+2014) and its cousin the horizontal bar (U+2015), both banned in brand copy. */
const EM_DASHES = /[—―]/g

/**
 * Mechanically clean a generated string: remove em dashes (replace a spaced em dash with a comma,
 * an unspaced one with nothing so a word-joining dash does not fuse two words), and collapse runs
 * of whitespace. PURE + total. This runs on EVERY generated string before it is stored, so the
 * "no em dashes" rule holds regardless of what the model emitted.
 */
export function sanitizeGenerated(text: string): string {
  return text
    // " word — word " -> " word, word " (a clause break becomes a comma)
    .replace(/\s*[—―]\s*/g, (m) => (/\s/.test(m) ? ', ' : ' '))
    // any stragglers
    .replace(EM_DASHES, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+\n/g, '\n') // trailing space before a newline
    .replace(/\n[ \t]+/g, '\n') // leading space after a newline
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// ── The §5 banned lexicon (CONTENT-VOICE.md §5, surfaced here as a machine check) ──────
// Kept lowercase; matching is case-insensitive and word-boundary aware so "unlocked door" is fine
// but "unlock your potential" is caught. This is the list the voice primer already forbids; the
// checker is the SECOND line so a slip is caught deterministically, not left to the model.

/** Vibe-verbs (§5): mystical motion the voice never uses. */
const VIBE_VERBS: readonly string[] = [
  'feel the current',
  'tap into',
  'drop into',
  'sink into',
  'tune into yourself',
  'lean into',
  'hold space',
  'ride the wave',
  'let it flow',
  'align with',
  'awaken your',
]

/** Surface wellness jargon (§5): banned on cards / headlines / prose. */
const SURFACE_JARGON: readonly string[] = [
  'somatic',
  'vibrational',
  'energetic',
  'embodied',
  'sacred',
  'ancient wisdom',
  'chakra',
  'nervous system regulation',
]

/** Hype words (§5): sales inflation the voice bans. */
const HYPE_WORDS: readonly string[] = [
  'unlock',
  'elevate',
  'transform your life',
  'level up',
  'supercharge',
  'tribe',
  'revolution',
  'game-changer',
  'game changer',
  'best-in-class',
  'world-class',
  'cutting-edge',
  'one-stop shop',
]

/** Health-claim words (§10 item 10): copy must stay relational, never medical. */
const HEALTH_CLAIMS: readonly string[] = [
  'cure',
  'cures',
  'heal your',
  'clinically proven',
  'medically proven',
  'treats anxiety',
  'treats depression',
  'boosts immunity',
  'detox',
]

/** One flagged voice problem in a generated string. */
export interface VoiceIssue {
  /** The category of the miss (for the reason string + the review board). */
  kind: 'em-dash' | 'vibe-verb' | 'surface-jargon' | 'hype' | 'health-claim' | 'shouting'
  /** The offending token / phrase (lowercased), or a short description. */
  match: string
}

/** The verdict of the voice check on one string. `ok` is true when nothing tripped. */
export interface VoiceVerdict {
  ok: boolean
  issues: VoiceIssue[]
}

/** Whether `needle` appears in `haystack` as a whole phrase (word-boundary aware, case-insensitive).
 *  A phrase with spaces matches on the spaces; a single word matches on \b boundaries. PURE. */
function containsPhrase(haystack: string, needle: string): boolean {
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i')
  return re.test(haystack)
}

/**
 * Run the CONTENT-VOICE §10 machine checklist over a generated string. Flags every banned token
 * (§5 vibe-verbs / surface jargon / hype), any em dash, any health claim, and shouting (an ALL-CAPS
 * word of 3+ letters, or more than one exclamation point). Returns a structured verdict. PURE + total.
 *
 * This does NOT judge the skeptic test or feeling-narration (those need the model); it is the
 * deterministic floor. The reframe run treats a non-ok verdict as "regenerate once, then flag amber".
 */
export function checkVoice(text: string): VoiceVerdict {
  const issues: VoiceIssue[] = []
  const t = text ?? ''

  if (EM_DASHES.test(t)) issues.push({ kind: 'em-dash', match: 'em dash' })
  EM_DASHES.lastIndex = 0

  for (const w of VIBE_VERBS) if (containsPhrase(t, w)) issues.push({ kind: 'vibe-verb', match: w })
  for (const w of SURFACE_JARGON) if (containsPhrase(t, w)) issues.push({ kind: 'surface-jargon', match: w })
  for (const w of HYPE_WORDS) if (containsPhrase(t, w)) issues.push({ kind: 'hype', match: w })
  for (const w of HEALTH_CLAIMS) if (containsPhrase(t, w)) issues.push({ kind: 'health-claim', match: w })

  // Shouting: more than one exclamation point (§10 item 8: max one), or an all-caps shout word.
  const bangs = (t.match(/!/g) ?? []).length
  if (bangs > 1) issues.push({ kind: 'shouting', match: 'multiple exclamation points' })
  const shoutWord = t.match(/(^|[^A-Z])([A-Z]{3,})([^A-Z]|$)/)
  // Allow known all-caps brand tokens / acronyms; only flag a plainly shouted word.
  if (shoutWord && !isAllowedCaps(shoutWord[2])) {
    issues.push({ kind: 'shouting', match: shoutWord[2] })
  }

  return { ok: issues.length === 0, issues }
}

/** Acronyms / tokens allowed in all-caps (not shouting). Keep small; add only genuine acronyms. */
const ALLOWED_CAPS = new Set(['FAQ', 'CEO', 'DIY', 'USA', 'LGBTQ', 'RSVP', 'ADA', 'NYC', 'LA', 'AI'])
function isAllowedCaps(word: string): boolean {
  return ALLOWED_CAPS.has(word)
}

/** A short, human reason string for a verdict (for the review board / the job log). PURE. */
export function voiceReason(verdict: VoiceVerdict): string {
  if (verdict.ok) return 'Passed the voice checklist.'
  const kinds = Array.from(new Set(verdict.issues.map((i) => i.kind)))
  return `Voice checklist flagged: ${kinds.join(', ')}.`
}
