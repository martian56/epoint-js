import { EpointError } from './errors'
import { asAmount } from './response'

export interface B2BWebhook {
  orderId: string
  status: string
  amount: number
  payeeIban: string
  payeeName: string
  errorMessage: string | null
  ok: boolean
  raw: Record<string, unknown>
}

export function parseB2BWebhook(body: string | Record<string, unknown>): B2BWebhook {
  let raw: unknown = body
  if (typeof body === 'string') {
    try {
      raw = JSON.parse(body)
    } catch {
      throw new EpointError('B2B webhook body is not valid JSON')
    }
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new EpointError('B2B webhook body is not a JSON object')
  }
  const record = raw as Record<string, unknown>
  const status = String(record.status ?? '')
  return {
    orderId: String(record.order_id ?? ''),
    status,
    amount: asAmount(record.amount) ?? 0,
    payeeIban: String(record.payee_iban ?? ''),
    payeeName: String(record.payee_name ?? ''),
    errorMessage: record.error_message == null ? null : String(record.error_message),
    ok: status === 'success',
    raw: record,
  }
}
