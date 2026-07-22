import { describe, expect, it } from 'vitest'
import { Currency, EpointResponse, Language, OperationCode, Status } from '../src/index'

describe('enums', () => {
  it('are plain strings on the wire', () => {
    expect(JSON.stringify({ language: Language.AZ, currency: Currency.AZN })).toBe(
      '{"language":"az","currency":"AZN"}',
    )
    expect(OperationCode.PAYMENT).toBe('100')
    expect(Status.SERVER_ERROR).toBe('server_error')
  })

  it('still reads a raw status string as ok', () => {
    expect(new EpointResponse({ status: 'success' }).ok).toBe(true)
    expect(new EpointResponse({ status: 'failed' }).ok).toBe(false)
  })
})
