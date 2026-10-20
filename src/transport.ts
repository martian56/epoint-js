import { Status } from './enums'
import { GatewayError, TransportError } from './errors'
import { EpointResponse } from './response'
import { encodePayload, sign } from './signing'

export type Payload = Record<string, unknown>

function pruned(payload: Payload): Payload {
  const result: Payload = {}
  for (const [key, value] of Object.entries(payload)) {
    if (value !== undefined && value !== null) result[key] = value
  }
  return result
}

export async function buildBody(
  publicKey: string,
  privateKey: string,
  payload: Payload,
): Promise<{ data: string; signature: string }> {
  const data = encodePayload({ public_key: publicKey, ...pruned(payload) })
  return { data, signature: await sign(privateKey, data) }
}

function isPaymentState(statusCode: number, record: Payload): boolean {
  return (
    statusCode >= 200 &&
    statusCode < 300 &&
    record.status === Status.ERROR &&
    typeof record.transaction === 'string' &&
    record.transaction !== ''
  )
}

export function parse(
  statusCode: number,
  body: unknown,
  options: { paymentState?: boolean } = {},
): EpointResponse {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new TransportError(`unexpected response body: ${JSON.stringify(body)}`, statusCode)
  }

  const record = body as Payload
  if (options.paymentState && isPaymentState(statusCode, record)) {
    return new EpointResponse(record)
  }

  if (record.status === Status.ERROR) {
    throw new GatewayError(String(record.message ?? 'request refused'), {
      code: record.code == null ? undefined : String(record.code),
      status: String(record.status),
      payload: record,
    })
  }

  if (statusCode >= 400) {
    const detail = record.detail ?? record.message ?? `HTTP ${statusCode}`
    throw new TransportError(String(detail), statusCode)
  }

  return new EpointResponse(record)
}
