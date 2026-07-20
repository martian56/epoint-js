export class EpointError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EpointError'
  }
}

export class SignatureError extends EpointError {
  constructor(message: string) {
    super(message)
    this.name = 'SignatureError'
  }
}

export class TransportError extends EpointError {
  readonly statusCode?: number

  constructor(message: string, statusCode?: number) {
    super(message)
    this.name = 'TransportError'
    this.statusCode = statusCode
  }
}

export class GatewayError extends EpointError {
  readonly code?: string
  readonly status?: string
  readonly payload: Record<string, unknown>

  constructor(
    message: string,
    options: { code?: string; status?: string; payload?: Record<string, unknown> } = {},
  ) {
    super(message)
    this.name = 'GatewayError'
    this.code = options.code
    this.status = options.status
    this.payload = options.payload ?? {}
  }
}
