import { SETTLED_STATUSES } from './enums'

function asString(value: unknown): string | undefined {
  return value === undefined || value === null ? undefined : String(value)
}

export class EpointResponse {
  constructor(readonly raw: Record<string, unknown>) {}

  get status(): string | undefined {
    return asString(this.raw.status)
  }

  get ok(): boolean {
    return SETTLED_STATUSES.has(String(this.raw.status))
  }

  get transaction(): string | undefined {
    return asString(this.raw.transaction)
  }

  get redirectUrl(): string | undefined {
    return asString(this.raw.redirect_url)
  }

  get message(): string | undefined {
    return asString(this.raw.message)
  }

  get<T = unknown>(key: string): T | undefined {
    return this.raw[key] as T | undefined
  }
}

export interface EpointCallback {
  orderId: string
  status: string
  code: string
  message: string
  transaction: string
  bankTransaction: string
  operationCode: string
  rrn: string | null
  cardMask: string | null
  cardName: string | null
  amount: number
  otherAttr: unknown
  ok: boolean
  raw: Record<string, unknown>
}

export function toCallback(raw: Record<string, unknown>): EpointCallback {
  const status = String(raw.status ?? '')
  return {
    orderId: String(raw.order_id ?? ''),
    status,
    code: String(raw.code ?? ''),
    message: String(raw.message ?? ''),
    transaction: String(raw.transaction ?? ''),
    bankTransaction: String(raw.bank_transaction ?? ''),
    operationCode: String(raw.operation_code ?? ''),
    rrn: (raw.rrn as string | null) ?? null,
    cardMask: (raw.card_mask as string | null) ?? null,
    cardName: (raw.card_name as string | null) ?? null,
    amount: raw.amount == null ? 0 : Number(raw.amount),
    otherAttr: raw.other_attr,
    ok: SETTLED_STATUSES.has(status),
    raw,
  }
}
