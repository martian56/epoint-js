# @martian56/epoint

TypeScript client for the [epoint.az](https://epoint.az) payment gateway.

Covers all 30 documented endpoints: payments, saved cards, refunds and payouts, split payments,
pre-authorisation, installments, wallets, Apple Pay and Google Pay, invoices, and B2B transfers.
Fully typed, no runtime dependencies, runs anywhere with `fetch` and Web Crypto (Node 20+, Bun,
Deno, browsers, edge runtimes).

```bash
npm install @martian56/epoint
```

## Quick start

```ts
import { EpointClient } from '@martian56/epoint'

const client = new EpointClient({
  publicKey: 'i000000001',
  privateKey: 'your-private-key',
})

const payment = await client.createPayment(30.75, 'order-1', { description: 'Test order' })
console.log(payment.redirectUrl)
```

Send the customer to `payment.redirectUrl`. When they finish, epoint calls your result URL. Verify
it before trusting it:

```ts
import { SignatureError } from '@martian56/epoint'

try {
  const callback = await client.verifyCallback(data, signature)
  if (callback.ok) fulfil(callback.orderId, callback.transaction)
} catch (error) {
  if (error instanceof SignatureError) return res.status(400).end()
  throw error
}
```

## Configuration

```ts
import { Currency, EpointClient, Language } from '@martian56/epoint'

new EpointClient({
  publicKey: 'i000000001',
  privateKey: 'your-private-key',
  baseUrl: 'https://epoint.az',
  language: Language.AZ,
  currency: Currency.AZN,
  successRedirectUrl: 'https://shop.example/thanks',
  errorRedirectUrl: 'https://shop.example/failed',
})
```

Or read from the environment with `EpointClient.fromEnv()`, which uses `EPOINT_PUBLIC_KEY`,
`EPOINT_PRIVATE_KEY`, `EPOINT_BASE_URL`, `EPOINT_LANGUAGE`, `EPOINT_SUCCESS_REDIRECT_URL` and
`EPOINT_FAILED_REDIRECT_URL`. `language` and `currency` are set on the client and can be overridden
per call through the options argument.

## Testing against the sandbox

There is a local sandbox that behaves like the real gateway, so you can build and test without a
merchant account or real money:

```ts
const client = new EpointClient({
  publicKey: 'i000000001',
  privateKey: 'sandbox_private_key_0000000001',
  baseUrl: 'http://localhost:8181',
})
```

See [epoint-sandbox](https://github.com/martian56/epoint-sandbox). Switching to production means
changing `baseUrl` and the keys, nothing else.

## Responses

Most methods resolve to an `EpointResponse`. Known fields are camelCase getters, anything else is
read through `get` or the raw body:

```ts
const status = await client.getStatus('te0000000001')
status.status        // "success"
status.ok            // true
status.redirectUrl   // camelCase getter over redirect_url
status.get('rrn')    // bank reference number
status.raw           // the full response object, snake_case
```

`getInstallmentPlans` resolves to an array and `listWallets` to a record.

## Enums

Every value the API uses has an enum. They come from the sandbox's own definitions, so they match
what production sends. Each is a const object with a matching type, so you get both the values
and the union, and a plain string still works anywhere an enum is accepted.

```ts
import { Currency, EpointClient, Language, Status } from '@martian56/epoint'

const client = EpointClient.fromEnv({ language: Language.EN, currency: Currency.USD })

const status = await client.getStatus(transaction)
if (status.status === Status.SUCCESS) {
  await fulfil(orderId)
}
```

| Enum | Values |
|---|---|
| `Status` | new, success, failed, error, returned, server_error |
| `CardStatus` | new, active, pending, rejected, expired, session_expired |
| `InvoiceStatus` | waiting_for_payment, paid, canceled |
| `B2BStatus` | PENDING, PROCESSING, SUCCESS, FAILED |
| `OperationCode` | 001 card registration, 100 payment, 200 registration with payment |
| `Language` | az, en, ru |
| `Currency` | AZN, USD, EUR, RUB |

Currency is not uniform across the API. Checkout takes all four, but split, pre-auth, refund,
reverse, payout and wallet take AZN and nothing else. `SUPPORTED_CURRENCIES` and `AZN_ONLY` hold
those two sets.

`SETTLED_STATUSES` is what `ok` checks, and `USABLE_CARD_STATUSES` is the set a card has to be in
before you can charge it.

## Saving a card without a payment

`registerCard` saves a card with no charge, for example when the first period is free and later
ones are charged with `chargeSavedCard`. Keep the `card_id` it returns and send the customer to
its `redirectUrl`.

```ts
const registration = await client.registerCard({
  description: 'Card for renewals',
  successRedirectUrl: 'https://shop.example/card/saved',
  errorRedirectUrl: 'https://shop.example/card/failed',
})
storeCard(registration.get<string>('card_id'))
```

The customer comes back to `successRedirectUrl` or `errorRedirectUrl`, or to the client's own
defaults when neither is given. A card can be charged once `getCardStatus` reports it `active`.

## Methods

| Group | Methods |
|---|---|
| Checkout | `createPayment`, `createPaymentRequest`, `createAmexPayment`, `changePaymentSum` |
| Status | `getStatus`, `getCardStatus`, `getBankTransfer` |
| Split | `createSplitPayment`, `splitChargeSavedCard` |
| Pre-auth | `reserve`, `capture` |
| Saved cards | `registerCard`, `registerCardAndPay`, `chargeSavedCard` |
| Money back | `refund`, `reverse` |
| Installments | `getInstallmentPlans`, `payByInstallment` |
| Wallets | `listWallets`, `payWithWallet` |
| Apple Pay, Google Pay | `createWidget` |
| Invoices | `createInvoice`, `updateInvoice`, `getInvoice`, `listInvoices`, `sendInvoiceSms`, `sendInvoiceEmail` |
| B2B | `createBankTransfer`, `getBankTransfer` |
| Health | `heartbeat` |

## Errors

| Class | Thrown when |
|---|---|
| `GatewayError` | epoint returned `status: error`. Carries `code`, `status`, `payload`. |
| `TransportError` | Network failure, or a non-JSON or `4xx`/`5xx` response |
| `SignatureError` | A callback's signature did not match, or its data would not decode |

All three extend `EpointError`. A declined payment is not an error: `getStatus` resolves normally
with `status: 'failed'`, which you read through `.ok`.

## Signatures

Epoint signs with `base64(sha1_raw(private_key + data + private_key))`. The client builds and
verifies these with Web Crypto. The digest is the raw 20 bytes, not the hex string, which is where
most hand-rolled integrations go wrong.

## Not affiliated with Epoint

An independent client for developers integrating with epoint.az.

MIT licensed.
