import { envFlag } from '@/lib/env/string'
import { cartEnabled } from './cart-flag'

/** Paying for a saved cart (DEF-ETSY P5). Blank = dark: /cart shows no Check out control and the action refuses.
 *  It also needs the cart itself on, since there is nothing to pay for without one. Read at call time so a
 *  test can set the variable and ask again. Gate in docs/RUNBOOKS.md ("Persistent cart"). */
export const cartCheckoutEnabled = (): boolean => cartEnabled() && envFlag('COMMERCE_CART_CHECKOUT_ENABLED')
