import type {
  Product,
  Distributor,
  Quote,
  CreateQuoteRequest,
} from "../../shared/types";

// In dev, Vite proxies /api/* to the backend (see vite.config.ts).
// In production we hit the deployed backend directly via VITE_API_BASE_URL.
const BASE = import.meta.env.VITE_API_BASE_URL || "/api";

async function handle<T>(r: Response): Promise<T> {
  if (!r.ok) {
    const err = await r.json().catch(() => ({ error: r.statusText }));
    throw new Error(err.error || "Request failed");
  }
  return r.json();
}

export const api = {
  products: () => fetch(`${BASE}/products`).then(handle<Product[]>),
  distributors: () => fetch(`${BASE}/distributors`).then(handle<Distributor[]>),
  distributor: (id: string) =>
    fetch(`${BASE}/distributors/${id}`).then(handle<Distributor>),
  login: (distributorId: string, password: string) =>
    fetch(`${BASE}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ distributorId, password }),
    }).then(handle<Distributor>),
  quotes: (distributorId: string) =>
    fetch(`${BASE}/quotes?distributorId=${encodeURIComponent(distributorId)}`)
      .then(handle<Quote[]>),
  createQuote: (body: CreateQuoteRequest) =>
    fetch(`${BASE}/quotes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(handle<Quote>),
  getQuote: (id: string, distributorId: string) =>
    fetch(
      `${BASE}/quotes/${id}?distributorId=${encodeURIComponent(distributorId)}`
    ).then(handle<Quote>),

  adminProducts: (token: string) =>
    fetch(`${BASE}/admin/products`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(handle<Product[]>),

  adminCreateProduct: (
    token: string,
    body: { name: string; sku: string; price: number; active?: boolean }
  ) =>
    fetch(`${BASE}/admin/products`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    }).then(handle<Product>),

  adminUpdateProduct: (
    token: string,
    id: string,
    patch: { name?: string; price?: number; active?: boolean }
  ) =>
    fetch(`${BASE}/admin/products/${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(patch),
    }).then(handle<Product>),

  adminLogin: (username: string, password: string) =>
    fetch(`${BASE}/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    }).then(handle<{ token: string; username: string }>),

  adminQuotes: (
    token: string,
    filters: {
      distributorId?: string;
      status?: string;
      customer?: string;
      createdFrom?: string;
      createdTo?: string;
    }
  ) => {
    const params = new URLSearchParams();
    if (filters.distributorId) params.set("distributorId", filters.distributorId);
    if (filters.status) params.set("status", filters.status);
    if (filters.customer) params.set("customer", filters.customer);
    if (filters.createdFrom) params.set("createdFrom", filters.createdFrom);
    if (filters.createdTo) params.set("createdTo", filters.createdTo);
    const qs = params.toString();
    return fetch(`${BASE}/admin/quotes${qs ? `?${qs}` : ""}`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(handle<Quote[]>);
  },
};
