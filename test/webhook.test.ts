import { describe, expect, it } from 'vitest'
import { EpointError, parseB2BWebhook } from '../src'

describe('parseB2BWebhook', () => {
  it('reads the documented fields from a JSON body', () => {
    const hook = parseB2BWebhook(
      JSON.stringify({
        order_id: 'b1',
        status: 'success',
        amount: 1250.5,
        payee_iban: 'AZ21NABZ00000000137010001944',
        payee_name: 'Logistika MMC',
        error_message: null,
        extra: 'ignored',
      }),
    )
    expect(hook).toMatchObject({
      orderId: 'b1',
      status: 'success',
      amount: 1250.5,
      payeeIban: 'AZ21NABZ00000000137010001944',
      payeeName: 'Logistika MMC',
      errorMessage: null,
      ok: true,
    })
    expect(hook).not.toHaveProperty('extra')
    expect(hook.raw.extra).toBe('ignored')
  })

  it('reads a failed transfer with a string amount', () => {
    const hook = parseB2BWebhook({
      order_id: 'b2',
      status: 'failed',
      amount: '99.90',
      payee_iban: 'AZ00',
      payee_name: 'X',
      error_message: 'Account closed',
    })
    expect(hook.ok).toBe(false)
    expect(hook.amount).toBe(99.9)
    expect(hook.errorMessage).toBe('Account closed')
  })

  it('keeps an unknown status as a string', () => {
    const hook = parseB2BWebhook({ order_id: 'b3', status: 'on_hold' })
    expect(hook.status).toBe('on_hold')
    expect(hook.ok).toBe(false)
    expect(hook.amount).toBe(0)
  })

  it('rejects a body that is not a JSON object', () => {
    expect(() => parseB2BWebhook('not json')).toThrow(EpointError)
    expect(() => parseB2BWebhook('[1]')).toThrow(EpointError)
  })
})
