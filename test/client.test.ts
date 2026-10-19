import { describe, expect, it, vi } from 'vitest'
import { EpointClient, TransportError } from '../src'
import { matches } from '../src/signing'

const PUBLIC_KEY = 'i000000001'
const PRIVATE_KEY = 'sandbox_private_key_0000000001'

interface Captured {
  url: string
  init: RequestInit
  form: URLSearchParams
  payload: Record<string, unknown>
}

function mockFetch(body: unknown, status = 200) {
  const calls: Captured[] = []
  const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
    const form = new URLSearchParams(init.body as string)
    const data = form.get('data') ?? ''
    calls.push({
      url,
      init,
      form,
      payload: data
        ? JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(data), (c) => c.charCodeAt(0))))
        : {},
    })
    return new Response(JSON.stringify(body), { status })
  })
  return { fetchImpl: fetchImpl as unknown as typeof fetch, calls }
}

function clientWith(body: unknown, status = 200) {
  const { fetchImpl, calls } = mockFetch(body, status)
  const client = new EpointClient({
    publicKey: PUBLIC_KEY,
    privateKey: PRIVATE_KEY,
    baseUrl: 'https://epoint.test',
    fetch: fetchImpl,
  })
  return { client, calls }
}

describe('EpointClient', () => {
  it('sends the redirect urls given to a card registration', async () => {
    const { client, calls } = clientWith({ status: 'success', card_id: 'ce1' })
    await client.registerCard({
      successRedirectUrl: 'https://shop.test/ok',
      errorRedirectUrl: 'https://shop.test/fail',
    })

    expect(calls[0]!.payload.success_redirect_url).toBe('https://shop.test/ok')
    expect(calls[0]!.payload.error_redirect_url).toBe('https://shop.test/fail')
    expect(calls[0]!.payload.refund).toBe(0)
  })

  it('falls back to the client redirect urls for a card registration', async () => {
    const { fetchImpl, calls } = mockFetch({ status: 'success', card_id: 'ce1' })
    const client = new EpointClient({
      publicKey: PUBLIC_KEY,
      privateKey: PRIVATE_KEY,
      baseUrl: 'https://epoint.test',
      successRedirectUrl: 'https://shop.test/default-ok',
      errorRedirectUrl: 'https://shop.test/default-fail',
      fetch: fetchImpl,
    })
    await client.registerCard()
    await client.registerCard({ successRedirectUrl: 'https://shop.test/ok' })

    expect(calls[0]!.payload.success_redirect_url).toBe('https://shop.test/default-ok')
    expect(calls[0]!.payload.error_redirect_url).toBe('https://shop.test/default-fail')
    expect(calls[1]!.payload.success_redirect_url).toBe('https://shop.test/ok')
    expect(calls[1]!.payload.error_redirect_url).toBe('https://shop.test/default-fail')

    const bare = clientWith({ status: 'success', card_id: 'ce1' })
    await bare.client.registerCard()
    expect(bare.calls[0]!.payload).not.toHaveProperty('success_redirect_url')
    expect(bare.calls[0]!.payload).not.toHaveProperty('error_redirect_url')
  })

  it('signs the request and parses a success response', async () => {
    const { client, calls } = clientWith({ status: 'success', transaction: 'te1' })
    const result = await client.createPayment(30.75, 'order-1')

    expect(result.ok).toBe(true)
    expect(result.transaction).toBe('te1')

    const sent = calls[0]!
    expect(sent.payload.public_key).toBe(PUBLIC_KEY)
    expect(sent.payload.amount).toBe('30.75')
    expect(sent.payload.order_id).toBe('order-1')
    expect(
      await matches(PRIVATE_KEY, sent.form.get('data') ?? '', sent.form.get('signature') ?? ''),
    ).toBe(true)
  })

  it('formats amounts to two decimal places', async () => {
    const { client, calls } = clientWith({ status: 'success' })
    await client.createPayment(5, 'o')
    expect(calls[0]!.payload.amount).toBe('5.00')
  })

  it('drops null and undefined fields before signing', async () => {
    const { client, calls } = clientWith({ status: 'success' })
    await client.createPayment(1, 'o')
    expect('description' in calls[0]!.payload).toBe(false)
    expect('other_attr' in calls[0]!.payload).toBe(false)
  })

  it('applies the default language and lets a call override it', async () => {
    const { client, calls } = clientWith({ status: 'success' })
    await client.createPayment(1, 'a')
    await client.createPayment(1, 'b', { language: 'en' })
    expect(calls[0]!.payload.language).toBe('az')
    expect(calls[1]!.payload.language).toBe('en')
  })

  it('throws GatewayError on an error status', async () => {
    const { client } = clientWith({ status: 'error', code: '116', message: 'no funds' })
    await expect(client.getStatus('te1')).rejects.toMatchObject({
      name: 'GatewayError',
      code: '116',
    })
  })

  it('returns a failed status rather than throwing', async () => {
    const { client } = clientWith({ status: 'failed', code: '116' })
    const result = await client.getStatus('te1')
    expect(result.ok).toBe(false)
    expect(result.status).toBe('failed')
    expect(result.get('code')).toBe('116')
  })

  it('throws TransportError on a non-JSON body', async () => {
    const { fetchImpl } = {
      fetchImpl: (async () => new Response('<html>down</html>')) as unknown as typeof fetch,
    }
    const client = new EpointClient({
      publicKey: PUBLIC_KEY,
      privateKey: PRIVATE_KEY,
      baseUrl: 'https://epoint.test',
      fetch: fetchImpl,
    })
    await expect(client.getStatus('te1')).rejects.toThrow(TransportError)
  })

  it('throws TransportError on an HTTP 500', async () => {
    const { client } = clientWith({ detail: 'boom' }, 500)
    await expect(client.getStatus('te1')).rejects.toMatchObject({
      name: 'TransportError',
      statusCode: 500,
    })
  })

  it('sends B2B as a JSON body', async () => {
    const requests: Array<{ contentType: string; body: Record<string, unknown> }> = []
    const wrapped = (async (_url: string, init: RequestInit) => {
      requests.push({
        contentType: (init.headers as Record<string, string>)['Content-Type'] ?? '',
        body: JSON.parse(init.body as string),
      })
      return new Response(JSON.stringify({ status: 'success', order_id: 'b1' }))
    }) as unknown as typeof fetch

    const client = new EpointClient({
      publicKey: PUBLIC_KEY,
      privateKey: PRIVATE_KEY,
      baseUrl: 'https://epoint.test',
      fetch: wrapped,
    })
    await client.createBankTransfer({
      orderId: 'b1',
      amount: 100,
      description: 'fees',
      iban: 'AZ21NABZ00000000137010001944',
      name: 'ACME',
      tin: '1234567892',
      bankCode: '505141',
    })

    expect(requests[0]!.contentType).toContain('application/json')
    expect(requests[0]!.body).toHaveProperty('data')
    expect(requests[0]!.body).toHaveProperty('signature')
  })
})
