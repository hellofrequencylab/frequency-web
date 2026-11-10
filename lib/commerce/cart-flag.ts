import { envFlag } from '@/lib/env/string'

/** The persistent cart (DEF-ETSY P5). Blank = dark: every cart action refuses and no cart control renders.
 *  Read at call time so a test can set the variable and ask again. Gate in docs/RUNBOOKS.md ("Persistent cart"). */
export const cartEnabled = (): boolean => envFlag('COMMERCE_CART_ENABLED')
