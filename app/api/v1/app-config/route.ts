import { z } from 'zod'
import { appPlatform, type AppConfigView } from '@/lib/contract'
import { failFrom, ok, rateLimited, readInput } from '@/lib/contract/respond'
import { belowMinimum } from '@/lib/app-config/version'
import {
  aiEnabledFlag,
  chatDmRoutesRetiredFlag,
  feedOpenFlag,
  getPlatformSetting,
  referralsEnabled,
  smsEnabledFlag,
} from '@/lib/platform-flags'

// GET /api/v1/app-config?platform=ios&version=1.4.2 (LIVE-722): what an app build reads at launch.
//
// public-endpoint: a build must be able to learn it is too old before anyone signs in, so there
// is no authorizeCaller. Nothing caller-scoped crosses: the answer is the same for every build of
// the same platform and version, which is why it may be cached for a few minutes.
//
// THE MINIMUM SUPPORTED VERSION is the platform_settings row `app_min_supported_version_<platform>`
// (operator-set, text), and the newest release `app_latest_version_<platform>`. With no row the
// minimum is 0.0.0: every build is supported. Raising it is how a broken build is told to update,
// and how a v1 route is retired (docs/APP-CONTRACT.md §7).
//
// THE FLAGS are the existing platform_flags readers, each with its own fail direction. Only flags
// a client needs are listed; a money or staff switch is never exposed here.

export const dynamic = 'force-dynamic'

const query = z.object({ platform: appPlatform, version: z.string().max(32).optional() })

export async function GET(request: Request) {
  const limited = await rateLimited(request, 'app-config')
  if (limited) return limited

  try {
    const { platform, version } = readInput(query, Object.fromEntries(new URL(request.url).searchParams))
    const [minSupportedVersion, latest, feedOpen, referrals, ai, sms, dmRoutesRetired] = await Promise.all([
      getPlatformSetting(`app_min_supported_version_${platform}`, '0.0.0'),
      getPlatformSetting(`app_latest_version_${platform}`, ''),
      feedOpenFlag(),
      referralsEnabled(),
      aiEnabledFlag(),
      smsEnabledFlag(),
      chatDmRoutesRetiredFlag(),
    ])
    const view: AppConfigView = {
      platform,
      minSupportedVersion,
      latestVersion: latest || null,
      updateRequired: belowMinimum(version, minSupportedVersion),
      flags: { feedOpen, referrals, ai, sms, dmRoutesRetired },
    }
    return ok(view, { headers: { 'cache-control': 'public, max-age=300' } })
  } catch (e) {
    return failFrom(e)
  }
}
