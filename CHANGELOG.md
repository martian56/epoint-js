# Changelog

## 0.4.1

- Published as `epoint-js`. Up to 0.4.0 the package was `@martian56/epoint`, which is now
  deprecated with a message pointing here. There are no code changes: install `epoint-js` and
  change the import, nothing else.

## 0.4.0

- `getStatus` resolves for a payment that ended in status `error`, which the docs list as a
  payment status, instead of throwing. On `getStatus` only, a `2xx` answer with `status: error`
  and a non-empty `transaction` is a payment state. Any other error answer still throws.
- `ok` is also true for the B2B `SUCCESS` and the heartbeat's `ok`.
- `createTokenSplitPayment` posts to `/api/1/token/split-payment` with the same arguments as
  `createSplitPayment`.
- `checkoutForm` returns the action URL and the signed `data` and `signature` fields for the
  `/api/1/checkout` browser form post, without sending a request.
- New optional parameters: `isInstallment` on `createPayment`, `createPaymentRequest` and
  `checkoutForm`, `bulkDescription` on `createBankTransfer`, and `description` and `otherAttr`
  on `getInstallmentPlans`.
- `EpointResponse` has typed getters for `traceId`, `code`, `bankTransaction`, `bankResponse`,
  `operationCode`, `rrn`, `cardName`, `cardMask`, `amount`, `cardId`, `orderId` and `widgetUrl`.
- Callbacks carry `bankResponse`, `traceId` and `cardId`.
- `parseB2BWebhook` reads the B2B webhook body into a typed object. The docs define no signature
  for it, so confirm a transfer with `getBankTransfer` before acting on it.
- Amounts are formatted exactly from their decimal digits, with halves rounded to even like
  Python's `Decimal`, so float noise no longer leaks. A non-numeric amount throws a `TypeError`
  instead of sending "NaN", and client methods return a rejected promise for it.

## 0.3.0

- `registerCard` takes `successRedirectUrl` and `errorRedirectUrl`, so a card saved without a payment returns the
  customer to your own page. Without them it uses the client's defaults, as the checkout
  methods do.

## 0.2.1

- The README documents the enums and uses them in its examples, instead of the bare strings it
  still showed.

## 0.2.0

- Enums for the values the API uses: `Status`, `CardStatus`, `InvoiceStatus`, `B2BStatus`,
  `OperationCode`, `Language` and `Currency`. Values come from the sandbox's own definitions, so
  they match what the API sends. `Currency` also records that checkout takes AZN, USD, EUR and
  RUB while split, pre-auth, refund, reverse, payout and wallet take AZN only.
- Raw strings still work everywhere they did before.

## 0.1.1

Documentation and packaging only, no library changes since 0.1.0. First release
published through the automated trusted-publishing workflow.

## 0.1.0

First release.

- `EpointClient` covering all 30 documented endpoints: payments, saved cards, refunds and
  payouts, split payments, pre-authorisation, installments, wallets, Apple Pay and Google Pay,
  invoices, and B2B transfers.
- Request signing and callback verification through Web Crypto.
- No runtime dependencies. Dual ESM and CommonJS build with type declarations.
- Integration tests run against the [epoint-sandbox](https://github.com/martian56/epoint-sandbox).
