/** The `secure` flag for first-party cookies (SCAN-1232). On in production so a downgraded or mixed-content
 *  request never carries the stashed next path, referral id or entry stamp; off in dev, where http://localhost
 *  would otherwise drop the cookie. HSTS preload is on, this keeps every cookie consistent with it. */
export const SECURE_COOKIE = process.env.NODE_ENV === 'production'
