import { beforeAll, describe, expect, it } from 'vitest'
import { EpointClient, GatewayError } from '../src'

const SANDBOX_URL = process.env.EPOINT_BASE_URL ?? 'http://localhost:8181'
const PUBLIC_KEY = 'i000000001'
const PRIVATE_KEY = 'sandbox_private_key_0000000001'
const PARTNER_KEY = 'i000000002'

const client = new EpointClient({
  publicKey: PUBLIC_KEY,
  privateKey: PRIVATE_KEY,
  baseUrl: SANDBOX_URL,
  language: 'en',
})

let available = false

function orderId(): string {
  return `js-${crypto.randomUUID().slice(0, 12)}`
}

async function pay(redirectUrl: string, card = '4111111111111111'): Promise<void> {
  const token = redirectUrl.replace(/\/+$/, '').split('/').pop()?.split('?')[0] ?? ''
  await fetch(`${SANDBOX_URL}/checkout/${token}`, {
    method: 'POST',
    body: new URLSearchParams({
      card_number: card,
      card_holder: 'TESTER',
      month: '12',
      year: '30',
    }),
  })
}

async function grantAll(): Promise<void> {
  await fetch(`${SANDBOX_URL}/_sandbox/merchants/${PUBLIC_KEY}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amex_enabled: true,
      token_payments_enabled: true,
      installments_enabled: true,
      wallets_enabled: true,
      b2b_enabled: true,
    }),
  })
}

beforeAll(async () => {
  try {
    const response = await fetch(`${SANDBOX_URL}/api/heartbeat`)
    available = response.ok
  } catch {
    available = false
  }
})

describe('sandbox', () => {
  it('reaches the heartbeat', async ({ skip }) => {
    if (!available) skip()
    expect((await client.heartbeat()).get('status')).toBe('ok')
  })

  it('completes a payment end to end', async ({ skip }) => {
    if (!available) skip()
    const created = await client.createPayment(25.5, orderId(), { description: 'Kilim' })
    expect(created.ok).toBe(true)
    expect(created.redirectUrl).toBeTruthy()

    await pay(created.redirectUrl!)
    const status = await client.getStatus(created.transaction!)
    expect(status.status).toBe('success')
    expect(status.get('code')).toBe('000')
    expect(status.get('card_mask')).toBe('411111******1111')
  })

  it('reports the bank code for a declined card', async ({ skip }) => {
    if (!available) skip()
    const created = await client.createPayment(10, orderId())
    await pay(created.redirectUrl!, '4000000000000116')
    const status = await client.getStatus(created.transaction!)
    expect(status.status).toBe('failed')
    expect(status.get('code')).toBe('116')
  })

  it('returns the customer to the redirect urls of a card registration', async ({ skip }) => {
    if (!available) skip()
    const urls = {
      successRedirectUrl: 'https://shop.test/card-ok',
      errorRedirectUrl: 'https://shop.test/card-fail',
    }
    const approved = await client.registerCard({ description: 'redirect check', ...urls })
    const declined = await client.registerCard({ description: 'redirect check', ...urls })

    const submit = (redirectUrl: string, card: string) => {
      const token = redirectUrl.replace(/\/+$/, '').split('/').pop()?.split('?')[0] ?? ''
      return fetch(`${SANDBOX_URL}/checkout/${token}`, {
        method: 'POST',
        body: new URLSearchParams({
          card_number: card,
          card_holder: 'TESTER',
          month: '12',
          year: '30',
        }),
        redirect: 'manual',
      })
    }
    const ok = await submit(approved.redirectUrl!, '4111111111111111')
    const failed = await submit(declined.redirectUrl!, '4000000000000116')

    expect(ok.status).toBe(303)
    expect(ok.headers.get('location')).toBe('https://shop.test/card-ok')
    expect(failed.status).toBe(303)
    expect(failed.headers.get('location')).toBe('https://shop.test/card-fail')
    const cardId = approved.get<string>('card_id')!
    expect((await client.getCardStatus(cardId)).get('status')).toBe('active')
  })

  it('charges a saved card', async ({ skip }) => {
    if (!available) skip()
    const registration = await client.registerCard({ description: 'repeat' })
    expect(registration.get('card_id')).toBeTruthy()
    await pay(registration.redirectUrl!)

    const cardId = registration.get<string>('card_id')!
    expect((await client.getCardStatus(cardId)).get('status')).toBe('active')

    const charge = await client.chargeSavedCard(cardId, 15, orderId())
    expect(charge.get('bank_response')).toBe('000')
  })

  it('reverses a payment', async ({ skip }) => {
    if (!available) skip()
    const created = await client.createPayment(40, orderId())
    await pay(created.redirectUrl!)
    expect((await client.reverse(created.transaction!)).ok).toBe(true)
  })

  it('splits a payment with the partner', async ({ skip }) => {
    if (!available) skip()
    const created = await client.createSplitPayment(100, orderId(), PARTNER_KEY, 30)
    expect(created.ok).toBe(true)
    await pay(created.redirectUrl!)
    expect((await client.getStatus(created.transaction!)).status).toBe('success')
  })

  it('refuses an ungranted feature', async ({ skip }) => {
    if (!available) skip()
    await fetch(`${SANDBOX_URL}/_sandbox/merchants/${PUBLIC_KEY}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wallets_enabled: false }),
    })
    await expect(client.payWithWallet('wallet_epul', 10, orderId())).rejects.toThrow(GatewayError)
  })

  it('lists wallets and installment plans', async ({ skip }) => {
    if (!available) skip()
    await grantAll()

    const wallets = await client.listWallets()
    expect(Object.keys(wallets).length).toBeGreaterThan(0)

    const plans = await client.getInstallmentPlans(orderId(), { amount: 200 })
    expect(plans.length).toBeGreaterThan(0)
    expect(plans[0]).toHaveProperty('installment_card_id')
  })

  it('returns an embeddable widget url', async ({ skip }) => {
    if (!available) skip()
    await grantAll()
    const widget = await client.createWidget(50, orderId(), 'wallet')
    expect(widget.get<string>('widget_url')).toContain('widget=1')
  })

  it('runs the invoice lifecycle', async ({ skip }) => {
    if (!available) skip()
    const created = await client.createInvoice(49.9, '2026-01-01', '2026-12-31', {
      name: 'Leyla',
      description: 'deposit',
      phone: '+994501234567',
      email: 'leyla@example.com',
    })
    const invoiceId = created.get<number>('id')!
    expect((await client.getInvoice(invoiceId)).ok).toBe(true)
    expect((await client.sendInvoiceSms(invoiceId, '+994501234567')).ok).toBe(true)
    expect((await client.sendInvoiceEmail(invoiceId, 'leyla@example.com')).ok).toBe(true)
  })

  it('sends and reads a bank transfer', async ({ skip }) => {
    if (!available) skip()
    await grantAll()
    const id = orderId()
    const created = await client.createBankTransfer({
      orderId: id,
      amount: 1250,
      description: 'July fees',
      iban: 'AZ21NABZ00000000137010001944',
      name: 'Logistika MMC',
      tin: '1234567892',
      bankCode: '505141',
    })
    expect(created.ok).toBe(true)
    expect((await client.getBankTransfer(id)).get('order_id')).toBe(id)
  })

  it('reads back a payment that ended in status error', async ({ skip }) => {
    if (!available) skip()
    const created = await client.createPayment(10, orderId())
    await pay(created.redirectUrl!, '4000000000009998')
    const status = await client.getStatus(created.transaction!)
    expect(status.status).toBe('error')
    expect(status.ok).toBe(false)
    expect(status.transaction).toBe(created.transaction)
    expect(status.message).toBe('An error occurred during payment')
    expect(status.code).toBe('')
  })

  it('still throws for an unknown transaction', async ({ skip }) => {
    if (!available) skip()
    await expect(client.getStatus('te999999999999')).rejects.toThrow(GatewayError)
  })

  it('reads back server_error and returned', async ({ skip }) => {
    if (!available) skip()
    const timedOut = await client.createPayment(10, orderId())
    await pay(timedOut.redirectUrl!, '4000000000009999')
    const timeout = await client.getStatus(timedOut.transaction!)
    expect(timeout.status).toBe('server_error')
    expect(timeout.ok).toBe(false)

    const settled = await client.createPayment(20, orderId())
    await pay(settled.redirectUrl!)
    await client.reverse(settled.transaction!)
    const returned = await client.getStatus(settled.transaction!)
    expect(returned.status).toBe('returned')
    expect(returned.ok).toBe(false)
    expect(returned.amount).toBe(20)
    expect(returned.cardMask).toBe('411111******1111')
    expect(returned.traceId).toBeTruthy()
  })

  it('splits a token payment with the partner', async ({ skip }) => {
    if (!available) skip()
    await grantAll()
    const created = await client.createTokenSplitPayment(100, orderId(), PARTNER_KEY, 30)
    expect(created.ok).toBe(true)
    expect(created.redirectUrl).toBeTruthy()
    expect(created.transaction).toBeTruthy()
    await pay(created.redirectUrl!)
    expect((await client.getStatus(created.transaction!)).status).toBe('success')

    await expect(client.createTokenSplitPayment(100, orderId(), 'i999999999', 30)).rejects.toThrow(
      GatewayError,
    )
  })

  it('posts the checkout form to the hosted card page', async ({ skip }) => {
    if (!available) skip()
    const id = orderId()
    const form = await client.checkoutForm(35, id, { description: 'Form', isInstallment: false })
    const response = await fetch(form.url, {
      method: 'POST',
      body: new URLSearchParams({ data: form.data, signature: form.signature }),
      redirect: 'manual',
    })
    expect(response.status).toBe(303)
    const location = response.headers.get('location') ?? ''
    expect(location).toContain('/checkout/')

    await pay(location)
    const listed = await fetch(
      `${SANDBOX_URL}/_sandbox/transactions?merchant=${PUBLIC_KEY}&limit=200`,
    )
    const transactions = (await listed.json()) as Array<{ order_id: string; transaction: string }>
    const transaction = transactions.find((row) => row.order_id === id)?.transaction
    expect(transaction).toBeTruthy()
    const status = await client.getStatus(transaction!)
    expect(status.status).toBe('success')
    expect(status.amount).toBe(35)
  })

  it('updates the invoice fields that view returns', async ({ skip }) => {
    if (!available) skip()
    const created = await client.createInvoice(10, '2026-01-01', '2026-12-31', { name: 'Leyla' })
    const invoiceId = created.get<number>('id')!
    await client.updateInvoice(invoiceId, 12, '2026-01-01', '2026-12-31', {
      tin: '1234567892',
      contractNumber: 'C-2026-1',
      merchantOrderId: 'M-1',
    })
    const invoice = (await client.getInvoice(invoiceId)).get<Record<string, unknown>>('invoice')!
    expect(invoice.inn).toBe('1234567892')
    expect(invoice.contract_number).toBe('C-2026-1')
    expect(invoice.merchant_order_id).toBe('M-1')
  })

  it('accepts the new optional parameters', async ({ skip }) => {
    if (!available) skip()
    await grantAll()
    expect((await client.createPayment(10, orderId(), { isInstallment: true })).ok).toBe(true)
    expect((await client.createPaymentRequest(10, orderId(), { isInstallment: false })).ok).toBe(
      true,
    )
    const plans = await client.getInstallmentPlans(orderId(), {
      amount: 200,
      description: 'Sofa',
      otherAttr: { sku: 'S1' },
    })
    expect(plans.length).toBeGreaterThan(0)
    const transfer = await client.createBankTransfer(
      {
        orderId: orderId(),
        amount: 10,
        description: 'Fees',
        iban: 'AZ21NABZ00000000137010001944',
        name: 'Logistika MMC',
        tin: '1234567892',
        bankCode: '505141',
      },
      { bulkDescription: 'July' },
    )
    expect(transfer.ok).toBe(true)
  })

  it('refuses a request missing a documented-required field', async ({ skip }) => {
    if (!available) skip()
    await expect(client.createPayment(10, '')).rejects.toThrow(GatewayError)
  })
})
