# Frankfurter FX source (USD-to-INR refresh)

Research for the server-side FX rate fetcher that refreshes the stored
USD-to-INR exchange rate.

## Endpoint

- URL: `https://api.frankfurter.dev/v1/latest?base=USD&symbols=INR`
- Method: GET
- No API key required. Frankfurter is a free, open FX-rate API backed by published
  central-bank reference rates.

## Verified response shape

Verified live on 2026-06-12 with a real fetch. Observed body:

```json
{ "amount": 1.0, "base": "USD", "date": "2026-06-12", "rates": { "INR": 95.12 } }
```

The observed rate was 95.12 INR per USD.

The fetcher depends only on the `rates.INR` number. The Zod schema validates exactly that
slice (`{ rates: { INR: number } }`) and ignores the rest, so additive changes elsewhere in
the body do not break parsing.

## Bound check rationale

After parsing, the rate is accepted only when `rate > 0 and rate <= 100000`:

- `> 0` rejects zero, negatives, and a misparse that lands on a non-positive value.
- `<= 100000` rejects an absurd large value (for example a misparse that yields a huge
  number). INR-per-USD is roughly 83 to 95 in this era, so the upper bound leaves enormous
  headroom for genuine currency drift while still catching nonsense.

Any out-of-range value maps to `null`, the single canonical failure outcome.

## Failure handling

The fetcher reuses the discovery `fetchJson` helper (abort-timeout fetch that returns `null`
on any error or non-200, and never throws). On top of that, the fetcher returns `null` for a
malformed body or an out-of-range rate. It NEVER throws and NEVER logs the request URL, the
response body, or any header value. The caller maps `null` to the single content-safe failure
outcome.

## Fallback note

If Frankfurter ever fails verification or becomes unreliable, the flagged fallback source is
`open.er-api.com` (also free, no API key). It was not needed: Frankfurter verified cleanly
live, so the implementation sticks with Frankfurter.
