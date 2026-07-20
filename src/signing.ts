import { SignatureError } from './errors'

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export function encodePayload(payload: Record<string, unknown>): string {
  return bytesToBase64(new TextEncoder().encode(JSON.stringify(payload)))
}

export async function sign(privateKey: string, data: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${privateKey}${data}${privateKey}`)
  const digest = await crypto.subtle.digest('SHA-1', bytes)
  return bytesToBase64(new Uint8Array(digest))
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let i = 0; i < a.length; i += 1) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return mismatch === 0
}

export async function matches(
  privateKey: string,
  data: string,
  signature: string,
): Promise<boolean> {
  return timingSafeEqual(await sign(privateKey, data), signature)
}

export function decodeData(data: string): Record<string, unknown> {
  let parsed: unknown
  try {
    parsed = JSON.parse(new TextDecoder().decode(base64ToBytes(data)))
  } catch {
    throw new SignatureError('data is not valid base64 encoded JSON')
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new SignatureError('data did not decode to an object')
  }
  return parsed as Record<string, unknown>
}
