// The tip VOCABULARY — the amounts, and nothing that can reach a database.
//
// Split out of lib/billing/tips.ts (LIVE-037). The tip *flow* there opens the service-role
// admin client and talks to Stripe; these three constants are all the client needs to paint
// the quick-pick chips and validate the custom-amount field. They shared a module, so
// `tip-button.tsx` ('use client') importing TIP_PRESETS_CENTS pulled the RLS-bypassing
// Supabase client and the Stripe SDK into the profile page's browser bundle.
//
// Both bounds are re-exported from lib/billing/tips.ts, so every server caller is unchanged.
// CLIENT code must import from HERE.

/** Suggested tip amounts (cents) shown as quick-pick chips. */
export const TIP_PRESETS_CENTS = [300, 500, 1000] as const
export const TIP_MIN_CENTS = 100 // $1
export const TIP_MAX_CENTS = 50000 // $500 — a sane ceiling for a single tip
