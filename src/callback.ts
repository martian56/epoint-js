import { SignatureError } from './errors'
import { type EpointCallback, toCallback } from './response'
import { decodeData, matches } from './signing'

export async function verifyCallback(
  privateKey: string,
  data: string,
  signature: string,
): Promise<EpointCallback> {
  if (!(await matches(privateKey, data, signature))) {
    throw new SignatureError('callback signature does not match')
  }
  return toCallback(decodeData(data))
}
