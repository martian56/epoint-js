import { describe, expect, it } from 'vitest'
import { EpointClient } from '../src'
import { formatMoney } from '../src/money'

describe('formatMoney', () => {
  it('formats numbers and numeric strings to two places', () => {
    expect(formatMoney(30.75)).toBe('30.75')
    expect(formatMoney(5)).toBe('5.00')
    expect(formatMoney('10.5')).toBe('10.50')
    expect(formatMoney('0')).toBe('0.00')
    expect(formatMoney(' 7 ')).toBe('7.00')
    expect(formatMoney('.5')).toBe('0.50')
    expect(formatMoney('3.')).toBe('3.00')
    expect(formatMoney('1e3')).toBe('1000.00')
    expect(formatMoney(1e-7)).toBe('0.00')
  })

  it('keeps float noise out', () => {
    expect(formatMoney(0.1 + 0.2)).toBe('0.30')
    expect(formatMoney(1.1 * 3)).toBe('3.30')
  })

  it('keeps large values exact', () => {
    expect(formatMoney('12345678901234567890.129')).toBe('12345678901234567890.13')
    expect(formatMoney(1e21)).toBe('1000000000000000000000.00')
  })

  it('rounds half to even like Python Decimal', () => {
    expect(formatMoney('2.675')).toBe('2.68')
    expect(formatMoney('2.665')).toBe('2.66')
    expect(formatMoney('2.6651')).toBe('2.67')
    expect(formatMoney('0.005')).toBe('0.00')
    expect(formatMoney('0.015')).toBe('0.02')
    expect(formatMoney('0.0051')).toBe('0.01')
    expect(formatMoney('9.995')).toBe('10.00')
    expect(formatMoney(1.005)).toBe('1.00')
  })

  it('rejects input that is not a number', () => {
    for (const bad of ['abc', '', ' ', '1,5', '1.2.3', 'NaN', 'Infinity', '0x10', '1e']) {
      expect(() => formatMoney(bad)).toThrow(TypeError)
    }
    expect(() => formatMoney(Number.NaN)).toThrow(/finite number or a numeric string/)
    expect(() => formatMoney(Number.POSITIVE_INFINITY)).toThrow(TypeError)
    expect(() => formatMoney(null as unknown as string)).toThrow(TypeError)
  })

  it('refuses a request with a non-numeric amount before sending it', async () => {
    let sent = false
    const client = new EpointClient({
      publicKey: 'i000000001',
      privateKey: 'k',
      fetch: (async () => {
        sent = true
        return new Response('{}')
      }) as unknown as typeof fetch,
    })
    await expect(client.createPayment('ten', 'o')).rejects.toThrow(TypeError)
    expect(sent).toBe(false)
  })
})
