import express, { Request, Response } from "express";
import cors from "cors";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import {
  products as seedProducts,
  distributors,
  distributorPasswords,
  ADMIN_USERNAME,
  ADMIN_PASSWORD,
  ADMIN_TOKEN,
} from "./seed";
import {
  CreateQuoteRequest,
  Product,
  Quote,
  QuoteLineItem,
} from "../../shared/types";

const app = express();
app.use(cors());
app.use(express.json());

const QUOTES_FILE = path.join(__dirname, "..", "quotes.json");
const PRODUCTS_FILE = path.join(__dirname, "..", "products.json");
const QUOTE_TTL_DAYS = 30;

function loadQuotes(): Record<string, Quote> {
  try {
    if (fs.existsSync(QUOTES_FILE)) {
      return JSON.parse(fs.readFileSync(QUOTES_FILE, "utf-8"));
    }
  } catch {}
  return {};
}

function saveQuotes(store: Record<string, Quote>): void {
  fs.writeFileSync(QUOTES_FILE, JSON.stringify(store, null, 2));
}

function loadProducts(): Product[] {
  try {
    if (fs.existsSync(PRODUCTS_FILE)) {
      const raw = JSON.parse(fs.readFileSync(PRODUCTS_FILE, "utf-8"));
      if (Array.isArray(raw)) {
        return raw.map((p: Partial<Product>): Product => ({
          ...(p as Product),
          active: typeof p.active === "boolean" ? p.active : true,
        }));
      }

    }
  } catch {}
  // First run — initialize from seed and persist.
  fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(seedProducts, null, 2));
  return [...seedProducts];
}

function saveProducts(list: Product[]): void {
  fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(list, null, 2));
}

const quotes: Record<string, Quote> = loadQuotes();
let products: Product[] = loadProducts();

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function withStatus(q: Quote): Quote {
  const expired = new Date(q.expiresAt).getTime() < Date.now();
  return { ...q, status: expired ? "expired" : "active" };
}

app.get("/products", (_req, res) => {
  res.json(products.filter((p) => p.active));
});

app.get("/distributors", (_req, res) => {
  res.json(distributors);
});

function requireAdmin(req: Request, res: Response): boolean {
  const auth = req.header("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (token !== ADMIN_TOKEN) {
    res.status(401).json({ error: "Admin authentication required" });
    return false;
  }
  return true;
}

app.post("/admin/login", (req, res) => {
  const { username, password } = req.body ?? {};
  if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Invalid admin credentials" });
  }
  res.json({ token: ADMIN_TOKEN, username: ADMIN_USERNAME });
});

app.get("/admin/quotes", (req, res) => {
  if (!requireAdmin(req, res)) return;
  const {
    distributorId,
    status,
    customer,
    createdFrom,
    createdTo,
  } = req.query as {
    distributorId?: string;
    status?: string;
    customer?: string;
    createdFrom?: string;
    createdTo?: string;
  };

  let list = Object.values(quotes).map(withStatus);
  if (distributorId) list = list.filter((q) => q.distributorId === distributorId);
  if (status === "active" || status === "expired") {
    list = list.filter((q) => q.status === status);
  }
  if (customer) {
    const needle = customer.toLowerCase();
    list = list.filter(
      (q) =>
        q.customerName.toLowerCase().includes(needle) ||
        q.id.toLowerCase().includes(needle)
    );
  }
  // Inclusive date range on createdAt. Dates are "YYYY-MM-DD"; from = start of
  // day local, to = end of day local.
  if (createdFrom) {
    const fromMs = new Date(`${createdFrom}T00:00:00`).getTime();
    if (!Number.isNaN(fromMs)) {
      list = list.filter((q) => new Date(q.createdAt).getTime() >= fromMs);
    }
  }
  if (createdTo) {
    const toMs = new Date(`${createdTo}T23:59:59.999`).getTime();
    if (!Number.isNaN(toMs)) {
      list = list.filter((q) => new Date(q.createdAt).getTime() <= toMs);
    }
  }
  list.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  res.json(list);
});

app.get("/admin/quotes/:id", (req, res) => {
  if (!requireAdmin(req, res)) return;
  const q = quotes[req.params.id];
  if (!q) return res.status(404).json({ error: "Quote not found" });
  res.json(withStatus(q));
});

// --- Admin product management -------------------------------------------------

app.get("/admin/products", (req, res) => {
  if (!requireAdmin(req, res)) return;
  res.json(products);
});

app.post("/admin/products", (req, res) => {
  if (!requireAdmin(req, res)) return;
  const { name, sku, price, active } = req.body ?? {};
  if (typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ error: "name is required" });
  }
  if (typeof sku !== "string" || !sku.trim()) {
    return res.status(400).json({ error: "sku is required" });
  }
  if (typeof price !== "number" || price < 0 || !Number.isFinite(price)) {
    return res.status(400).json({ error: "price must be a non-negative number" });
  }
  if (products.some((p) => p.sku === sku)) {
    return res.status(409).json({ error: `SKU ${sku} already exists` });
  }
  const product: Product = {
    id: randomUUID(),
    name: name.trim(),
    sku: sku.trim(),
    price: Math.round(price * 100) / 100,
    active: active !== false,
  };
  products.push(product);
  saveProducts(products);
  res.status(201).json(product);
});

app.patch("/admin/products/:id", (req, res) => {
  if (!requireAdmin(req, res)) return;
  const product = products.find((p) => p.id === req.params.id);
  if (!product) return res.status(404).json({ error: "Product not found" });

  const { name, price, active } = req.body ?? {};
  // SKU is intentionally immutable — it's referenced by saved quotes.
  if (name !== undefined) {
    if (typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "name must be a non-empty string" });
    }
    product.name = name.trim();
  }
  if (price !== undefined) {
    if (typeof price !== "number" || price < 0 || !Number.isFinite(price)) {
      return res.status(400).json({ error: "price must be a non-negative number" });
    }
    product.price = Math.round(price * 100) / 100;
  }
  if (active !== undefined) {
    if (typeof active !== "boolean") {
      return res.status(400).json({ error: "active must be a boolean" });
    }
    product.active = active;
  }
  saveProducts(products);
  res.json(product);
});

app.post("/login", (req, res) => {
  const { distributorId, password } = req.body ?? {};
  if (!distributorId || typeof password !== "string") {
    return res.status(400).json({ error: "distributorId and password required" });
  }
  const expected = distributorPasswords[distributorId];
  const distributor = distributors.find((d) => d.id === distributorId);
  if (!distributor || !expected || password !== expected) {
    return res.status(401).json({ error: "Invalid distributor or password" });
  }
  res.json(distributor);
});

app.get("/distributors/:id", (req, res) => {
  const d = distributors.find((x) => x.id === req.params.id);
  if (!d) return res.status(404).json({ error: "Distributor not found" });
  res.json(d);
});

app.post("/quotes", (req: Request, res: Response) => {
  const body = req.body as CreateQuoteRequest;
  if (!body || !body.distributorId || !body.customerName || !Array.isArray(body.lineItems)) {
    return res.status(400).json({ error: "Invalid request body" });
  }
  if (body.lineItems.length === 0) {
    return res.status(400).json({ error: "Quote must contain at least one line item" });
  }

  const distributor = distributors.find((d) => d.id === body.distributorId);
  if (!distributor) return res.status(404).json({ error: "Distributor not found" });

  const snapshotLines: QuoteLineItem[] = [];
  for (const li of body.lineItems) {
    const product = products.find((p) => p.sku === li.sku);
    if (!product) return res.status(400).json({ error: `Unknown SKU: ${li.sku}` });
    if (!product.active) {
      return res
        .status(400)
        .json({ error: `Product ${li.sku} is disabled and cannot be quoted` });
    }
    if (!Number.isInteger(li.qty) || li.qty <= 0) {
      return res.status(400).json({ error: `Invalid quantity for SKU ${li.sku}` });
    }
    snapshotLines.push({
      sku: product.sku,
      name: product.name,
      qty: li.qty,
      unitPrice: product.price,
      lineTotal: round2(product.price * li.qty),
    });
  }

  const subtotal = round2(snapshotLines.reduce((s, l) => s + l.lineTotal, 0));
  const tierDiscountAmount = round2(subtotal * (distributor.discount / 100));
  const afterTier = round2(subtotal - tierDiscountAmount);

  let volumeDiscountPct = 0;
  let volumeDiscountAmount = 0;
  if (afterTier > 5000) {
    volumeDiscountPct = 5;
    volumeDiscountAmount = round2(afterTier * 0.05);
  }
  const total = round2(afterTier - volumeDiscountAmount);

  const now = new Date();
  const expiresAt = new Date(now.getTime() + QUOTE_TTL_DAYS * 24 * 60 * 60 * 1000);

  const quote: Quote = {
    id: `Q-${randomUUID().slice(0, 8).toUpperCase()}`,
    distributorId: distributor.id,
    distributorName: distributor.name,
    distributorTier: distributor.tier,
    customerName: body.customerName,
    lineItems: snapshotLines,
    subtotal,
    tierDiscountPct: distributor.discount,
    tierDiscountAmount,
    volumeDiscountPct,
    volumeDiscountAmount,
    total,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    status: "active",
  };

  quotes[quote.id] = quote;
  saveQuotes(quotes);
  res.status(201).json(quote);
});

app.get("/quotes", (req, res) => {
  const { distributorId } = req.query;
  let list = Object.values(quotes).map(withStatus);
  if (typeof distributorId === "string" && distributorId.length > 0) {
    list = list.filter((q) => q.distributorId === distributorId);
  }
  list.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  res.json(list);
});

app.get("/quotes/:id", (req, res) => {
  const q = quotes[req.params.id];
  if (!q) return res.status(404).json({ error: "Quote not found" });
  const { distributorId } = req.query;
  if (
    typeof distributorId === "string" &&
    distributorId.length > 0 &&
    q.distributorId !== distributorId
  ) {
    return res.status(403).json({ error: "Not authorized for this quote" });
  }
  res.json(withStatus(q));
});

const PORT = Number(process.env.PORT) || 4000;
// On Vercel we export the app as a serverless handler and never call listen().
// Locally (tsx watch / node dist/server.js) we run a real HTTP server.
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Distributor portal API listening on http://localhost:${PORT}`);
  });
}

export default app;
