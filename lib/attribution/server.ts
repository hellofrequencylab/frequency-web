// Acquisition resolution + persistence (ADR-095). Server-only: reads the
// attribution cookies (first-touch + channel hint + referral + beta sequence),
// folds them into one canonical record, and stamps it on a member or lead.
//
// Model: FIRST-TOUCH PRIMARY. The canonical `channel` (and the governed
// `source_<channel>` tag) is the FIRST channel they ever arrived through —
// immutable. The converting channel + full utm/referrer history are kept in the
// record for analysis. Best-effort everywhere; attribution never blocks signup.

import { cookies } from 'next/headers'
import { assignTag } from '@/lib/traits/tags'
import {
  type AcquisitionChannel,
  channelTag,
  deriveChannel,
  isChannel,
} from '@/lib/attribution/channels'
import {
  FIRST_TOUCH_COOKIE,
  CHANNEL_COOKIE,
  decodeFirstTouch,
  type FirstTouch,
} from '@/lib/attribution/first-touch'

const REF_COOKIE = 'fq_ref'
const BETA_SEQ_COOKIE = 'fq_beta_seq'

/** The canonical record persisted on profiles.meta.acquisition / contacts.meta.acquisition. */
export interface AcquisitionRecord {
  /** First-touch channel — the canonical origin (also the governed tag). */
  channel: AcquisitionChannel
  /** Full first-touch detail (utm / referrer / landing / timestamp), if captured. */
  first_touch: FirstTouch | null
  /** The channel they converted through (explicit signal), for multi-touch analysis. */
  last_touch_channel: AcquisitionChannel
  /** Richer per-channel signals that a single channel value can't hold. */
  signals: {
    /** The referrer's profile id (from the fq_ref cookie). */
    referrer_profile_id?: string
    /** The beta sequence slug they arrived through (from fq_beta_seq). */
    beta_sequence?: string
  }
  /** When this record was resolved + stamped. */
  stamped_at: string
}

/** Map a beta sequence slug to its acquisition channel (fallback when no fq_attr). */
function channelFromSequence(seq: string | undefined): AcquisitionChannel | null {
  if (!seq) return null
  // The base flow (`beta-default`, every plain /onboarding/beta visit) carries no
  // channel signal of its own — fall through to the other signals / 'direct'.
  if (seq === 'beta-default') return null
  // Legacy slugs: early-adopter was the video on-ramp; the others were person-driven.
  return seq === 'early-adopter' ? 'video' : 'referral'
}

/**
 * Resolve the acquisition record from the request's attribution cookies. Pure read
 * (no writes); safe to call from any server action / route.
 */
export async function resolveAcquisition(): Promise<AcquisitionRecord> {
  const jar = await cookies()
  const firstTouch = decodeFirstTouch(jar.get(FIRST_TOUCH_COOKIE)?.value)
  const channelHint = jar.get(CHANNEL_COOKIE)?.value
  const referrerProfileId = jar.get(REF_COOKIE)?.value
  const betaSequence = jar.get(BETA_SEQ_COOKIE)?.value

  // First-touch channel (canonical). Prefer the captured first-touch record; fall
  // back to the explicit signals when the cookie is missing (older/blocked visitor).
  const channel: AcquisitionChannel = firstTouch
    ? deriveChannel(firstTouch)
    : (channelHint && isChannel(channelHint) ? channelHint : null) ??
      (referrerProfileId ? 'referral' : null) ??
      channelFromSequence(betaSequence) ??
      'direct'

  // Last-touch / converting channel (explicit signals win; else = first-touch).
  const lastTouch: AcquisitionChannel =
    (channelHint && isChannel(channelHint) ? channelHint : null) ??
    (referrerProfileId ? 'referral' : null) ??
    channelFromSequence(betaSequence) ??
    channel

  const signals: AcquisitionRecord['signals'] = {}
  if (referrerProfileId) signals.referrer_profile_id = referrerProfileId
  if (betaSequence) signals.beta_sequence = betaSequence

  return {
    channel,
    first_touch: firstTouch,
    last_touch_channel: lastTouch,
    signals,
    stamped_at: new Date().toISOString(),
  }
}

/** Stamp the governed first-touch source tag on a member (best-effort, never throws). */
export async function stampAcquisitionTag(profileId: string, record: AcquisitionRecord): Promise<void> {
  try {
    await assignTag(profileId, channelTag(record.channel), {
      source: 'attribution',
      context: {
        channel: record.channel,
        last_touch: record.last_touch_channel,
        campaign: record.first_touch?.utm?.campaign ?? null,
        medium: record.first_touch?.utm?.medium ?? null,
        utm_source: record.first_touch?.utm?.source ?? null,
      },
    })
  } catch {
    /* attribution is best-effort */
  }
}
