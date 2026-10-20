import { B2BStatus, SETTLED_STATUSES } from './enums'

const OK_STATUSES: ReadonlySet<string> = new Set([...SETTLED_STATUSES, B2BStatus.SUCCESS, 'ok'])

function asString(value: unknown): string | undefined {
  return value === undefined || value === null ? undefined : String(value)
}

function orNull(value: unknown): string | null {
  return value === undefined || value === null ? null : String(value)
}

export function asAmount(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value !== 'string' || value.trim() === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

export class EpointResponse {
  constructor(readonly raw: Record<string, unknown>) {}

  get status(): string | undefined {
    return asString(this.raw.status)
  }

  get ok(): boolean {
    return OK_STATUSES.has(String(this.raw.status))
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

  get traceId(): string | undefined {
    return asString(this.raw.trace_id)
  }

  get code(): string | undefined {
    return asString(this.raw.code)
  }

  get bankTransaction(): string | undefined {
    return asString(this.raw.bank_transaction)
  }

  get bankResponse(): string | undefined {
    return asString(this.raw.bank_response)
  }

  get operationCode(): string | undefined {
    return asString(this.raw.operation_code)
  }

  get rrn(): string | undefined {
    return asString(this.raw.rrn)
  }

  get cardName(): string | undefined {
    return asString(this.raw.card_name)
  }

  get cardMask(): string | undefined {
    return asString(this.raw.card_mask)
  }

  get amount(): number | undefined {
    return asAmount(this.raw.amount)
  }

  get cardId(): string | undefined {
    return asString(this.raw.card_id)
  }

  get orderId(): string | undefined {
    return asString(this.raw.order_id)
  }

  get widgetUrl(): string | undefined {
    return asString(this.raw.widget_url)
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
  bankResponse: string | null
  traceId: string | null
  cardId: string | null
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
    bankResponse: orNull(raw.bank_response),
    traceId: orNull(raw.trace_id),
    cardId: orNull(raw.card_id),
    amount: raw.amount == null ? 0 : Number(raw.amount),
    otherAttr: raw.other_attr,
    ok: SETTLED_STATUSES.has(status),
    raw,
  }
}
