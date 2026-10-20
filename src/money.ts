import type { Amount } from './types'

const DECIMAL = /^([+-])?(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/

function invalid(value: unknown): TypeError {
  return new TypeError(`amount must be a finite number or a numeric string, got ${String(value)}`)
}

export function formatMoney(value: Amount): string {
  let text: string
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw invalid(value)
    text = String(value)
  } else if (typeof value === 'string') {
    text = value.trim()
  } else {
    throw invalid(value)
  }

  const match = DECIMAL.exec(text)
  if (!match) throw invalid(value)

  const sign = match[1] === '-' ? '-' : ''
  const whole = match[2] ?? ''
  const fraction = match[3] ?? match[4] ?? ''
  const digits = `${whole}${fraction}` || '0'
  const exponent = Number(match[5] ?? '0') - fraction.length
  if (!Number.isSafeInteger(exponent)) throw invalid(value)
  const shift = exponent + 2

  let cents: bigint
  if (shift >= 0) {
    cents = BigInt(digits + '0'.repeat(shift))
  } else {
    const cut = digits.length + shift
    const kept = cut > 0 ? digits.slice(0, cut) : '0'
    const dropped = cut >= 0 ? digits.slice(cut) : '0'.repeat(-cut) + digits
    cents = BigInt(kept)
    const first = dropped.charCodeAt(0) - 48
    const rest = /[1-9]/.test(dropped.slice(1))
    if (first > 5 || (first === 5 && (rest || cents % 2n === 1n))) cents += 1n
  }

  const padded = cents.toString().padStart(3, '0')
  return `${sign}${padded.slice(0, -2)}.${padded.slice(-2)}`
}
