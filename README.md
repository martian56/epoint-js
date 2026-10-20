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
status.rrn           // bank reference number
status.amount        // 30.75, a number even when epoint sends a string
status.get('other')  // any field without a getter
status.raw           // the full response object, snake_case
```

The getters are `status`, `ok`, `transaction`, `redirectUrl`, `message`, `traceId`, `code`,
`bankTransaction`, `bankResponse`, `operationCode`, `rrn`, `cardName`, `cardMask`, `amount`,
`cardId`, `orderId` and `widgetUrl`. Each is `undefined` when the field is missing, and `amount`
is also `undefined` when the value is not numeric.

`ok` is true for `success`, for the B2B `SUCCESS` and for the heartbeat's `ok`. It is false for
every other status, including `error`, `failed`, `server_error` and `returned`.

`getInstallmentPlans` resolves to an array and `listWallets` to a record.

### Payment status error

`getStatus` resolves normally for a payment that ended in status `error`, which the docs list as
a payment status. The exact rule: on `getStatus` only, a `2xx` response whose `status` is `error`
and whose `transaction` field is a non-empty string is a payment state and resolves to an
`EpointResponse`. An error answer without a transaction, or any `4xx`/`5xx` answer, still throws.
Every other method throws `GatewayError` on `status: error` as before.

```ts
const status = await client.getStatus(transaction)
if (status.status === Status.ERROR) {
  showRetry(status.message)
}
```

## Amounts

Amounts are numbers or numeric strings and are sent with two decimal places, computed exactly from
the decimal digits rather than through floating point: `30.75` gives `"30.75"`, `5` gives
`"5.00"`, `"10.5"` gives `"10.50"` and `0.1 + 0.2` gives `"0.30"`. Halves round to even, as
Python's `Decimal` does. A value that is not a number, such as `"ten"` or `NaN`, throws a
`TypeError` before anything is sent.

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

`SETTLED_STATUSES` is what a callback's `ok` checks, and `USABLE_CARD_STATUSES` is the set a card
has to be in before you can charge it. A response's `ok` also accepts the B2B `SUCCESS` and the
heartbeat's `ok`.

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

## Checkout form

`/api/1/checkout` is a browser form post, not a JSON call. `checkoutForm` takes the same arguments
as `createPayment`, sends nothing, and returns the form action and the two signed fields:

```ts
const form = await client.checkoutForm(30.75, 'order-1', { description: 'Test order' })
form.url        // https://epoint.az/api/1/checkout
form.data       // signed exactly like every other request
form.signature
```

Render it as a form that submits itself, and epoint answers with the hosted card page:

```ts
const html = `<form id="epoint" method="post" action="${form.url}">
  <input type="hidden" name="data" value="${form.data}">
  <input type="hidden" name="signature" value="${form.signature}">
</form>
<script>document.getElementById('epoint').submit()</script>`
```

## B2B webhooks

`parseB2BWebhook` turns the JSON body epoint posts to your `webhookUrl` into a typed object with
`orderId`, `status`, `amount`, `payeeIban`, `payeeName`, `errorMessage`, `ok` and `raw`. It accepts
the body as a string or an already parsed object, ignores unknown fields and keeps an unknown
status as it came.

```ts
import { parseB2BWebhook } from '@martian56/epoint'

const hook = parseB2BWebhook(await request.text())
const transfer = await client.getBankTransfer(hook.orderId)
```

The docs define no signature for this webhook, so anyone can post one to your URL. Confirm it,
for example with `getBankTransfer`, before acting on it.

## Methods

| Group | Methods |
|---|---|
| Checkout | `createPayment`, `createPaymentRequest`, `createAmexPayment`, `changePaymentSum` |
| Status | `getStatus`, `getCardStatus`, `getBankTransfer` |
| Checkout form | `checkoutForm` |
| Split | `createSplitPayment`, `splitChargeSavedCard` |
| Pre-auth | `reserve`, `capture` |
| Saved cards | `registerCard`, `registerCardAndPay`, `chargeSavedCard` |
| Money back | `refund`, `reverse` |
| Installments | `getInstallmentPlans`, `payByInstallment` |
| Wallets | `listWallets`, `payWithWallet` |
| Apple Pay, Google Pay | `createWidget`, `createTokenSplitPayment` |
| Invoices | `createInvoice`, `updateInvoice`, `getInvoice`, `listInvoices`, `sendInvoiceSms`, `sendInvoiceEmail` |
| B2B | `createBankTransfer`, `getBankTransfer`, `parseB2BWebhook` |
| Health | `heartbeat` |

`createTokenSplitPayment` posts to `/api/1/token/split-payment` with the same arguments and
defaults as `createSplitPayment`. The docs give no field for the wallet token.

`createPayment`, `createPaymentRequest` and `checkoutForm` take `isInstallment`, sent as 1 or 0
and left out when not given. `getInstallmentPlans` takes `description` and `otherAttr`, and
`createBankTransfer` takes `bulkDescription`.

Not supported: `invoice_images[]` on invoices. The sandbox does not accept it and the docs give no
way to send it.

## Errors

| Class | Thrown when |
|---|---|
| `GatewayError` | epoint returned `status: error`, except a payment state on `getStatus`. Carries `code`, `status`, `payload`. |
| `TransportError` | Network failure, or a non-JSON or `4xx`/`5xx` response |
| `SignatureError` | A callback's signature did not match, or its data would not decode |

All three extend `EpointError`. A declined payment is not an error: `getStatus` resolves normally
with `status: 'failed'`, which you read through `.ok`, and a payment that ended in `error` resolves
with `status: 'error'`.

## Signatures

Epoint signs with `base64(sha1_raw(private_key + data + private_key))`. The client builds and
verifies these with Web Crypto. The digest is the raw 20 bytes, not the hex string, which is where
most hand-rolled integrations go wrong.

## Not affiliated with Epoint

An independent client for developers integrating with epoint.az.

MIT licensed.
