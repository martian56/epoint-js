import { verifyCallback } from './callback'
import { Currency, Language } from './enums'
import { TransportError } from './errors'
import type { EpointCallback, EpointResponse } from './response'
import { buildBody, type Payload, parse } from './transport'
import type {
  Amount,
  BankTransferOptions,
  ChargeOptions,
  CheckoutOptions,
  ClientOptions,
  InstallmentQueryOptions,
  InvoiceOptions,
  RegisterCardOptions,
  ReverseOptions,
} from './types'

const PRODUCTION_URL = 'https://epoint.az'

function money(value: Amount): string {
  return Number(value).toFixed(2)
}

function flag(value: boolean | undefined, fallback = false): number {
  return (value ?? fallback) ? 1 : 0
}

export class EpointClient {
  readonly publicKey: string
  readonly privateKey: string
  readonly baseUrl: string
  readonly language: string
  readonly currency: string
  private readonly successRedirectUrl?: string
  private readonly errorRedirectUrl?: string
  private readonly timeoutMs: number
  private readonly fetchImpl: typeof fetch

  constructor(options: ClientOptions) {
    this.publicKey = options.publicKey
    this.privateKey = options.privateKey
    this.baseUrl = (options.baseUrl ?? PRODUCTION_URL).replace(/\/+$/, '')
    this.language = options.language ?? Language.AZ
    this.currency = options.currency ?? Currency.AZN
    this.successRedirectUrl = options.successRedirectUrl
    this.errorRedirectUrl = options.errorRedirectUrl
    this.timeoutMs = options.timeoutMs ?? 30_000
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis)
  }

  static fromEnv(overrides: Partial<ClientOptions> = {}): EpointClient {
    const env = globalThis.process?.env ?? {}
    const publicKey = env.EPOINT_PUBLIC_KEY
    const privateKey = env.EPOINT_PRIVATE_KEY
    if (!publicKey || !privateKey) {
      throw new Error('EPOINT_PUBLIC_KEY and EPOINT_PRIVATE_KEY must be set')
    }
    return new EpointClient({
      publicKey,
      privateKey,
      baseUrl: env.EPOINT_BASE_URL ?? PRODUCTION_URL,
      language: env.EPOINT_LANGUAGE ?? Language.AZ,
      successRedirectUrl: env.EPOINT_SUCCESS_REDIRECT_URL,
      errorRedirectUrl: env.EPOINT_FAILED_REDIRECT_URL,
      ...overrides,
    })
  }

  private checkout(amount: Amount, orderId: string, options: CheckoutOptions): Payload {
    return {
      amount: money(amount),
      currency: options.currency ?? this.currency,
      language: options.language ?? this.language,
      order_id: orderId,
      description: options.description,
      other_attr: options.otherAttr,
      success_redirect_url: options.successRedirectUrl ?? this.successRedirectUrl,
      error_redirect_url: options.errorRedirectUrl ?? this.errorRedirectUrl,
    }
  }

  private async request(
    method: string,
    path: string,
    init?: RequestInit,
  ): Promise<[number, unknown]> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    let response: Response
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        signal: controller.signal,
        ...init,
      })
    } catch (cause) {
      throw new TransportError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      clearTimeout(timer)
    }

    const text = await response.text()
    try {
      return [response.status, JSON.parse(text)]
    } catch {
      throw new TransportError(`response was not JSON: ${text.slice(0, 200)}`, response.status)
    }
  }

  private async post(path: string, payload: Payload): Promise<EpointResponse> {
    const body = await buildBody(this.publicKey, this.privateKey, payload)
    return parse(...(await this.request('POST', path, { body: new URLSearchParams(body) })))
  }

  private async postRaw(path: string, payload: Payload): Promise<unknown> {
    const body = await buildBody(this.publicKey, this.privateKey, payload)
    const [status, parsed] = await this.request('POST', path, { body: new URLSearchParams(body) })
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      parse(status, parsed)
    }
    return parsed
  }

  private async postJson(path: string, payload: Payload): Promise<EpointResponse> {
    const body = await buildBody(this.publicKey, this.privateKey, payload)
    return parse(
      ...(await this.request('POST', path, {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })),
    )
  }

  createPayment(
    amount: Amount,
    orderId: string,
    options: CheckoutOptions = {},
  ): Promise<EpointResponse> {
    return this.post('/api/1/request', this.checkout(amount, orderId, options))
  }

  createPaymentRequest(
    amount: Amount,
    orderId: string,
    options: CheckoutOptions = {},
  ): Promise<EpointResponse> {
    return this.post('/api/1/payment-request', this.checkout(amount, orderId, options))
  }

  createAmexPayment(
    amount: Amount,
    orderId: string,
    options: CheckoutOptions = {},
  ): Promise<EpointResponse> {
    return this.post('/api/1/amex-request', this.checkout(amount, orderId, options))
  }

  changePaymentSum(
    amount: Amount,
    orderId: string,
    options: CheckoutOptions = {},
  ): Promise<EpointResponse> {
    return this.post('/api/1/payment-change-sum', this.checkout(amount, orderId, options))
  }

  reserve(amount: Amount, orderId: string, options: CheckoutOptions = {}): Promise<EpointResponse> {
    return this.post('/api/1/pre-auth-request', this.checkout(amount, orderId, options))
  }

  capture(transaction: string, amount: Amount): Promise<EpointResponse> {
    return this.post('/api/1/pre-auth-complete', { transaction, amount: money(amount) })
  }

  getStatus(transaction: string): Promise<EpointResponse> {
    return this.post('/api/1/get-status', { transaction })
  }

  getCardStatus(cardId: string): Promise<EpointResponse> {
    return this.post('/api/1/get-status-card', { card_id: cardId })
  }

  createSplitPayment(
    amount: Amount,
    orderId: string,
    splitAccount: string,
    splitAmount: Amount,
    options: CheckoutOptions = {},
  ): Promise<EpointResponse> {
    return this.post('/api/1/split-request', {
      ...this.checkout(amount, orderId, options),
      split_user: splitAccount,
      split_amount: money(splitAmount),
    })
  }

  splitChargeSavedCard(
    cardId: string,
    amount: Amount,
    orderId: string,
    splitAccount: string,
    splitAmount: Amount,
    options: ChargeOptions = {},
  ): Promise<EpointResponse> {
    return this.post('/api/1/split-execute-pay', {
      card_id: cardId,
      amount: money(amount),
      currency: options.currency ?? this.currency,
      language: options.language ?? this.language,
      order_id: orderId,
      split_user: splitAccount,
      split_amount: money(splitAmount),
      description: options.description,
    })
  }

  registerCard(options: RegisterCardOptions = {}): Promise<EpointResponse> {
    return this.post('/api/1/card-registration', {
      language: options.language ?? this.language,
      refund: flag(options.forPayouts),
      description: options.description,
    })
  }

  registerCardAndPay(
    amount: Amount,
    orderId: string,
    options: CheckoutOptions = {},
  ): Promise<EpointResponse> {
    return this.post('/api/1/card-registration-with-pay', this.checkout(amount, orderId, options))
  }

  chargeSavedCard(
    cardId: string,
    amount: Amount,
    orderId: string,
    options: ChargeOptions = {},
  ): Promise<EpointResponse> {
    return this.post('/api/1/execute-pay', {
      card_id: cardId,
      amount: money(amount),
      currency: options.currency ?? this.currency,
      language: options.language ?? this.language,
      order_id: orderId,
      description: options.description,
    })
  }

  refund(
    cardId: string,
    amount: Amount,
    orderId: string,
    options: ChargeOptions = {},
  ): Promise<EpointResponse> {
    return this.post('/api/1/refund-request', {
      card_id: cardId,
      amount: money(amount),
      currency: options.currency ?? this.currency,
      language: options.language ?? this.language,
      order_id: orderId,
      description: options.description,
    })
  }

  reverse(transaction: string, options: ReverseOptions = {}): Promise<EpointResponse> {
    return this.post('/api/1/reverse', {
      transaction,
      amount: options.amount === undefined ? undefined : money(options.amount),
      currency: options.currency ?? this.currency,
      language: options.language ?? this.language,
    })
  }

  async getInstallmentPlans(
    orderId: string,
    options: InstallmentQueryOptions = {},
  ): Promise<Array<Record<string, unknown>>> {
    const result = await this.postRaw('/api/1/get-installment-request', {
      order_id: orderId,
      amount: options.amount === undefined ? undefined : money(options.amount),
      currency: options.currency ?? this.currency,
      language: options.language ?? this.language,
    })
    return Array.isArray(result) ? (result as Array<Record<string, unknown>>) : []
  }

  payByInstallment(
    amount: Amount,
    orderId: string,
    installmentCardId: string,
    installmentMonth: number,
    options: CheckoutOptions = {},
  ): Promise<EpointResponse> {
    return this.post('/api/1/installment-request', {
      ...this.checkout(amount, orderId, options),
      installment_card_id: installmentCardId,
      installment_month: installmentMonth,
    })
  }

  async listWallets(): Promise<Record<string, string>> {
    const result = await this.postRaw('/api/1/wallet/status', {})
    return result && typeof result === 'object' && !Array.isArray(result)
      ? (result as Record<string, string>)
      : {}
  }

  payWithWallet(
    walletId: string,
    amount: Amount,
    orderId: string,
    options: ChargeOptions = {},
  ): Promise<EpointResponse> {
    return this.post('/api/1/wallet/payment', {
      wallet_id: walletId,
      amount: money(amount),
      currency: options.currency ?? this.currency,
      language: options.language ?? this.language,
      order_id: orderId,
      description: options.description,
    })
  }

  createWidget(amount: Amount, orderId: string, description: string): Promise<EpointResponse> {
    return this.post('/api/1/token/widget', {
      amount: money(amount),
      order_id: orderId,
      description,
    })
  }

  createInvoice(
    amount: Amount,
    periodFrom: string,
    periodTo: string,
    options: InvoiceOptions = {},
  ): Promise<EpointResponse> {
    return this.post('/api/1/invoices/create', this.invoice(amount, periodFrom, periodTo, options))
  }

  updateInvoice(
    invoiceId: number,
    amount: Amount,
    periodFrom: string,
    periodTo: string,
    options: InvoiceOptions = {},
  ): Promise<EpointResponse> {
    return this.post('/api/1/invoices/update', {
      id: invoiceId,
      ...this.invoice(amount, periodFrom, periodTo, options),
    })
  }

  private invoice(
    amount: Amount,
    periodFrom: string,
    periodTo: string,
    options: InvoiceOptions,
  ): Payload {
    return {
      sum: money(amount),
      period_from: periodFrom,
      period_to: periodTo,
      name: options.name,
      description: options.description,
      phone: options.phone,
      email: options.email,
      inn: options.tin,
      contract_number: options.contractNumber,
      merchant_order_id: options.merchantOrderId,
      display: flag(options.display, true),
      save_as_template: flag(options.saveAsTemplate),
      status_installment: flag(options.allowInstallment),
    }
  }

  getInvoice(invoiceId: number): Promise<EpointResponse> {
    return this.post('/api/1/invoices/view', { id: invoiceId })
  }

  listInvoices(options: { kind?: string; order?: string } = {}): Promise<EpointResponse> {
    return this.post('/api/1/invoices/list', { type: options.kind, order: options.order })
  }

  sendInvoiceSms(invoiceId: number, phone: string): Promise<EpointResponse> {
    return this.post('/api/1/invoices/send-sms', { id: invoiceId, phone })
  }

  sendInvoiceEmail(invoiceId: number, email: string): Promise<EpointResponse> {
    return this.post('/api/1/invoices/send-email', { id: invoiceId, email })
  }

  createBankTransfer(
    params: {
      orderId: string
      amount: Amount
      description: string
      iban: string
      name: string
      tin: string
      bankCode: string
    },
    options: BankTransferOptions = {},
  ): Promise<EpointResponse> {
    return this.postJson('/api/1/b2b/payment', {
      order_id: params.orderId,
      amount: money(params.amount),
      description: params.description,
      iban: params.iban,
      name: params.name,
      tin: params.tin,
      bank_code: params.bankCode,
      bank_name: options.bankName,
      email: options.email,
      address: options.address,
      additional_info: options.additionalInfo,
      webhook_url: options.webhookUrl,
    })
  }

  async getBankTransfer(orderId: string): Promise<EpointResponse> {
    return parse(...(await this.request('GET', `/api/1/b2b/payment/${orderId}`)))
  }

  async heartbeat(): Promise<EpointResponse> {
    return parse(...(await this.request('GET', '/api/heartbeat')))
  }

  verifyCallback(data: string, signature: string): Promise<EpointCallback> {
    return verifyCallback(this.privateKey, data, signature)
  }
}
