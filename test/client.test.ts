import { describe, expect, it, vi } from 'vitest'
import { EpointClient, GatewayError, TransportError } from '../src'
import { EpointResponse } from '../src/response'
import { decodeData, matches } from '../src/signing'

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

  it('resolves get-status for a payment that ended in status error', async () => {
    const { client } = clientWith({
      status: 'error',
      code: '',
      message: 'An error occurred during payment',
      transaction: 'te1',
      amount: 10,
    })
    const result = await client.getStatus('te1')
    expect(result.status).toBe('error')
    expect(result.ok).toBe(false)
    expect(result.transaction).toBe('te1')
    expect(result.message).toBe('An error occurred during payment')
  })

  it('throws on a get-status error envelope with no transaction', async () => {
    const { client } = clientWith({ status: 'error', message: 'Unknown transaction: te9' })
    await expect(client.getStatus('te9')).rejects.toThrow(GatewayError)
    const empty = clientWith({ status: 'error', message: 'x', transaction: '' })
    await expect(empty.client.getStatus('te9')).rejects.toThrow(GatewayError)
  })

  it('throws on a get-status error with a transaction but a non-2xx code', async () => {
    const { client } = clientWith({ status: 'error', message: 'x', transaction: 'te1' }, 403)
    await expect(client.getStatus('te1')).rejects.toThrow(GatewayError)
    const server = clientWith({ detail: 'boom', transaction: 'te1' }, 500)
    await expect(server.client.getStatus('te1')).rejects.toThrow(TransportError)
  })

  it('keeps throwing for status error with a transaction on other endpoints', async () => {
    const { client } = clientWith({ status: 'error', message: 'x', transaction: 'te1' })
    await expect(client.createPayment(1, 'o')).rejects.toThrow(GatewayError)
    await expect(client.reverse('te1')).rejects.toThrow(GatewayError)
  })

  it('treats success, SUCCESS and ok as ok and nothing else', () => {
    for (const status of ['success', 'SUCCESS', 'ok']) {
      expect(new EpointResponse({ status }).ok).toBe(true)
    }
    for (const status of ['error', 'failed', 'server_error', 'returned', 'new', 'FAILED', 'OK']) {
      expect(new EpointResponse({ status }).ok).toBe(false)
    }
    expect(new EpointResponse({}).ok).toBe(false)
  })

  it('reads the heartbeat and a B2B transfer as ok', async () => {
    const heartbeat = clientWith({ status: 'ok', trace_id: 't1' })
    expect((await heartbeat.client.heartbeat()).ok).toBe(true)
    const transfer = clientWith({ status: 'SUCCESS', order_id: 'b1' })
    expect((await transfer.client.getBankTransfer('b1')).ok).toBe(true)
  })

  it('exposes the documented response fields as getters', () => {
    const response = new EpointResponse({
      status: 'success',
      trace_id: 'tr1',
      code: '000',
      bank_transaction: 'BT1',
      bank_response: '000',
      operation_code: '100',
      rrn: '123456789012',
      card_name: 'TESTER',
      card_mask: '411111******1111',
      amount: '25.50',
      card_id: 'ce1',
      order_id: 'o1',
      widget_url: 'https://epoint.test/w?widget=1',
    })
    expect(response.traceId).toBe('tr1')
    expect(response.code).toBe('000')
    expect(response.bankTransaction).toBe('BT1')
    expect(response.bankResponse).toBe('000')
    expect(response.operationCode).toBe('100')
    expect(response.rrn).toBe('123456789012')
    expect(response.cardName).toBe('TESTER')
    expect(response.cardMask).toBe('411111******1111')
    expect(response.amount).toBe(25.5)
    expect(response.cardId).toBe('ce1')
    expect(response.orderId).toBe('o1')
    expect(response.widgetUrl).toBe('https://epoint.test/w?widget=1')
    expect(response.get('trace_id')).toBe('tr1')
    expect(response.raw.amount).toBe('25.50')
  })

  it('reads amount as a number or numeric string and leaves the rest undefined', () => {
    expect(new EpointResponse({ amount: 10 }).amount).toBe(10)
    expect(new EpointResponse({ amount: '7.25' }).amount).toBe(7.25)
    expect(new EpointResponse({ amount: 'abc' }).amount).toBeUndefined()
    expect(new EpointResponse({ amount: '' }).amount).toBeUndefined()
    expect(new EpointResponse({ amount: null }).amount).toBeUndefined()
    const empty = new EpointResponse({})
    expect(empty.amount).toBeUndefined()
    expect(empty.rrn).toBeUndefined()
    expect(empty.traceId).toBeUndefined()
    expect(empty.cardId).toBeUndefined()
  })

  it('posts a token split payment like a split payment', async () => {
    const { fetchImpl, calls } = mockFetch({ status: 'success', transaction: 'te1' })
    const client = new EpointClient({
      publicKey: PUBLIC_KEY,
      privateKey: PRIVATE_KEY,
      baseUrl: 'https://epoint.test',
      successRedirectUrl: 'https://shop.test/ok',
      errorRedirectUrl: 'https://shop.test/fail',
      fetch: fetchImpl,
    })
    await client.createTokenSplitPayment(100, 'o1', 'i000000002', 30, {
      description: 'split',
      errorRedirectUrl: 'https://shop.test/own-fail',
    })
    await client.createSplitPayment(100, 'o1', 'i000000002', 30, {
      description: 'split',
      errorRedirectUrl: 'https://shop.test/own-fail',
    })

    expect(calls[0]!.url).toBe('https://epoint.test/api/1/token/split-payment')
    expect(calls[0]!.payload).toEqual({
      public_key: PUBLIC_KEY,
      amount: '100.00',
      currency: 'AZN',
      language: 'az',
      order_id: 'o1',
      description: 'split',
      success_redirect_url: 'https://shop.test/ok',
      error_redirect_url: 'https://shop.test/own-fail',
      split_user: 'i000000002',
      split_amount: '30.00',
    })
    expect(calls[0]!.payload).toEqual(calls[1]!.payload)
  })

  it('builds a signed checkout form without sending a request', async () => {
    const { client, calls } = clientWith({})
    const form = await client.checkoutForm(30.75, 'o1', {
      description: 'Kilim',
      isInstallment: true,
      successRedirectUrl: 'https://shop.test/ok',
    })

    expect(calls).toHaveLength(0)
    expect(form.url).toBe('https://epoint.test/api/1/checkout')
    expect(await matches(PRIVATE_KEY, form.data, form.signature)).toBe(true)
    expect(decodeData(form.data)).toEqual({
      public_key: PUBLIC_KEY,
      amount: '30.75',
      currency: 'AZN',
      language: 'az',
      order_id: 'o1',
      description: 'Kilim',
      success_redirect_url: 'https://shop.test/ok',
      is_installment: 1,
    })
  })

  it('sends is_installment as 1 or 0 and omits it when not given', async () => {
    const { client, calls } = clientWith({ status: 'success' })
    await client.createPayment(1, 'a', { isInstallment: true })
    await client.createPayment(1, 'b', { isInstallment: false })
    await client.createPayment(1, 'c')
    await client.createPaymentRequest(1, 'd', { isInstallment: true })
    await client.createPaymentRequest(1, 'e')

    expect(calls[0]!.payload.is_installment).toBe(1)
    expect(calls[1]!.payload.is_installment).toBe(0)
    expect(calls[2]!.payload).not.toHaveProperty('is_installment')
    expect(calls[3]!.url).toBe('https://epoint.test/api/1/payment-request')
    expect(calls[3]!.payload.is_installment).toBe(1)
    expect(calls[4]!.payload).not.toHaveProperty('is_installment')

    const form = await client.checkoutForm(1, 'f', { isInstallment: false })
    expect(decodeData(form.data).is_installment).toBe(0)
    const bare = await client.checkoutForm(1, 'g')
    expect(decodeData(bare.data)).not.toHaveProperty('is_installment')
  })

  it('sends description and other_attr with an installment plan query', async () => {
    const { client, calls } = clientWith([])
    await client.getInstallmentPlans('o1', {
      amount: 200,
      description: 'Sofa',
      otherAttr: { sku: 'S1' },
    })
    await client.getInstallmentPlans('o2')

    expect(calls[0]!.payload.description).toBe('Sofa')
    expect(calls[0]!.payload.other_attr).toEqual({ sku: 'S1' })
    expect(calls[1]!.payload).not.toHaveProperty('description')
    expect(calls[1]!.payload).not.toHaveProperty('other_attr')
  })

  it('sends bulk_description with a bank transfer', async () => {
    const bodies: Array<Record<string, unknown>> = []
    const client = new EpointClient({
      publicKey: PUBLIC_KEY,
      privateKey: PRIVATE_KEY,
      baseUrl: 'https://epoint.test',
      fetch: (async (_url: string, init: RequestInit) => {
        const body = JSON.parse(init.body as string) as { data: string }
        bodies.push(decodeData(body.data))
        return new Response(JSON.stringify({ status: 'success' }))
      }) as unknown as typeof fetch,
    })
    const params = {
      orderId: 'b1',
      amount: 100,
      description: 'fees',
      iban: 'AZ21NABZ00000000137010001944',
      name: 'ACME',
      tin: '1234567892',
      bankCode: '505141',
    }
    await client.createBankTransfer(params, { bulkDescription: 'July payroll' })
    await client.createBankTransfer(params)

    expect(bodies[0]!.bulk_description).toBe('July payroll')
    expect(bodies[1]!).not.toHaveProperty('bulk_description')
  })
})
