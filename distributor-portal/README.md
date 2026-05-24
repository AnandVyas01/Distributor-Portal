# HEN Distributor Portal

A small self-serve quoting app for fire-department distributors. A
distributor signs in, picks products, and generates a quote with the
correct discounts applied — no sales-team handoff. The server is the
single source of truth for pricing; clients never send prices, only
SKUs and quantities.

## Stack

- **Frontend** — React + TypeScript (Vite)
- **Backend** — Node.js + Express + TypeScript
- **Storage** — JSON files on disk:
  - `backend/quotes.json` — saved quotes, with prices snapshotted
  - `backend/products.json` — live product catalog (initialized from seed on first run)
- **Shared types** — `shared/types.ts`, imported by both sides

## Running locally

Node 18+ required.

```bash
# Terminal 1 — backend
cd backend
npm install
npm run dev          # http://localhost:4000

# Terminal 2 — frontend
cd frontend
npm install
npm run dev          # http://localhost:5173
```

Vite proxies `/api/*` to the backend, so the frontend can call relative
URLs without CORS in development.

## Demo credentials

| Role         | Identifier            | Password      |
| ------------ | --------------------- | ------------- |
| Distributor  | pick from the dropdown | `password123` |
| Admin        | `admin`               | `admin123`    |

All three seeded distributors share the same demo password.

## What's in the brief, and where to find it

| Requirement                                       | Where it lives                                                                 |
| ------------------------------------------------- | ------------------------------------------------------------------------------ |
| Distributor "login" (dropdown)                    | [`frontend/src/App.tsx`](frontend/src/App.tsx) → `Login`                       |
| Product catalog (name, SKU, base price)           | [`backend/src/seed.ts`](backend/src/seed.ts), served by `GET /products`        |
| Add products with quantities to a working quote   | `Builder` component                                                            |
| Live summary (line items, tier discount, volume discount, total) | `Builder` → `totals` memo                                       |
| Generate Quote → printable shareable view with unique ID | `QuoteView` component, server route `POST /quotes`                       |
| `GET /products`                                   | [`backend/src/server.ts`](backend/src/server.ts)                               |
| `GET /distributors/:id`                           | same                                                                           |
| `POST /quotes` (server computes all prices)       | same — see `POST /quotes`                                                      |
| `GET /quotes/:id`                                 | same                                                                           |
| Tier discounts — Gold 20% / Silver 10% / Bronze 5% | `POST /quotes` handler                                                        |
| 5% volume discount over $5,000 post-tier           | same                                                                           |
| Price snapshotting                                 | same — see "Pricing rules" below                                              |
| ~8 products, 3 distributors in JSON                | [`backend/src/seed.ts`](backend/src/seed.ts)                                  |
| Shared TS interfaces                               | [`shared/types.ts`](shared/types.ts) — `Product`, `Distributor`, `LineItem`, `Quote`, `QuoteLineItem`, `CreateQuoteRequest` |
| Bonus: printable quote                             | `QuoteView` with `@media print` CSS and `window.print()` button               |
| Bonus: 30-day expiry + status                      | `expiresAt` stored, `status` recomputed on read                               |

## Pricing rules

1. Each distributor has a tier discount applied to the subtotal:
   **Gold 20% / Silver 10% / Bronze 5%**.
2. If the post-tier total exceeds **$5,000**, an additional **5% volume
   discount** is applied to that already-discounted total.
3. The order matters: `total = (subtotal - tierDiscount) - volumeDiscount`.
4. Every monetary field is rounded to 2dp at each step.

The server is the **only** code that runs this calculation when saving a
quote. The frontend does an identical preview for the live summary, but
the saved quote is whatever the server returns.

## API

### Public

| Method | Path                              | Description                                                              |
| ------ | --------------------------------- | ------------------------------------------------------------------------ |
| GET    | `/products`                       | Active products only                                                     |
| GET    | `/distributors`                   | List all distributors                                                    |
| GET    | `/distributors/:id`               | One distributor (tier + discount)                                        |
| POST   | `/login`                          | `{ distributorId, password }` → distributor on success                   |
| POST   | `/quotes`                         | Create a quote — body: `{ distributorId, customerName, lineItems: [{ sku, qty }] }` |
| GET    | `/quotes?distributorId=X`         | List a distributor's quotes (only their own)                             |
| GET    | `/quotes/:id?distributorId=X`     | Get a saved quote — 403 if not the owner                                 |

`POST /quotes` accepts only SKUs and quantities. The server looks up
prices, applies discounts, and returns the full snapshotted `Quote`
including the assigned ID.

### Admin (Bearer token required)

Admin login returns `{ token }`; subsequent requests send
`Authorization: Bearer <token>`.

| Method | Path                       | Description                                                                  |
| ------ | -------------------------- | ---------------------------------------------------------------------------- |
| POST   | `/admin/login`             | `{ username, password }` → `{ token, username }`                             |
| GET    | `/admin/quotes`            | All quotes; filters `distributorId`, `status`, `customer`, `createdFrom`, `createdTo` |
| GET    | `/admin/quotes/:id`        | Any quote regardless of owner                                                |
| GET    | `/admin/products`          | All products including disabled                                              |
| POST   | `/admin/products`          | Create a product (`{ name, sku, price, active? }`)                           |
| PATCH  | `/admin/products/:id`      | Update `name`, `price`, or `active`. SKU is immutable                        |

## Shared types

```ts
// shared/types.ts
export interface Product       { id; name; sku; price; active }
export interface Distributor   { id; name; tier; discount }
export interface LineItem      { sku; qty }                         // client → server
export interface QuoteLineItem { sku; name; qty; unitPrice; lineTotal } // server-snapshotted
export interface Quote {
  id; distributorId; distributorName; distributorTier;
  customerName;
  lineItems: QuoteLineItem[];
  subtotal; tierDiscountPct; tierDiscountAmount;
  volumeDiscountPct; volumeDiscountAmount; total;
  createdAt; expiresAt; status;       // status recomputed on read
}
```

Both the frontend and backend `tsconfig.json` include `../shared`, so
the same types compile on both sides without duplication.

## How do you handle price-list changes for quotes that have already been sent?

**Snapshot the prices on the quote and treat the quote as immutable.**

When `POST /quotes` runs, the server copies each product's current
`price` into the quote's line items (`unitPrice`) along with the
computed `lineTotal`, subtotal, both discount amounts, and final total.
Future reads of that quote return those frozen numbers — even if the
catalog price changes the next day, the customer still sees the price
they were quoted.

The same applies if an admin **disables** or **renames** a product:
the saved quote keeps its snapshotted name and price. Disabling is the
recommended workflow instead of hard delete, and there is no
hard-delete endpoint. Even an exotic case — admin deletes a product
that's referenced by an old quote — leaves the old quote intact because
nothing on the saved quote is derived from the catalog at read time.

If a customer wants to **re-price** against today's catalog, the right
move is **Duplicate as new quote** in the UI (or just `POST /quotes`
again with the same `lineItems`). This produces a fresh quote with a
new ID, today's prices, and a fresh 30-day expiry. The old quote is
never mutated, so there's always an audit trail of what was promised,
when, and at what price.

Combined with the `expiresAt` field, this gives a clean lifecycle:
a quote is valid for 30 days at the prices shown, after which the
distributor regenerates it.

## Design choices and trade-offs

- **Server-authoritative pricing.** The client computes a *preview* of
  totals for the live summary, but the saved quote is whatever the
  server calculates. The client never sends prices.
- **JSON file storage.** Survives restarts without a database
  dependency. Not safe for concurrent writes — fine for a take-home,
  would swap for SQLite / Postgres in production.
- **Per-distributor isolation.** `GET /quotes` and `GET /quotes/:id`
  scope to the requesting distributor (403 on cross-access). A real
  app would derive the distributor from a verified session token; here
  it's still a client-passed query param. See "Future work."
- **No real auth.** Distributor session is just an ID in
  `localStorage`. Admin token is a static demo string. Both demonstrate
  the role-based UI flows without the cryptographic plumbing of real
  sessions.
- **SKU is immutable.** Admins can rename or reprice a product, but
  the SKU is fixed because saved quotes reference it.
- **Money in JS numbers, rounded at each step.** Sufficient for this
  scale; a real billing system should use integer cents or a decimal
  library to avoid floating-point drift.
- **Quote expiry is read-time.** `expiresAt` is stored;
  `GET /quotes/:id` recomputes `status` (`active` / `expired`) by
  comparing `expiresAt` to "now." No background job needed.
- **CSV instead of XLSX, browser print-to-PDF instead of generated PDF.**
  Deliberate shortcuts to stay within the time budget; see "Future
  work" for the upgrade paths.

## Beyond the brief

The brief asks for one role (distributor) and dropdown login. This
implementation also includes a second role (admin) because it makes the
"how do price changes affect existing quotes?" question testable
end-to-end. None of it relaxes the snapshot guarantee.

- Distributor + admin login with passwords; session persists across
  refresh via `localStorage`.
- **My Quotes** — distributors see only their own quotes.
- **Admin Dashboard** — every quote across distributors, with filters
  (distributor, status, customer search, date range), sortable
  columns, and CSV export.
- **Admin Products** — add/rename/reprice/disable products. Disabled
  products are hidden from the distributor catalog but preserved on
  past quotes.
- **Duplicate as new quote** — clones an old quote into the builder
  using today's prices. Banner reports any missing SKUs and any prices
  that changed since the original.
- HEN logo on the login screen, both navbars, and the printable quote.

## Assumptions

- "Login" is a dropdown + shared demo password. Real auth is explicitly
  out of scope.
- Volume discount of 5% is applied **only** above $5,000 post-tier;
  exactly $5,000 does not qualify (`> 5000`, not `>=`).
- Quotes are **per distributor**, not per customer. The customer name
  is plain text on the quote, not a join.
- Prices are USD. No localization or multi-currency.
- A non-integer or zero quantity is rejected at the server.

## Verification — proving the snapshot guarantee

1. Sign in as a distributor, build and generate a quote with a known
   product.
2. Sign out, sign in as admin (`admin` / `admin123`) → **Products** →
   change that product's price (or disable it).
3. Sign back in as the same distributor → **My Quotes** → open the
   original quote. The price and totals are unchanged.
4. Click **Duplicate as new quote** → the banner reports the price
   change / missing SKU, the live summary uses today's catalog,
   generating produces a brand-new quote with today's snapshot. The
   original quote is still untouched.

You can also confirm via the API directly:

```bash
curl http://localhost:4000/quotes/Q-XXXXXX?distributorId=d1 | jq
# … change a product price in the admin UI …
curl http://localhost:4000/quotes/Q-XXXXXX?distributorId=d1 | jq
# unitPrice and totals are identical
```

## Project layout

```
distributor-portal/
├── shared/                       # Shared TS interfaces
│   └── types.ts
├── backend/
│   ├── src/
│   │   ├── server.ts             # Express app, all routes
│   │   └── seed.ts               # Products, distributors, credentials
│   ├── quotes.json               # Created at runtime
│   └── products.json             # Created at runtime
└── frontend/
    ├── public/
    │   └── hen-logo.svg
    └── src/
        ├── App.tsx
        ├── api.ts
        ├── main.tsx
        └── styles.css
```

## Future work (in priority order)

- **Real auth** — bcrypt-hashed passwords, signed JWTs in `HttpOnly`
  cookies, server-derived identity instead of trusting client IDs.
- **Real PDF export** — `@react-pdf/renderer` (client-side) or
  server-side puppeteer, replacing the browser-print fallback.
- **Real Excel export** — `xlsx` (SheetJS) for typed `.xlsx` cells
  instead of CSV.
- **SQLite via `better-sqlite3`** — drop the JSON files in favor of
  transactional storage.
- **Shared pricing module + Vitest** — extract the tier/volume
  calculation into `shared/pricing.ts` so frontend preview and backend
  authority share one implementation, with unit tests covering edge
  cases at the $5,000 boundary.
- **Email the quote / signed customer-facing link** — let recipients
  view the quote without logging in.
