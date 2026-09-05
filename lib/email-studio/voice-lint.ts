// EMAIL STUDIO — the voice lint (pure).
//
// The machine-checkable floor under every piece of email copy we author or send:
// docs/CONTENT-VOICE.md §10.8 in code. It checks the three rules a regex can
// honestly check and makes no claim about the rest. A human still reads for voice.
//
//   • EM / EN DASH — the HARD rule (`hasEmDash`). The voice canon bans them in brand
//     copy outright, so this is the one a caller may refuse on.
//   • BANNED PHRASES — the vibe-verb / hype list from the AI voice primer
//     (lib/ai/voice.ts). Warnings: a human decides.
//   • EXCLAMATION POINTS — more than one in a piece of copy. Warning.
//
// It moved here from the Beta Command Center's email layer, which is gone. It was
// never beta-specific. LIVE CALLERS (LIVE-066): the campaign send path (lib/email-studio/send.ts)
// runs it on every real send and schedule — the em dash refuses the send (the hard rule), the rest
// surface as warnings through the send panel's voice preflight — and the preset suite
// (presets.test.ts) holds every shipped email preset to the hard rule, so no operator can start
// 2026-09-05 (scan2 L4-04): lib/email-studio/presets.ts and presets.test.ts were removed (no consumer
// outside their own test). The hard rule now applies through campaignAuthoredCopy on every real send.
// from a template we would refuse. Pure and unit-tested, no imports, safe anywhere.

export interface VoiceViolation {
  /** A short machine key for the rule. */
  rule: string
  /** A one-line, operator-facing explanation. */
  detail: string
}

export interface VoiceLintResult {
  violations: VoiceViolation[]
  /** The ONE hard rule. When true, the copy is not shippable as written. */
  hasEmDash: boolean
}

// Vibe-verbs / hype words from the voice primer (lib/ai/voice.ts §banned). A curated,
// high-signal subset — the lint flags them as warnings; the em dash is the hard block.
const BANNED_PHRASES = [
  'tap into',
  'drop into',
  'sink into',
  'lean into',
  'tune into yourself',
  'hold space',
  'ride the wave',
  'let it flow',
  'align with',
  'unlock',
  'elevate',
  'transform your life',
  'level up',
  'supercharge',
  'optimize',
  'tribe',
  'fam',
  'dive in',
  'game changer',
  'game-changer',
]

/**
 * Lint copy against the hard, mechanical parts of the Frequency voice (docs/
 * CONTENT-VOICE.md §10.8): NO em/en dashes (hard block), no vibe-verb/hype phrases,
 * at most one exclamation point. Pure + unit-tested. This is NOT the whole canon (a
 * human still reads for voice); it is the machine-checkable floor every authored piece
 * of email copy is held to.
 */
export function lintVoice(text: string): VoiceLintResult {
  const violations: VoiceViolation[] = []
  const hasEmDash = /[—–]/.test(text)
  if (hasEmDash) {
    violations.push({
      rule: 'em-dash',
      detail: 'Contains an em or en dash. Use a period, comma, or parentheses instead.',
    })
  }
  const lower = text.toLowerCase()
  for (const phrase of BANNED_PHRASES) {
    if (lower.includes(phrase)) {
      violations.push({ rule: 'banned-phrase', detail: `Banned phrase: "${phrase}". Say it plainly instead.` })
    }
  }
  const exclamations = (text.match(/!/g) ?? []).length
  if (exclamations > 1) {
    violations.push({
      rule: 'exclamation',
      detail: `Uses ${exclamations} exclamation points. Keep it to one at most, usually zero.`,
    })
  }
  return { violations, hasEmDash }
}
