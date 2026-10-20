import { describe, expect, it } from 'vitest'
import { SignatureError, verifyCallback } from '../src'
import { decodeData, encodePayload, matches, sign } from '../src/signing'

const PRIVATE_KEY = 'd3hjsl38sd8kdfhbcea0be04eafde9e8e2bad2fb092d'

async function referenceSignature(privateKey: string, data: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${privateKey}${data}${privateKey}`)
  const digest = await crypto.subtle.digest('SHA-1', bytes)
  let binary = ''
  for (const byte of new Uint8Array(digest)) binary += String.fromCharCode(byte)
  return btoa(binary)
}

describe('signing', () => {
  it('matches the documented formula', async () => {
    const data = encodePayload({ public_key: 'i000000001', amount: '30.75' })
    expect(await sign(PRIVATE_KEY, data)).toBe(await referenceSignature(PRIVATE_KEY, data))
  })

  it('uses the raw digest, not the hex string', async () => {
    const data = encodePayload({ amount: '1.00' })
    const hex = Array.from(
      new Uint8Array(
        await crypto.subtle.digest(
          'SHA-1',
          new TextEncoder().encode(`${PRIVATE_KEY}${data}${PRIVATE_KEY}`),
        ),
      ),
      (b) => b.toString(16).padStart(2, '0'),
    ).join('')
    expect(await sign(PRIVATE_KEY, data)).not.toBe(btoa(hex))
  })

  it('accepts a correct pair and rejects a wrong one', async () => {
    const data = encodePayload({ amount: '5.00' })
    expect(await matches(PRIVATE_KEY, data, await sign(PRIVATE_KEY, data))).toBe(true)
    expect(await matches(PRIVATE_KEY, data, 'wrong')).toBe(false)
  })

  it('round trips a payload', () => {
    const payload = { order_id: 'x', status: 'success' }
    expect(decodeData(encodePayload(payload))).toEqual(payload)
  })

  it('rejects garbage data', () => {
    expect(() => decodeData('not base64 json')).toThrow(SignatureError)
  })
})

describe('verifyCallback', () => {
  it('returns the decoded payload for a valid pair', async () => {
    const payload = {
      order_id: 'order-1',
      status: 'success',
      code: '000',
      transaction: 'te0000000001',
      amount: 30.75,
    }
    const data = encodePayload(payload)
    const callback = await verifyCallback(PRIVATE_KEY, data, await sign(PRIVATE_KEY, data))

    expect(callback.ok).toBe(true)
    expect(callback.orderId).toBe('order-1')
    expect(callback.transaction).toBe('te0000000001')
    expect(callback.amount).toBe(30.75)
    expect(callback.bankResponse).toBeNull()
    expect(callback.traceId).toBeNull()
    expect(callback.cardId).toBeNull()
  })

  it('reads bank_response, trace_id and card_id from a callback', async () => {
    const data = encodePayload({
      order_id: 'order-2',
      status: 'success',
      transaction: 'te0000000002',
      amount: '12.40',
      bank_response: '000',
      trace_id: 'tr-1',
      card_id: 'ce0000000001',
    })
    const callback = await verifyCallback(PRIVATE_KEY, data, await sign(PRIVATE_KEY, data))

    expect(callback.bankResponse).toBe('000')
    expect(callback.traceId).toBe('tr-1')
    expect(callback.cardId).toBe('ce0000000001')
    expect(callback.amount).toBe(12.4)
  })

  it('rejects a tampered payload', async () => {
    const data = encodePayload({ order_id: 'order-1', amount: 1 })
    const good = await sign(PRIVATE_KEY, data)
    const tampered = encodePayload({ order_id: 'order-1', amount: 9999 })

    await expect(verifyCallback(PRIVATE_KEY, tampered, good)).rejects.toThrow(SignatureError)
  })
})
