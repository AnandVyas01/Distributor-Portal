# HEN Distributor Portal

A small full-stack app where distributors log in, build a quote against a
product catalog, and generate a printable quote with a unique ID. An admin
role can see every quote across distributors and manage the product catalog.

The server is the single source of truth for pricing — clients never send
prices, only SKUs and quantities.

## Stack

- **Frontend** — React + TypeScript (Vite)
- **Backend** — Node.js + Express + TypeScript
- **Storage** — JSON files on disk:
  - `backend/quotes.json` — every saved quote (with snapshotted prices)
  - `backend/products.json` — the live product catalog (created on first run from the seed)
  Distributors and credentials live in seed code.
- **Shared types** — `shared/types.ts`, imported by both frontend and backend.

## Project layout

```
distributor-portal/
├── shared/           # Shared TS interfaces (Product, Distributor, Quote, …)
├── backend/          # Express API (port 4000)
│   ├── src/seed.ts   # Initial products, distributors, credentials
│   └── quotes.json   # Persisted quotes (created at runtime)
└── frontend/         # Vite React app (port 5173)
    └── public/
        └── hen-logo.svg
```

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

The Vite dev server proxies `/api/*` to the backend, so no CORS dance is needed
in development.

## Demo credentials

| Role         | Identifier          | Password      |
| ------------ | ------------------- | ------------- |
| Distributor  | (pick from dropdown) | `password123` |
| Admin        | `admin`             | `admin123`    |

All three distributors share the same demo password. The dropdown labels show
the tier and the discount they receive.

## Pricing rules

1. Each distributor has a tier discount: **Gold 20% / Silver 10% / Bronze 5%**,
   applied to the subtotal.
2. If the post-tier total exceeds **$5,000**, an additional **5% volume
   discount** is applied.
3. Prices on line items are **snapshotted** at quote creation, so later
   catalog price changes never affect quotes that have already been generated.

## REST API

### Public

| Method | Path                  | Description                                              |
| ------ | --------------------- | -------------------------------------------------------- |
| GET    | `/products`           | Active products only (disabled SKUs are hidden)          |
| GET    | `/distributors`       | List all distributors                                    |
| GET    | `/distributors/:id`   | Get one distributor (tier + discount)                    |
| POST   | `/login`              | `{ distributorId, password }` → distributor on success   |
| POST   | `/quotes`             | Create a quote — see below                               |
| GET    | `/quotes?distributorId=X` | List a distributor's quotes (only their own)         |
| GET    | `/quotes/:id?distributorId=X` | Get a saved quote (403 if not the owner)         |

`POST /quotes` body:

```json
{
  "distributorId": "d1",
  "customerName": "Bob's Hardware",
  "lineItems": [{ "sku": "HEN-BLADE-001", "qty": 2 }]
}
```

The client only sends SKUs and quantities. The server looks up the current
price, applies tier + volume discounts, and stores a price-snapshot quote.

### Admin (Bearer token required)

Admin login returns `{ token }`; subsequent requests must send
`Authorization: Bearer <token>`.

| Method | Path                            | Description                                                                 |
| ------ | ------------------------------- | --------------------------------------------------------------------------- |
| POST   | `/admin/login`                  | `{ username, password }` → `{ token, username }`                            |
| GET    | `/admin/quotes`                 | All quotes across distributors. Filters: `distributorId`, `status`, `customer`, `createdFrom`, `createdTo` |
| GET    | `/admin/quotes/:id`             | Any quote, regardless of owner                                              |
| GET    | `/admin/products`               | All products including disabled                                             |
| POST   | `/admin/products`               | Create a product (`{ name, sku, price, active? }`)                          |
| PATCH  | `/admin/products/:id`           | Update `name`, `price`, or `active`. SKU is immutable                       |

## Frontend features

### Distributor app
- **Login screen** with tabs for **Distributor** and **Admin** sign-in.
- Session is persisted in `localStorage` and re-hydrated on refresh.
- **New Quote** — product catalog with quantity inputs, live summary with
  tier + volume discount, **Generate Quote** posts to the server which
  snapshots and saves it.
- **My Quotes** — table of quotes the distributor created (sorted newest
  first). Click **Open** to view / print.
- **Printable quote** — clean letterhead with HEN logo. Use the browser's
  Print dialog → **Save as PDF** for a PDF copy. Uncheck "Headers and
  footers" in the dialog for the cleanest output.
- **Duplicate as new quote** — clones an old quote's line items into the
  builder using **today's** catalog prices. A banner reports any SKUs
  missing from the catalog and any prices that changed since the original.

### Admin dashboard
- **Quotes tab** — every quote across every distributor.
  - Filters: distributor, status (active / expired), search by customer
    name or quote ID, **created-after** / **created-before** date range.
  - **Sortable columns** (click headers, cycles asc → desc → unsorted)
    for Distributor, Customer, Created, Expires, Total.
  - **Export CSV** — downloads the currently filtered + sorted list as
    `quotes-YYYY-MM-DD.csv` with proper quoting/escaping.
- **Products tab** — manage the catalog.
  - Add a product (name, SKU, price).
  - Edit name and price inline; **Save** lights up only when dirty.
  - **Disable** / **Enable** — disabled products are hidden from the
    distributor catalog but remain on past quotes (snapshot guarantee).

## Design choices and trade-offs

- **Server-authoritative pricing.** The client computes a *preview* of
  totals for the live summary, but the saved quote is whatever the server
  calculates. The client never sends prices.
- **JSON file storage.** Survives restarts without needing a database. Not
  safe for concurrent writes — fine for a take-home, would swap for SQLite
  or Postgres in production.
- **No real auth.** The distributor "session" is just an ID in
  `localStorage`. The admin token is a static demo string. Both endpoints
  trust whatever identifier the client sends. In production you'd swap to
  hashed passwords, signed JWTs in `HttpOnly` cookies, and derive identity
  from the verified session.
- **SKU is immutable.** Admins can rename a product or change its price,
  but the SKU is fixed because saved quotes reference it. Disable instead
  of delete — there's no hard-delete endpoint by design.
- **CSV, not Excel; print-to-PDF, not generated PDF.** Both are
  intentional shortcuts. See "Future work" below.
- **Shared types via a sibling folder** (`shared/`), referenced from each
  side's `tsconfig.json`. Simpler than a monorepo for a project this size.
- **Money in plain JS numbers**, rounded to 2dp at each step. Fine for
  this scale; a real billing system should use integer cents or a decimal
  library.
- **Quote expiry.** Stored as `expiresAt` (createdAt + 30 days).
  `GET /quotes/:id` recomputes `status` on read, so an "active" quote
  becomes "expired" automatically once the date passes — no background
  job needed.

## How do you handle price changes for quotes already sent?

Snapshot the prices on the quote itself, and treat the saved quote as
immutable.

When `POST /quotes` runs, the server copies each product's current
`price` into the quote's line items (`unitPrice`) along with the computed
`lineTotal`, subtotal, discount amounts, and final total. Future reads of
that quote return those frozen numbers — even if the product's catalog
price changes the next day, the quote the customer received still honors
the price they were quoted.

The same applies if an admin **disables** or **renames** a product later:
the original quote keeps its snapshotted name and price. Disable instead
of delete is the recommended workflow precisely because of this — there
is no hard delete in the admin UI.

If a customer wants to *re-price* against today's catalog, the right move
is to use the **Duplicate as new quote** button, which copies the line
items into a fresh quote at today's prices and assigns a new ID, new
`createdAt`, and a new 30-day expiry. Combined with the `expiresAt`
field, this gives a clean lifecycle: a quote is valid for 30 days at the
prices shown, after which the distributor regenerates it.

## Verification

Once everything is running, you can verify the price-change guarantee:

1. Sign in as a distributor, build and generate a quote.
2. Sign out, sign in as admin, go to **Products**, change a price (or
   disable a SKU).
3. Sign back in as the distributor, open **My Quotes**, open the original
   quote — prices and line items are unchanged.
4. Click **Duplicate as new quote** — the banner reports the price
   changes / missing SKUs, the live summary uses today's catalog,
   generating produces a new quote with today's snapshot.

## Future work

The current implementation deliberately leaves several real-world pieces
out of scope. The ones most worth doing next, in rough priority order:

- **Real auth** — hashed passwords (bcrypt), signed JWTs in `HttpOnly`
  cookies, server-derived identity instead of trusting client IDs.
- **Real PDF export** — `@react-pdf/renderer` (client-side) or a server
  puppeteer renderer, replacing the browser-print fallback.
- **Real Excel export** — `xlsx` (SheetJS) for true `.xlsx` with typed
  cells instead of CSV.
- **SQLite via `better-sqlite3`** — drop the JSON file in favor of
  transactional storage.
- **Shared pricing module + Vitest** — extract the tier/volume calc into
  `shared/pricing.ts` so frontend preview and backend authority share one
  implementation, and add unit tests.
- **Email the quote / public customer-facing link** — signed URL the
  customer can open without logging in.
