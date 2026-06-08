// The Member Data Platform registry — the governed "library of variables" for
// members (ADR-068, docs/MEMBER-DATA-PLATFORM.md). Every member-level variable we
// rely on for gamification, marketing, or product metrics is DECLARED here before
// it exists, the same governance pattern as the help feature-key registry.
//
// Definitions live in git (reviewed in PRs, documented, PII-classed); *values* live
// in Postgres (member_tags for tags; member_traits for computed, Phase 2). Keeping
// meaning in code is what keeps the catalog from rotting into a junk drawer.
//
// Three kinds:
//   • tag        — declarative membership, asserted by a human/system, time + source
//                  aware (web_beta, founder, host). Stored as member_tags rows.
//   • computed   — derived from the engagement_events ledger + interaction firehose on a
//                  schedule (lifecycle, cohort, usage, WAM, behavioral features).
//   • predicted  — a forward-looking score/label inferred from the feature store
//                  (churn risk, activation propensity, next-best-action). PI.3 / ADR-166;
//                  heuristic today, model/Claude-graded later. Same storage + governance.

export type TraitKind = 'tag' | 'computed' | 'predicted'
export type TraitType = 'boolean' | 'number' | 'string' | 'enum' | 'timestamp'
export type TraitCategory = 'involvement' | 'lifecycle' | 'engagement' | 'gamification' | 'marketing'
/** Privacy class drives retention + erase + export handling (privacy-by-design). */
export type PiiClass = 'none' | 'identity' | 'sensitive'
export type Freshness = 'static' | 'nightly' | 'realtime'

export interface TraitDef {
  key: string
  label: string
  description: string
  kind: TraitKind
  category: TraitCategory
  type: TraitType
  /** How private the value is. `none` = behavioral/derived, not identifying. */
  pii: PiiClass
  /** How current the value is kept. Tags are `static` (asserted, not recomputed). */
  freshness: Freshness
  /** Retention horizon; null = kept for the member's lifetime, erased with account. */
  retentionDays: number | null
  /** Team/area accountable for the definition. */
  owner: string
  /** For computed traits: a one-line note on what it's derived from. */
  derivation?: string
  /** For enum/tag values: the allowed set. */
  values?: readonly string[]
  /** Tags only: true when assigned by the system, not hand-applied by staff. */
  systemManaged?: boolean
}

export const TRAIT_REGISTRY: readonly TraitDef[] = [
  // ── Tags · involvement ────────────────────────────────────────────────────
  {
    key: 'web_beta',
    label: 'Web Beta',
    description: 'Joined during the web beta (the founding cohort). A durable badge of early involvement — usable for marketing, discounts, and early access.',
    kind: 'tag', category: 'involvement', type: 'boolean',
    pii: 'none', freshness: 'static', retentionDays: null, owner: 'marketing',
    systemManaged: true,
  },
  {
    key: 'founder',
    label: 'Founder',
    description: 'A founding member who took the beta oath / helped build the thing. Runs "hot" in Vera\'s voice (AI-VERA §7).',
    kind: 'tag', category: 'involvement', type: 'boolean',
    pii: 'none', freshness: 'static', retentionDays: null, owner: 'community',
    systemManaged: false,
  },
  {
    key: 'host',
    label: 'Host',
    description: 'Runs a circle or recurring practice — a human anchor Vera routes members toward.',
    kind: 'tag', category: 'involvement', type: 'boolean',
    pii: 'none', freshness: 'static', retentionDays: null, owner: 'community',
    systemManaged: false,
  },
  {
    key: 'vip',
    label: 'VIP',
    description: 'High-value / high-trust member, hand-applied by staff. Drives perks and early access.',
    kind: 'tag', category: 'marketing', type: 'boolean',
    pii: 'none', freshness: 'static', retentionDays: null, owner: 'marketing',
    systemManaged: false,
  },

  // ── Tags · marketing · beta cohorts ────────────────────────────────────────
  // Which beta sequence a member arrived through (lib/onboarding/beta-sequences.ts).
  // Stamped automatically at induction so the founding cohort stays segmentable by
  // entry path forever — even after the beta flow itself is removed at launch.
  {
    key: 'beta_early_adopter',
    label: 'Beta · Early adopter',
    description: 'Arrived through the early-adopter sequence — a follower who saw the launch video and claimed a beta spot.',
    kind: 'tag', category: 'marketing', type: 'boolean',
    pii: 'none', freshness: 'static', retentionDays: null, owner: 'marketing',
    systemManaged: true,
  },
  {
    key: 'beta_personal',
    label: 'Beta · Personal invite',
    description: "Arrived through Daniel's personal invite sequence — hand-invited into the dream to help shape it.",
    kind: 'tag', category: 'marketing', type: 'boolean',
    pii: 'none', freshness: 'static', retentionDays: null, owner: 'marketing',
    systemManaged: true,
  },
  {
    key: 'beta_founding_partner',
    label: 'Beta · Founding Partner',
    description: 'Arrived through the Founding Partner sequence — a collaborator or business in on the ground floor.',
    kind: 'tag', category: 'marketing', type: 'boolean',
    pii: 'none', freshness: 'static', retentionDays: null, owner: 'marketing',
    systemManaged: true,
  },

  // ── Tags · marketing · persona (ADR-125) ───────────────────────────────────
  // WHO the member said they were at intake (lib/onboarding/personas.ts) — the
  // self-identified fork that routes the lead-flow marketing track and branches the
  // induction. Stamped at induction from the fq_persona cookie; the rich answer also
  // rides profiles.meta.persona. One boolean tag per persona so each is segmentable
  // forever (send practitioners the host tools, partners the loyalty program, …).
  {
    key: 'persona_visitor',
    label: 'Persona · Visitor',
    description: 'Identified as a visitor / regular member at intake — here to find their people and belong.',
    kind: 'tag', category: 'marketing', type: 'boolean',
    pii: 'none', freshness: 'static', retentionDays: null, owner: 'marketing',
    systemManaged: true,
  },
  {
    key: 'persona_practitioner',
    label: 'Persona · Practitioner',
    description: 'Identified as a practitioner with something to offer — hosts/builds programs, sells on the marketplace.',
    kind: 'tag', category: 'marketing', type: 'boolean',
    pii: 'none', freshness: 'static', retentionDays: null, owner: 'marketing',
    systemManaged: true,
  },
  {
    key: 'persona_partner',
    label: 'Persona · Partner business',
    description: 'Identified as a local business — the loyalty-rewards + gamified-foot-traffic track.',
    kind: 'tag', category: 'marketing', type: 'boolean',
    pii: 'none', freshness: 'static', retentionDays: null, owner: 'marketing',
    systemManaged: true,
  },
  {
    key: 'persona_builder',
    label: 'Persona · Community builder',
    description: 'Identified as someone who wants to help build + grow the community — the crew / host / guide path.',
    kind: 'tag', category: 'marketing', type: 'boolean',
    pii: 'none', freshness: 'static', retentionDays: null, owner: 'marketing',
    systemManaged: true,
  },
  {
    key: 'persona_investor',
    label: 'Persona · Lab champion',
    description: 'Identified as an investor / champion who wants a Frequency Lab in their town — the partner/invest conversation.',
    kind: 'tag', category: 'marketing', type: 'boolean',
    pii: 'none', freshness: 'static', retentionDays: null, owner: 'marketing',
    systemManaged: true,
  },

  // ── Tags · marketing · acquisition source (ADR-095) ─────────────────────────
  // The FIRST channel a member arrived through (first-touch), stamped once at
  // signup from lib/attribution. One boolean tag per channel so cohorts are
  // segmentable by origin forever; the rich utm/referrer/landing detail rides
  // profiles.meta.acquisition. Keys mirror channelTag() in lib/attribution/channels.ts.
  {
    key: 'source_donor',
    label: 'Source · Donor',
    description: 'First arrived as a donor / sponsor / partner (gave money or a partnership).',
    kind: 'tag', category: 'marketing', type: 'boolean',
    pii: 'none', freshness: 'static', retentionDays: null, owner: 'marketing',
    systemManaged: true,
  },
  {
    key: 'source_referral',
    label: 'Source · Referral',
    description: 'First arrived because a person sent them — an invite link or a member’s referral/QR code.',
    kind: 'tag', category: 'marketing', type: 'boolean',
    pii: 'none', freshness: 'static', retentionDays: null, owner: 'marketing',
    systemManaged: true,
  },
  {
    key: 'source_qr_scan',
    label: 'Source · QR scan',
    description: 'First arrived by scanning a QR code (marketing or personal).',
    kind: 'tag', category: 'marketing', type: 'boolean',
    pii: 'none', freshness: 'static', retentionDays: null, owner: 'marketing',
    systemManaged: true,
  },
  {
    key: 'source_event_guest',
    label: 'Source · Event guest',
    description: 'First arrived from an event page / guest touchpoint.',
    kind: 'tag', category: 'marketing', type: 'boolean',
    pii: 'none', freshness: 'static', retentionDays: null, owner: 'marketing',
    systemManaged: true,
  },
  {
    key: 'source_video',
    label: 'Source · Video',
    description: 'First arrived from a video on-ramp (e.g. YouTube).',
    kind: 'tag', category: 'marketing', type: 'boolean',
    pii: 'none', freshness: 'static', retentionDays: null, owner: 'marketing',
    systemManaged: true,
  },
  {
    key: 'source_social',
    label: 'Source · Social',
    description: 'First arrived from a social platform (IG, TikTok, X, Facebook, LinkedIn, Reddit…).',
    kind: 'tag', category: 'marketing', type: 'boolean',
    pii: 'none', freshness: 'static', retentionDays: null, owner: 'marketing',
    systemManaged: true,
  },
  {
    key: 'source_search',
    label: 'Source · Search',
    description: 'First arrived from a search engine (organic search).',
    kind: 'tag', category: 'marketing', type: 'boolean',
    pii: 'none', freshness: 'static', retentionDays: null, owner: 'marketing',
    systemManaged: true,
  },
  {
    key: 'source_email',
    label: 'Source · Email',
    description: 'First arrived from an email or newsletter link.',
    kind: 'tag', category: 'marketing', type: 'boolean',
    pii: 'none', freshness: 'static', retentionDays: null, owner: 'marketing',
    systemManaged: true,
  },
  {
    key: 'source_organic',
    label: 'Source · Organic',
    description: 'First arrived via an external site referrer that isn’t search or social.',
    kind: 'tag', category: 'marketing', type: 'boolean',
    pii: 'none', freshness: 'static', retentionDays: null, owner: 'marketing',
    systemManaged: true,
  },
  {
    key: 'source_direct',
    label: 'Source · Direct',
    description: 'First arrived directly — typed the URL or no referrer / campaign.',
    kind: 'tag', category: 'marketing', type: 'boolean',
    pii: 'none', freshness: 'static', retentionDays: null, owner: 'marketing',
    systemManaged: true,
  },

  // ── Computed · lifecycle (declared now; computed in Phase 2) ───────────────
  {
    key: 'lifecycle_stage',
    label: 'Lifecycle stage',
    description: 'Where the member is in their journey. The spine for activation + win-back.',
    kind: 'computed', category: 'lifecycle', type: 'enum',
    values: ['new', 'activated', 'engaged', 'at_risk', 'dormant', 'reactivated'],
    pii: 'none', freshness: 'nightly', retentionDays: null, owner: 'growth',
    derivation: 'recency + activation_date + practice cadence from engagement_events',
  },
  {
    key: 'join_cohort',
    label: 'Join cohort',
    description: 'The week/wave a member joined — the axis for cohort retention analysis.',
    kind: 'computed', category: 'lifecycle', type: 'string',
    pii: 'none', freshness: 'static', retentionDays: null, owner: 'growth',
    derivation: 'profiles.created_at → ISO week',
  },
  {
    key: 'activation_date',
    label: 'Activation date',
    description: 'When the member first hit the activation bar (first verified practice). The leading indicator of retention (ADR-024).',
    kind: 'computed', category: 'lifecycle', type: 'timestamp',
    pii: 'none', freshness: 'nightly', retentionDays: null, owner: 'growth',
    derivation: "first engagement_events row with event_type 'practice.verified'",
  },

  // ── Computed · engagement (declared now; computed in Phase 2) ──────────────
  {
    key: 'last_active_at',
    label: 'Last active',
    description: 'Most recent meaningful activity. Powers recency, win-back, and Vera "just lapsed" nudges.',
    kind: 'computed', category: 'engagement', type: 'timestamp',
    pii: 'none', freshness: 'realtime', retentionDays: null, owner: 'growth',
    derivation: 'max(created_at) over the member\'s engagement_events',
  },
  {
    key: 'days_active_30',
    label: 'Active days (30d)',
    description: 'Distinct active days in the last 30 — a usage-depth measure beyond a single login.',
    kind: 'computed', category: 'engagement', type: 'number',
    pii: 'none', freshness: 'nightly', retentionDays: null, owner: 'growth',
    derivation: 'count(distinct day) of engagement_events in 30d',
  },
  {
    key: 'wam_status',
    label: 'WAM status',
    description: 'Whether the member is Weekly Active (≥1 verified practice in a rolling 7d) — the North Star at the member level (ADR-024).',
    kind: 'computed', category: 'engagement', type: 'boolean',
    pii: 'none', freshness: 'nightly', retentionDays: null, owner: 'growth',
    derivation: "≥1 'practice.verified' in trailing 7d",
  },
  {
    key: 'rfm_score',
    label: 'RFM score',
    description: 'Recency / Frequency / Monetary-style engagement score for segmentation and prioritization.',
    kind: 'computed', category: 'engagement', type: 'number',
    pii: 'none', freshness: 'nightly', retentionDays: null, owner: 'growth',
    derivation: 'quantized recency × frequency from engagement_events (+ currency depth)',
  },

  // ── Behavioral features (the firehose feature store · PI.2 / ADR-166) ────────
  // Derived from the raw interaction_events stream (views/dwell/scroll/clicks), not
  // the semantic ledger — the durable per-member aggregate the AI + reward engine read.
  {
    key: 'interaction_count_30',
    label: 'Interactions (30d)',
    description: 'Raw interaction events (views, dwell, scroll, clicks) in the last 30 days — overall on-site activity volume.',
    kind: 'computed', category: 'engagement', type: 'number',
    pii: 'none', freshness: 'nightly', retentionDays: null, owner: 'growth',
    derivation: 'count(interaction_events) over 30d',
  },
  {
    key: 'interaction_days_30',
    label: 'Active days · interactions (30d)',
    description: 'Distinct days with any on-site interaction in the last 30 days — a stickiness signal.',
    kind: 'computed', category: 'engagement', type: 'number',
    pii: 'none', freshness: 'nightly', retentionDays: null, owner: 'growth',
    derivation: 'distinct day(occurred_at) over 30d',
  },
  {
    key: 'surfaces_touched_30',
    label: 'Surfaces touched (30d)',
    description: 'Distinct pages/surfaces the member engaged in the last 30 days — breadth of use.',
    kind: 'computed', category: 'engagement', type: 'number',
    pii: 'none', freshness: 'nightly', retentionDays: null, owner: 'growth',
    derivation: 'distinct surface over 30d',
  },
  {
    key: 'dwell_minutes_30',
    label: 'Dwell minutes (30d)',
    description: 'Total time-on-page (minutes) across surfaces in the last 30 days — attention/depth.',
    kind: 'computed', category: 'engagement', type: 'number',
    pii: 'none', freshness: 'nightly', retentionDays: null, owner: 'growth',
    derivation: "sum(props.ms) where kind='dwell' over 30d, ÷60000",
  },
  {
    key: 'sessions_30',
    label: 'Sessions (30d)',
    description: 'Distinct visit sessions in the last 30 days — frequency of return.',
    kind: 'computed', category: 'engagement', type: 'number',
    pii: 'none', freshness: 'nightly', retentionDays: null, owner: 'growth',
    derivation: 'distinct session_id over 30d',
  },
  {
    key: 'scroll_depth_avg',
    label: 'Avg scroll depth (30d)',
    description: 'Average scroll-depth milestone reached (0–100) — content consumption depth.',
    kind: 'computed', category: 'engagement', type: 'number',
    pii: 'none', freshness: 'nightly', retentionDays: null, owner: 'growth',
    derivation: "avg(props.pct) where kind='scroll' over 30d",
  },
  {
    key: 'last_interaction_at',
    label: 'Last interaction',
    description: 'Timestamp of the most recent raw interaction — finer-grained recency than the semantic ledger.',
    kind: 'computed', category: 'engagement', type: 'timestamp',
    pii: 'none', freshness: 'nightly', retentionDays: null, owner: 'growth',
    derivation: 'max(interaction_events.occurred_at)',
  },
  {
    key: 'engagement_depth',
    label: 'Engagement depth',
    description: 'Composite behavioral depth band (idle / shallow / moderate / deep) from interaction frequency + dwell. A feature the AI + reward engine read.',
    kind: 'computed', category: 'engagement', type: 'enum',
    pii: 'none', freshness: 'nightly', retentionDays: null, owner: 'growth',
    values: ['idle', 'shallow', 'moderate', 'deep'],
    derivation: 'banded from interaction_days_30 + dwell_minutes_30',
  },

  // ── Predicted features (the prediction layer · PI.3 / ADR-166) ───────────────
  // Forward-looking inferences from the feature store. Heuristic v1 (rules over the
  // computed traits); a model/Claude-graded path slots in behind the same keys later.
  {
    key: 'churn_risk',
    label: 'Churn risk',
    description: 'Likelihood the member is drifting away (low / medium / high) — from recency, lifecycle, and engagement depth. Drives win-back prioritization.',
    kind: 'predicted', category: 'lifecycle', type: 'enum',
    pii: 'none', freshness: 'nightly', retentionDays: null, owner: 'growth',
    values: ['low', 'medium', 'high'],
    derivation: 'heuristic over lifecycle_stage + rfm + engagement_depth (PI.3)',
  },
  {
    key: 'activation_propensity',
    label: 'Activation propensity',
    description: 'For not-yet-activated members, a 0–100 score of how likely they are to activate, from early-engagement signals. 100 once activated.',
    kind: 'predicted', category: 'lifecycle', type: 'number',
    pii: 'none', freshness: 'nightly', retentionDays: null, owner: 'growth',
    derivation: 'heuristic over interaction days/surfaces/sessions + tenure (PI.3)',
  },
  {
    key: 'next_best_action',
    label: 'Next best action',
    description: 'The single highest-leverage nudge for this member right now (reengage / activate / join_circle / deepen / invite / none) — what Vera or a campaign should prompt.',
    kind: 'predicted', category: 'lifecycle', type: 'enum',
    pii: 'none', freshness: 'nightly', retentionDays: null, owner: 'growth',
    values: ['reengage', 'activate', 'join_circle', 'deepen', 'invite', 'none'],
    derivation: 'priority ladder over lifecycle + activation + engagement_depth (PI.3)',
  },
] as const

const BY_KEY = new Map(TRAIT_REGISTRY.map((t) => [t.key, t]))

/** All registered tag definitions. */
export const TAGS: readonly TraitDef[] = TRAIT_REGISTRY.filter((t) => t.kind === 'tag')

/** Look up a trait/tag definition by key. */
export function getTrait(key: string): TraitDef | undefined {
  return BY_KEY.get(key)
}

/** True when `key` is a registered tag (not a computed trait, not unknown). */
export function isTagKey(key: string): boolean {
  return BY_KEY.get(key)?.kind === 'tag'
}
