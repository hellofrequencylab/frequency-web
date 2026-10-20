// QR module: the public API (PROG-A1, LIVE-1114). Everything outside the module imports it through
// here; the ESLint import-boundary rule in eslint.config.mjs enforces it. A client component uses
// `@/modules/qr/client`. The files stay in place for now; moving them under modules/qr/components changes
// no import outside this barrel.

export { QrShareDropdown } from '@/components/qr/qr-share-dropdown'
export { ShareImageProvider } from '@/components/qr/share-image-context'
export { ShareRefProvider } from '@/components/qr/share-ref-context'
export { SpaceStockQr } from '@/components/qr/space-stock-qr'
