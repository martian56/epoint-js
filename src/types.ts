export type Amount = number | string

export interface ClientOptions {
  publicKey: string
  privateKey: string
  baseUrl?: string
  language?: string
  currency?: string
  successRedirectUrl?: string
  errorRedirectUrl?: string
  timeoutMs?: number
  fetch?: typeof fetch
}

export interface CheckoutOptions {
  description?: string
  language?: string
  currency?: string
  successRedirectUrl?: string
  errorRedirectUrl?: string
  otherAttr?: unknown
}

export interface PaymentOptions extends CheckoutOptions {
  isInstallment?: boolean
}

export interface CheckoutForm {
  url: string
  data: string
  signature: string
}

export interface ChargeOptions {
  description?: string
  language?: string
  currency?: string
}

export interface ReverseOptions {
  amount?: Amount
  language?: string
  currency?: string
}

export interface InstallmentQueryOptions {
  amount?: Amount
  language?: string
  currency?: string
  description?: string
  otherAttr?: unknown
}

export interface RegisterCardOptions {
  description?: string
  language?: string
  forPayouts?: boolean
  successRedirectUrl?: string
  errorRedirectUrl?: string
}

export interface InvoiceOptions {
  name?: string
  description?: string
  phone?: string
  email?: string
  tin?: string
  contractNumber?: string
  merchantOrderId?: string
  display?: boolean
  saveAsTemplate?: boolean
  allowInstallment?: boolean
}

export interface BankTransferOptions {
  bankName?: string
  email?: string
  address?: string
  additionalInfo?: string
  webhookUrl?: string
  bulkDescription?: string
}
