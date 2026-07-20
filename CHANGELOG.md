# Changelog

## 0.1.0

First release.

- `EpointClient` covering all 30 documented endpoints: payments, saved cards, refunds and
  payouts, split payments, pre-authorisation, installments, wallets, Apple Pay and Google Pay,
  invoices, and B2B transfers.
- Request signing and callback verification through Web Crypto.
- No runtime dependencies. Dual ESM and CommonJS build with type declarations.
- Integration tests run against the [epoint-sandbox](https://github.com/martian56/epoint-sandbox).
