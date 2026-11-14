// Support meaning stays separate from the primary/secondary reward ledger.
// Plain shared copy only: no personal data, model calls, storage or reward calculations.
export const PRACTICE_SUPPORT_COPY = {
  heading: 'What can this support?',
  hint: 'Choose any that fit. A practice can support different parts of life at once.',
  detailHint: 'Add instructions or timing where they help. These can differ for each kind of support.',
  primaryLabel: 'Primary Pillar',
  secondaryRewardLabel: 'Additional reward Pillar',
  primaryRewardLabel: 'Primary reward share (%)',
  allocationHint: 'This divides the existing Zaps between recorded Pillars. It does not change the total reward or measure wellbeing.',
} as const

export const PRACTICE_SUPPORT_GUIDANCE = `A Practice may support several Pillars: Mind, Body, Spirit, and Expression. Mind can mean attention or reflection; Body can mean movement or rest; Spirit can mean presence, connection, or meaning. These are overlapping invitations, not fixed definitions. Expression can mean making, speaking, helping, sharing, or connecting, and it can be private. No one has to reach balance before expressing themselves. Suggest only associations supported by the author's content, for the author to accept. Preserve their choices. Where a structured field accepts one primary Pillar, choose that one without claiming the Practice supports only that area. Never invent extra output fields or change reward allocation.`

export const VERA_PRACTICE_SUPPORT_GUIDANCE = `When someone wants support, ask what would be useful to them and use their stated needs. Offer one small, relevant option and an easy alternative; do not turn every conversation into a task. Rest, continuing something familiar, declining, or changing direction are valid choices. Mind, Body, and Spirit are overlapping ways to support a person; Expression can happen throughout, including making, speaking, helping, or connecting. It can remain private and never requires prior balance. Never infer wellbeing, spirituality, or a personal deficiency from a graph, missing logs, or a category gap. Explain suggestions from what the person chose or said, not an assumed diagnosis. Do not change commitments, send messages, publish, or award completion without the existing confirmation and permission rules.`
