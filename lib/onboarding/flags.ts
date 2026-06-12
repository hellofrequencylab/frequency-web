// Master switch for the auto-launching onboarding popups — the ones that open
// themselves at a member without being asked: the daily check-in modal, the
// spotlight tour coachmarks, and the Vera welcome lightbox. Shipped OFF while we
// rebuild this surface around the operator-authored Walkthroughs suite (Acquisition
// → Onboarding). Flip to `true` to bring them all back at once.
//
// Out of scope (intentionally still on): the hardcoded Next Steps prompts have their
// own switch (NEXT_STEPS_ENABLED in ./status); Vera's on-demand assistant, the
// app-wide launchers (Capture/Support/Invite), and the earned reward toasts stay —
// those are user-triggered or celebratory feedback, not unsolicited popups.
export const AUTO_POPUPS_ENABLED = false
