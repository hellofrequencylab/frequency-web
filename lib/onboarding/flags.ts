import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'

// Master switch for the auto-launching onboarding popups — the ones that open
// themselves at a member without being asked: the daily check-in modal, the
// spotlight tour coachmarks, and the Vera welcome lightbox. Shipped OFF while we
// rebuild this surface around the operator-authored Walkthroughs suite (Acquisition
// → Onboarding). Flip the platform_flags.auto_popups_enabled row (operator control at
// /admin/onboarding-controls) to bring them all back at once. Defaults to FALSE on a
// missing row or read failure — matches the current shipped state. Cached per request.
//
// Out of scope (intentionally still on): the hardcoded Next Steps prompts have their
// own switch (nextStepsEnabled in ./status); Vera's on-demand assistant, the
// app-wide launchers (Capture/Support/Invite), and the earned reward toasts stay —
// those are user-triggered or celebratory feedback, not unsolicited popups.
export const autoPopupsEnabled = cache(async (): Promise<boolean> => {
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('platform_flags')
      .select('value')
      .eq('key', 'auto_popups_enabled')
      .maybeSingle()
    return data?.value ?? false
  } catch {
    return false
  }
})
