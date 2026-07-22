/** The status on a response or a callback. */
export const Status = {
  NEW: 'new',
  SUCCESS: 'success',
  FAILED: 'failed',
  ERROR: 'error',
  RETURNED: 'returned',
  SERVER_ERROR: 'server_error',
} as const

export type Status = (typeof Status)[keyof typeof Status]

export const SETTLED_STATUSES: ReadonlySet<string> = new Set([Status.SUCCESS])

export const CardStatus = {
  NEW: 'new',
  ACTIVE: 'active',
  PENDING: 'pending',
  REJECTED: 'rejected',
  EXPIRED: 'expired',
  SESSION_EXPIRED: 'session_expired',
} as const

export type CardStatus = (typeof CardStatus)[keyof typeof CardStatus]

export const USABLE_CARD_STATUSES: ReadonlySet<string> = new Set([CardStatus.ACTIVE])

export const InvoiceStatus = {
  WAITING: 'waiting_for_payment',
  PAID: 'paid',
  CANCELED: 'canceled',
} as const

export type InvoiceStatus = (typeof InvoiceStatus)[keyof typeof InvoiceStatus]

export const B2BStatus = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
} as const

export type B2BStatus = (typeof B2BStatus)[keyof typeof B2BStatus]

/** What the transaction did, as it comes back on a callback. */
export const OperationCode = {
  CARD_REGISTRATION: '001',
  PAYMENT: '100',
  REGISTRATION_WITH_PAYMENT: '200',
} as const

export type OperationCode = (typeof OperationCode)[keyof typeof OperationCode]

export const Language = {
  AZ: 'az',
  EN: 'en',
  RU: 'ru',
} as const

export type Language = (typeof Language)[keyof typeof Language]

export const Currency = {
  AZN: 'AZN',
  USD: 'USD',
  EUR: 'EUR',
  RUB: 'RUB',
} as const

export type Currency = (typeof Currency)[keyof typeof Currency]

/** Checkout takes any of these. */
export const SUPPORTED_CURRENCIES: ReadonlySet<string> = new Set(Object.values(Currency))

/** Split, pre-auth, refund, reverse, payout and wallet take AZN and nothing else. */
export const AZN_ONLY: ReadonlySet<string> = new Set([Currency.AZN])
