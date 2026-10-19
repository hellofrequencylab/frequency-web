/** The cookie that remembers a member closed the Network how-to notice. One per member, so a shared
 *  device does not hide it for the next person who signs in. */
export function networkNoticeCookie(authUserId: string): string {
  return `fq_net_notice_${authUserId}`
}
