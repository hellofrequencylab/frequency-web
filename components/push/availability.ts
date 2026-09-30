// What THIS browser can do about web push, read once and decided by one pure function (LIVE-701).
//
// Every control that offers push reads `pushAvailability(readPushEnv())` and renders from the
// answer, so the rules live here and nowhere else:
//
//   · 'ios-install'  iPhone and iPad give web push ONLY to a site added to the Home Screen and
//                    opened from there (Safari 16.4+). In a Safari tab there is no PushManager at
//                    all, so plain feature detection would call it 'unsupported' and hide the one
//                    step that fixes it. Checked FIRST for that reason: the member is told to add
//                    Frequency to the Home Screen instead of being shown a button that cannot work.
//   · 'unsupported'  no service worker, no PushManager, or no Notification. Nothing to offer.
//   · 'denied'       the member (or the browser on their behalf) blocked notifications. Terminal:
//                    no control ever asks again; only the browser's own settings can undo it.
//   · 'granted'      already allowed. Subscribing shows no prompt.
//   · 'askable'      permission is 'default'. A TAP may ask. Nothing else may: a prompt with no
//                    user gesture is refused by iPhone Safari and quieted by Chrome.
//
// Pure and dependency-free so it is cheap to import from the (main) layout's PushRegistration and
// trivially testable with a hand-built env.

export type PushAvailability = 'ios-install' | 'unsupported' | 'denied' | 'granted' | 'askable'

export interface PushEnv {
  hasServiceWorker: boolean
  hasPushManager: boolean
  hasNotification: boolean
  /** Notification.permission, or null when the Notification API is absent. */
  permission: NotificationPermission | null
  /** iPhone, iPod, or an iPad (iPadOS reports itself as a Mac with a touch screen). */
  isIos: boolean
  /** Opened from the Home Screen as an installed web app, not in a browser tab. */
  isStandalone: boolean
}

export function pushAvailability(env: PushEnv): PushAvailability {
  if (env.isIos && !env.isStandalone) return 'ios-install'
  if (!env.hasServiceWorker || !env.hasPushManager || !env.hasNotification) return 'unsupported'
  if (env.permission === 'denied') return 'denied'
  if (env.permission === 'granted') return 'granted'
  return 'askable'
}

/** Reads the live browser. Call only after mount (never during a server render). */
export function readPushEnv(): PushEnv {
  const nav = navigator as Navigator & { standalone?: boolean }
  const hasNotification = 'Notification' in window
  const ua = nav.userAgent || ''
  const isIos =
    /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && (nav.maxTouchPoints ?? 0) > 1)
  let displayStandalone = false
  try {
    displayStandalone =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(display-mode: standalone)').matches
  } catch {
    displayStandalone = false
  }
  return {
    hasServiceWorker: 'serviceWorker' in nav,
    hasPushManager: 'PushManager' in window,
    hasNotification,
    permission: hasNotification ? Notification.permission : null,
    isIos,
    isStandalone: nav.standalone === true || displayStandalone,
  }
}
