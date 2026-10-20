// Booking module: the public API (PROG-A1, LIVE-1114). Everything outside the module imports it through
// here; the ESLint import-boundary rule in eslint.config.mjs enforces it. A client component uses
// `@/modules/booking/client`. The files stay in place for now; moving them under modules/booking/components changes
// no import outside this barrel.

export { BookingAvailabilityForm } from '@/components/spaces/booking-availability-form'
export { BookingAvailabilitySummary } from '@/components/spaces/booking-availability-summary'
export { BookingServiceTypesForm } from '@/components/spaces/booking-service-types-form'
export { BookingScheduleForm } from '@/components/spaces/booking-schedule-form'
export { BookingOwnerList } from '@/components/spaces/booking-owner-list'
export { BookingMember } from '@/components/spaces/booking-member'
