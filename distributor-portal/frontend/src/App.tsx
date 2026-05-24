import { useEffect, useMemo, useState } from "react";
import type {
  Product,
  Distributor,
  Quote,
  LineItem,
} from "../../shared/types";
import { api } from "./api";

const fmt = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

const SESSION_KEY = "distributor-portal:distributorId";
const ADMIN_SESSION_KEY = "distributor-portal:adminToken";

type View = "builder" | "list" | "quote";

export default function App() {
  // Admin session takes precedence if present.
  const [adminToken, setAdminToken] = useState<string>(
    () => localStorage.getItem(ADMIN_SESSION_KEY) || ""
  );
  const [distributorId, setDistributorId] = useState<string>(
    () => localStorage.getItem(SESSION_KEY) || ""
  );
  const [distributor, setDistributor] = useState<Distributor | null>(null);
  const [loadingSession, setLoadingSession] = useState<boolean>(
    !!localStorage.getItem(SESSION_KEY)
  );
  const [view, setView] = useState<View>("builder");
  const [activeQuote, setActiveQuote] = useState<Quote | null>(null);
  const [prefillFromQuote, setPrefillFromQuote] = useState<Quote | null>(null);

  // Resolve distributor from id (on first load if session restored)
  useEffect(() => {
    if (adminToken) {
      // Admin session — skip distributor lookup.
      setLoadingSession(false);
      return;
    }
    if (!distributorId) {
      setDistributor(null);
      setLoadingSession(false);
      return;
    }
    api
      .distributor(distributorId)
      .then((d) => setDistributor(d))
      .catch(() => {
        localStorage.removeItem(SESSION_KEY);
        setDistributorId("");
      })
      .finally(() => setLoadingSession(false));
  }, [distributorId, adminToken]);

  const loginDistributor = (id: string) => {
    localStorage.setItem(SESSION_KEY, id);
    setDistributorId(id);
    setLoadingSession(true);
    setView("builder");
  };

  const loginAdmin = (token: string) => {
    localStorage.setItem(ADMIN_SESSION_KEY, token);
    setAdminToken(token);
  };

  const logout = () => {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(ADMIN_SESSION_KEY);
    setDistributorId("");
    setDistributor(null);
    setAdminToken("");
    setActiveQuote(null);
    setView("builder");
  };

  if (loadingSession) {
    return (
      <div className="app">
        <p className="muted">Loading…</p>
      </div>
    );
  }

  if (adminToken) {
    return <AdminDashboard token={adminToken} onLogout={logout} />;
  }

  if (!distributor) {
    return <Login onDistributorLogin={loginDistributor} onAdminLogin={loginAdmin} />;
  }

  return (
    <div className="app">
      <NavBar
        distributor={distributor}
        view={view}
        onChangeView={(v) => {
          setActiveQuote(null);
          setView(v);
        }}
        onLogout={logout}
      />

      {view === "builder" && (
        <Builder
          distributor={distributor}
          prefill={prefillFromQuote}
          onPrefillConsumed={() => setPrefillFromQuote(null)}
          onQuoteCreated={(q) => {
            setActiveQuote(q);
            setView("quote");
          }}
        />
      )}

      {view === "list" && (
        <QuotesList
          distributorId={distributor.id}
          onOpen={(q) => {
            setActiveQuote(q);
            setView("quote");
          }}
        />
      )}

      {view === "quote" && activeQuote && (
        <QuoteView
          quote={activeQuote}
          onBack={() => {
            setActiveQuote(null);
            setView("list");
          }}
          onClone={(q) => {
            setPrefillFromQuote(q);
            setActiveQuote(null);
            setView("builder");
          }}
        />
      )}
    </div>
  );
}

const DEFAULT_PASSWORD = "password123";

function Login({
  onDistributorLogin,
  onAdminLogin,
}: {
  onDistributorLogin: (id: string) => void;
  onAdminLogin: (token: string) => void;
}) {
  const [mode, setMode] = useState<"distributor" | "admin">("distributor");
  const [distributors, setDistributors] = useState<Distributor[]>([]);
  const [selected, setSelected] = useState("");
  const [password, setPassword] = useState("");
  const [adminUser, setAdminUser] = useState("");
  const [adminPass, setAdminPass] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api
      .distributors()
      .then(setDistributors)
      .catch((e) => setError(e.message));
  }, []);

  const submit = async () => {
    setError("");
    setSubmitting(true);
    try {
      if (mode === "distributor") {
        if (!selected) throw new Error("Choose a distributor.");
        if (!password) throw new Error("Enter a password.");
        const d = await api.login(selected, password);
        onDistributorLogin(d.id);
      } else {
        if (!adminUser || !adminPass) throw new Error("Enter admin credentials.");
        const r = await api.adminLogin(adminUser, adminPass);
        onAdminLogin(r.token);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="app" style={{ maxWidth: 480, marginTop: 80 }}>
      <div className="card">
        <div className="brand brand-lg" style={{ marginBottom: 14 }}>
          <img src="/hen-logo.svg" alt="HEN" />
        </div>
        <h1 style={{ marginTop: 0 }}>Distributor Portal</h1>
        <p className="muted">
          {mode === "distributor"
            ? "Sign in to build and manage your quotes."
            : "Admin sign-in — view all quotes across distributors."}
        </p>

        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <button
            className={mode === "distributor" ? "btn-primary" : "btn-secondary"}
            style={{ flex: 1 }}
            onClick={() => {
              setMode("distributor");
              setError("");
            }}
          >
            Distributor
          </button>
          <button
            className={mode === "admin" ? "btn-primary" : "btn-secondary"}
            style={{ flex: 1 }}
            onClick={() => {
              setMode("admin");
              setError("");
            }}
          >
            Admin
          </button>
        </div>

        {mode === "distributor" ? (
          <>
            <label>Distributor account</label>
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              <option value="">— Choose distributor —</option>
              {distributors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.tier})
                </option>
              ))}
            </select>

            <label style={{ marginTop: 14 }}>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
          </>
        ) : (
          <>
            <label>Admin username</label>
            <input
              type="text"
              value={adminUser}
              onChange={(e) => setAdminUser(e.target.value)}
              placeholder="admin"
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
            <label style={{ marginTop: 14 }}>Admin password</label>
            <input
              type="password"
              value={adminPass}
              onChange={(e) => setAdminPass(e.target.value)}
              placeholder="Enter admin password"
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
          </>
        )}

        {error && <p style={{ color: "#dc2626" }}>{error}</p>}
        <button
          className="btn-primary"
          style={{ marginTop: 14, width: "100%" }}
          disabled={submitting}
          onClick={submit}
        >
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </div>
    </div>
  );
}

function NavBar({
  distributor,
  view,
  onChangeView,
  onLogout,
}: {
  distributor: Distributor;
  view: View;
  onChangeView: (v: View) => void;
  onLogout: () => void;
}) {
  return (
    <div
      className="no-print"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 18,
        paddingBottom: 14,
        borderBottom: "1px solid #e5e7eb",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div className="brand">
          <img src="/hen-logo.svg" alt="HEN" />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            className={view === "builder" ? "btn-primary" : "btn-secondary"}
            onClick={() => onChangeView("builder")}
          >
            New Quote
          </button>
          <button
            className={view === "list" ? "btn-primary" : "btn-secondary"}
            onClick={() => onChangeView("list")}
          >
            My Quotes
          </button>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span className="muted" style={{ fontSize: 13 }}>
          Signed in as <strong>{distributor.name}</strong>{" "}
          <span className={`tier-badge tier-${distributor.tier}`}>
            {distributor.tier}
          </span>
        </span>
        <button className="btn-ghost" onClick={onLogout}>
          Sign out
        </button>
      </div>
    </div>
  );
}

function Builder({
  distributor,
  prefill,
  onPrefillConsumed,
  onQuoteCreated,
}: {
  distributor: Distributor;
  prefill?: Quote | null;
  onPrefillConsumed?: () => void;
  onQuoteCreated: (q: Quote) => void;
}) {
  const [products, setProducts] = useState<Product[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [cloneNotice, setCloneNotice] = useState("");

  useEffect(() => {
    api.products().then(setProducts).catch((e) => setError(e.message));
  }, []);

  // Seed builder state from a quote being cloned. Runs once products are loaded
  // so we can detect SKUs that no longer exist (or have been disabled) in the
  // catalog, and surface unit-price changes since the original quote.
  useEffect(() => {
    if (!prefill || products.length === 0) return;
    const productsBySku = new Map(products.map((p) => [p.sku, p]));
    const newCart: Record<string, number> = {};
    let dropped = 0;
    let priceChanged = 0;
    for (const li of prefill.lineItems) {
      const current = productsBySku.get(li.sku);
      if (current) {
        newCart[li.sku] = li.qty;
        if (current.price !== li.unitPrice) priceChanged += 1;
      } else {
        dropped += 1;
      }
    }
    setCustomerName(prefill.customerName);
    setCart(newCart);
    const parts: string[] = [];
    if (dropped > 0) {
      parts.push(
        `${dropped} item${dropped === 1 ? "" : "s"} from the original quote ${dropped === 1 ? "is" : "are"} no longer available and ${dropped === 1 ? "was" : "were"} skipped.`
      );
    }
    if (priceChanged > 0) {
      parts.push(
        `${priceChanged} item${priceChanged === 1 ? " has" : "s have"} new prices since the original quote.`
      );
    }
    if (parts.length === 0) {
      parts.push(
        `Pre-filled from quote ${prefill.id}. Prices reflect today's catalog.`
      );
    }
    setCloneNotice(parts.join(" "));
    onPrefillConsumed?.();
  }, [prefill, products, onPrefillConsumed]);

  const lineItems = useMemo(
    () =>
      Object.entries(cart)
        .filter(([, q]) => q > 0)
        .map(([sku, qty]) => {
          const p = products.find((x) => x.sku === sku)!;
          return { sku, qty, product: p, lineTotal: p.price * qty };
        }),
    [cart, products]
  );

  const totals = useMemo(() => {
    const subtotal = lineItems.reduce((s, l) => s + l.lineTotal, 0);
    const tierPct = distributor.discount;
    const tierAmt = subtotal * (tierPct / 100);
    const afterTier = subtotal - tierAmt;
    const volPct = afterTier > 5000 ? 5 : 0;
    const volAmt = afterTier * (volPct / 100);
    return {
      subtotal,
      tierPct,
      tierAmt,
      volPct,
      volAmt,
      total: afterTier - volAmt,
    };
  }, [lineItems, distributor]);

  const updateQty = (sku: string, qty: number) => {
    setCart((c) => ({ ...c, [sku]: Math.max(0, qty) }));
  };

  const onGenerate = async () => {
    setError("");
    if (!customerName.trim()) return setError("Enter a customer name.");
    const items: LineItem[] = lineItems.map((l) => ({ sku: l.sku, qty: l.qty }));
    if (items.length === 0) return setError("Add at least one product.");
    setSubmitting(true);
    try {
      const q = await api.createQuote({
        distributorId: distributor.id,
        customerName: customerName.trim(),
        lineItems: items,
      });
      onQuoteCreated(q);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>New Quote</h1>
      <p className="muted">
        Your tier discount ({distributor.discount}%) is applied automatically.
        Orders over $5,000 (after tier discount) earn an extra 5%.
      </p>

      {cloneNotice && (
        <div
          className="card"
          style={{
            background: "#fef3c7",
            borderColor: "#fcd34d",
            color: "#78350f",
            fontSize: 14,
          }}
        >
          {cloneNotice}{" "}
          <button
            className="btn-ghost"
            style={{ padding: "0 4px" }}
            onClick={() => setCloneNotice("")}
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="card">
        <label>Customer name</label>
        <input
          type="text"
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
          placeholder="e.g. Bob's Hardware"
        />
      </div>

      <div className="row">
        <div className="col" style={{ flex: 2 }}>
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Product Catalog</h3>
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>SKU</th>
                  <th>Price</th>
                  <th>Qty</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td><code>{p.sku}</code></td>
                    <td>{fmt(p.price)}</td>
                    <td>
                      <input
                        className="qty"
                        type="number"
                        min={0}
                        value={cart[p.sku] ?? 0}
                        onChange={(e) =>
                          updateQty(p.sku, parseInt(e.target.value || "0"))
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="col">
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Quote Summary</h3>
            {lineItems.length === 0 ? (
              <p className="muted">No items added yet.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Qty</th>
                    <th>Unit</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((l) => (
                    <tr key={l.sku}>
                      <td>{l.product.name}</td>
                      <td>{l.qty}</td>
                      <td>{fmt(l.product.price)}</td>
                      <td>{fmt(l.lineTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div style={{ marginTop: 14 }}>
              <div className="summary-row">
                <span>Subtotal</span>
                <span>{fmt(totals.subtotal)}</span>
              </div>
              <div className="summary-row">
                <span>Tier discount ({totals.tierPct}%)</span>
                <span>−{fmt(totals.tierAmt)}</span>
              </div>
              {totals.volPct > 0 && (
                <div className="summary-row">
                  <span>Volume discount ({totals.volPct}%)</span>
                  <span>−{fmt(totals.volAmt)}</span>
                </div>
              )}
              <div className="summary-row total">
                <span>Total</span>
                <span>{fmt(totals.total)}</span>
              </div>
            </div>
            {error && <p style={{ color: "#dc2626", fontSize: 14 }}>{error}</p>}
            <button
              className="btn-primary"
              style={{ marginTop: 12, width: "100%" }}
              disabled={submitting || lineItems.length === 0}
              onClick={onGenerate}
            >
              {submitting ? "Generating…" : "Generate Quote"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function QuotesList({
  distributorId,
  onOpen,
}: {
  distributorId: string;
  onOpen: (q: Quote) => void;
}) {
  const [quotes, setQuotes] = useState<Quote[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .quotes(distributorId)
      .then(setQuotes)
      .catch((e) => setError(e.message));
  }, [distributorId]);

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>My Quotes</h1>
      <div className="card">
        {error && <p style={{ color: "#dc2626" }}>{error}</p>}
        {!quotes && !error && <p className="muted">Loading…</p>}
        {quotes && quotes.length === 0 && (
          <p className="muted">No quotes yet. Generate one to see it here.</p>
        )}
        {quotes && quotes.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Quote ID</th>
                <th>Customer</th>
                <th>Created</th>
                <th>Expires</th>
                <th>Status</th>
                <th>Total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {quotes.map((q) => (
                <tr key={q.id}>
                  <td><code>{q.id}</code></td>
                  <td>{q.customerName}</td>
                  <td>{new Date(q.createdAt).toLocaleDateString()}</td>
                  <td>{new Date(q.expiresAt).toLocaleDateString()}</td>
                  <td>
                    <span className={`status-${q.status}`}>
                      {q.status.toUpperCase()}
                    </span>
                  </td>
                  <td>{fmt(q.total)}</td>
                  <td>
                    <button className="btn-ghost" onClick={() => onOpen(q)}>
                      Open
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function QuoteView({
  quote,
  onBack,
  onClone,
}: {
  quote: Quote;
  onBack: () => void;
  onClone?: (q: Quote) => void;
}) {
  return (
    <div>
      <div className="no-print" style={{ marginBottom: 16 }}>
        <button className="btn-secondary" onClick={onBack}>
          ← Back
        </button>{" "}
        <button className="btn-primary" onClick={() => window.print()}>
          Print
        </button>{" "}
        {onClone && (
          <button className="btn-secondary" onClick={() => onClone(quote)}>
            Duplicate as new quote
          </button>
        )}
      </div>

      <div className="card printable">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 24,
          }}
        >
          <div>
            <div className="brand brand-print" style={{ marginBottom: 16 }}>
              <img src="/hen-logo.svg" alt="HEN" />
            </div>
            <h1 style={{ margin: 0, fontSize: 28 }}>Quote</h1>
            <p style={{ margin: "6px 0", fontSize: 15 }}>
              <strong>{quote.id}</strong>
            </p>
          </div>
          <div style={{ textAlign: "right", fontSize: 13 }}>
            <div>
              Issued: <strong>{new Date(quote.createdAt).toLocaleDateString()}</strong>
            </div>
            <div style={{ marginTop: 4 }}>
              Expires: <strong>{new Date(quote.expiresAt).toLocaleDateString()}</strong>
            </div>
            <div style={{ marginTop: 4 }} className={`status-${quote.status}`}>
              {quote.status.toUpperCase()}
            </div>
          </div>
        </div>

        <hr style={{ margin: "20px 0", border: "none", borderTop: "1px solid #e5e7eb" }} />

        <div className="row">
          <div className="col">
            <strong>Distributor</strong>
            <p style={{ margin: "4px 0" }}>
              {quote.distributorName}{" "}
              <span className={`tier-badge tier-${quote.distributorTier}`}>
                {quote.distributorTier}
              </span>
            </p>
          </div>
          <div className="col">
            <strong>Customer</strong>
            <p style={{ margin: "4px 0" }}>{quote.customerName}</p>
          </div>
        </div>

        <table style={{ marginTop: 20 }}>
          <thead>
            <tr>
              <th>Product</th>
              <th>SKU</th>
              <th>Qty</th>
              <th>Unit Price</th>
              <th>Line Total</th>
            </tr>
          </thead>
          <tbody>
            {quote.lineItems.map((l) => (
              <tr key={l.sku}>
                <td>{l.name}</td>
                <td><code>{l.sku}</code></td>
                <td>{l.qty}</td>
                <td>{fmt(l.unitPrice)}</td>
                <td>{fmt(l.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ marginTop: 20, maxWidth: 360, marginLeft: "auto" }}>
          <div className="summary-row">
            <span>Subtotal</span>
            <span>{fmt(quote.subtotal)}</span>
          </div>
          <div className="summary-row">
            <span>Tier discount ({quote.tierDiscountPct}%)</span>
            <span>−{fmt(quote.tierDiscountAmount)}</span>
          </div>
          {quote.volumeDiscountPct > 0 && (
            <div className="summary-row">
              <span>Volume discount ({quote.volumeDiscountPct}%)</span>
              <span>−{fmt(quote.volumeDiscountAmount)}</span>
            </div>
          )}
          <div className="summary-row total">
            <span>Total</span>
            <span>{fmt(quote.total)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

type SortKey = "distributor" | "customer" | "created" | "expires" | "total";
type SortState = { key: SortKey | null; dir: "asc" | "desc" };

function sortValue(q: Quote, key: SortKey): string | number {
  switch (key) {
    case "distributor":
      return q.distributorName.toLowerCase();
    case "customer":
      return q.customerName.toLowerCase();
    case "created":
      return new Date(q.createdAt).getTime();
    case "expires":
      return new Date(q.expiresAt).getTime();
    case "total":
      return q.total;
  }
}

function csvCell(value: unknown): string {
  const s = value == null ? "" : String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function SortHeader({
  label,
  col,
  sort,
  onToggle,
}: {
  label: string;
  col: SortKey;
  sort: SortState;
  onToggle: (k: SortKey) => void;
}) {
  const active = sort.key === col;
  const caret = !active ? "↕" : sort.dir === "asc" ? "▲" : "▼";
  return (
    <th
      onClick={() => onToggle(col)}
      style={{ cursor: "pointer", userSelect: "none" }}
      title="Click to sort"
    >
      {label}{" "}
      <span
        style={{
          fontSize: 10,
          color: active ? "#2563eb" : "#9ca3af",
        }}
      >
        {caret}
      </span>
    </th>
  );
}

type AdminTab = "quotes" | "products";

function AdminDashboard({
  token,
  onLogout,
}: {
  token: string;
  onLogout: () => void;
}) {
  const [tab, setTab] = useState<AdminTab>("quotes");
  const [distributors, setDistributors] = useState<Distributor[]>([]);
  const [quotes, setQuotes] = useState<Quote[] | null>(null);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({
    distributorId: "",
    status: "",
    customer: "",
    createdFrom: "",
    createdTo: "",
  });
  const [sort, setSort] = useState<{ key: SortKey | null; dir: "asc" | "desc" }>({
    key: null,
    dir: "desc",
  });
  const [activeQuote, setActiveQuote] = useState<Quote | null>(null);

  useEffect(() => {
    api.distributors().then(setDistributors).catch(() => {});
  }, []);

  const reload = () => {
    setError("");
    api
      .adminQuotes(token, filters)
      .then(setQuotes)
      .catch((e) => {
        setError(e.message);
        if (/401/.test(e.message) || /authentication/i.test(e.message)) {
          onLogout();
        }
      });
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateFilter = (k: keyof typeof filters, v: string) =>
    setFilters((f) => ({ ...f, [k]: v }));

  const toggleSort = (key: SortKey) => {
    setSort((s) => {
      if (s.key !== key) return { key, dir: "asc" };
      if (s.dir === "asc") return { key, dir: "desc" };
      return { key: null, dir: "desc" };
    });
  };

  const sortedQuotes = useMemo(() => {
    if (!quotes) return quotes;
    if (!sort.key) return quotes;
    const arr = [...quotes];
    const k = sort.key;
    arr.sort((a, b) => {
      const va = sortValue(a, k);
      const vb = sortValue(b, k);
      if (va < vb) return sort.dir === "asc" ? -1 : 1;
      if (va > vb) return sort.dir === "asc" ? 1 : -1;
      return 0;
    });
    return arr;
  }, [quotes, sort]);

  const downloadCsv = () => {
    const rows = sortedQuotes ?? [];
    const headers = [
      "Quote ID",
      "Distributor",
      "Tier",
      "Customer",
      "Created",
      "Expires",
      "Status",
      "Subtotal",
      "Tier Discount %",
      "Tier Discount $",
      "Volume Discount %",
      "Volume Discount $",
      "Total",
    ];
    const body = rows.map((q) => [
      q.id,
      q.distributorName,
      q.distributorTier,
      q.customerName,
      q.createdAt,
      q.expiresAt,
      q.status,
      q.subtotal,
      q.tierDiscountPct,
      q.tierDiscountAmount,
      q.volumeDiscountPct,
      q.volumeDiscountAmount,
      q.total,
    ]);
    const csv = [headers, ...body]
      .map((row) => row.map(csvCell).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const today = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `quotes-${today}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (activeQuote) {
    return (
      <div className="app">
        <QuoteView quote={activeQuote} onBack={() => setActiveQuote(null)} />
      </div>
    );
  }

  return (
    <div className="app">
      <div
        className="no-print"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 18,
          paddingBottom: 14,
          borderBottom: "1px solid #e5e7eb",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div className="brand">
            <img src="/hen-logo.svg" alt="HEN" />
          </div>
          <h1 style={{ margin: 0 }}>Admin Dashboard</h1>
        </div>
        <div>
          <span className="muted" style={{ fontSize: 13, marginRight: 12 }}>
            Signed in as <strong>admin</strong>
          </span>
          <button className="btn-ghost" onClick={onLogout}>
            Sign out
          </button>
        </div>
      </div>

      <div className="no-print" style={{ display: "flex", gap: 8, marginBottom: 18 }}>
        <button
          className={tab === "quotes" ? "btn-primary" : "btn-secondary"}
          onClick={() => setTab("quotes")}
        >
          Quotes
        </button>
        <button
          className={tab === "products" ? "btn-primary" : "btn-secondary"}
          onClick={() => setTab("products")}
        >
          Products
        </button>
      </div>

      {tab === "products" && (
        <AdminProducts token={token} onAuthFail={onLogout} />
      )}

      {tab === "quotes" && (
      <>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Filters</h3>
        <div className="row">
          <div className="col">
            <label>Distributor</label>
            <select
              value={filters.distributorId}
              onChange={(e) => updateFilter("distributorId", e.target.value)}
            >
              <option value="">All distributors</option>
              {distributors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <div className="col">
            <label>Status</label>
            <select
              value={filters.status}
              onChange={(e) => updateFilter("status", e.target.value)}
            >
              <option value="">Any status</option>
              <option value="active">Active</option>
              <option value="expired">Expired</option>
            </select>
          </div>
          <div className="col">
            <label>Search (customer or quote ID)</label>
            <input
              type="text"
              value={filters.customer}
              onChange={(e) => updateFilter("customer", e.target.value)}
              placeholder="e.g. Bob's Hardware or Q-3F8A"
              onKeyDown={(e) => e.key === "Enter" && reload()}
            />
          </div>
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <div className="col">
            <label>Created after</label>
            <input
              type="date"
              value={filters.createdFrom}
              onChange={(e) => updateFilter("createdFrom", e.target.value)}
            />
          </div>
          <div className="col">
            <label>Created before</label>
            <input
              type="date"
              value={filters.createdTo}
              onChange={(e) => updateFilter("createdTo", e.target.value)}
            />
          </div>
          <div className="col" />
        </div>
        <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
          <button className="btn-primary" onClick={reload}>
            Apply filters
          </button>
          <button
            className="btn-secondary"
            onClick={() => {
              setFilters({
                distributorId: "",
                status: "",
                customer: "",
                createdFrom: "",
                createdTo: "",
              });
              setSort({ key: null, dir: "desc" });
              setTimeout(reload, 0);
            }}
          >
            Reset
          </button>
          <button
            className="btn-secondary"
            disabled={!sortedQuotes || sortedQuotes.length === 0}
            onClick={downloadCsv}
            style={{ marginLeft: "auto" }}
          >
            Export CSV
          </button>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>
          All Quotes {sortedQuotes ? `(${sortedQuotes.length})` : ""}
        </h3>
        {error && <p style={{ color: "#dc2626" }}>{error}</p>}
        {!sortedQuotes && !error && <p className="muted">Loading…</p>}
        {sortedQuotes && sortedQuotes.length === 0 && (
          <p className="muted">No quotes match these filters.</p>
        )}
        {sortedQuotes && sortedQuotes.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Quote ID</th>
                <SortHeader label="Distributor" col="distributor" sort={sort} onToggle={toggleSort} />
                <SortHeader label="Customer" col="customer" sort={sort} onToggle={toggleSort} />
                <SortHeader label="Created" col="created" sort={sort} onToggle={toggleSort} />
                <SortHeader label="Expires" col="expires" sort={sort} onToggle={toggleSort} />
                <th>Status</th>
                <SortHeader label="Total" col="total" sort={sort} onToggle={toggleSort} />
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sortedQuotes.map((q) => (
                <tr key={q.id}>
                  <td><code>{q.id}</code></td>
                  <td>
                    {q.distributorName}{" "}
                    <span className={`tier-badge tier-${q.distributorTier}`}>
                      {q.distributorTier}
                    </span>
                  </td>
                  <td>{q.customerName}</td>
                  <td>{new Date(q.createdAt).toLocaleDateString()}</td>
                  <td>{new Date(q.expiresAt).toLocaleDateString()}</td>
                  <td>
                    <span className={`status-${q.status}`}>
                      {q.status.toUpperCase()}
                    </span>
                  </td>
                  <td>{fmt(q.total)}</td>
                  <td>
                    <button
                      className="btn-ghost"
                      onClick={() => setActiveQuote(q)}
                    >
                      Open
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      </>
      )}
    </div>
  );
}

function AdminProducts({
  token,
  onAuthFail,
}: {
  token: string;
  onAuthFail: () => void;
}) {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState({ name: "", sku: "", price: "" });
  const [submitting, setSubmitting] = useState(false);

  const reload = () => {
    setError("");
    api
      .adminProducts(token)
      .then(setProducts)
      .catch((e) => {
        setError(e.message);
        if (/authentication/i.test(e.message)) onAuthFail();
      });
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateRow = async (
    p: Product,
    patch: { name?: string; price?: number; active?: boolean }
  ) => {
    try {
      const updated = await api.adminUpdateProduct(token, p.id, patch);
      setProducts((list) =>
        (list ?? []).map((x) => (x.id === updated.id ? updated : x))
      );
    } catch (e: any) {
      setError(e.message);
    }
  };

  const addProduct = async () => {
    setError("");
    const price = parseFloat(draft.price);
    if (!draft.name.trim() || !draft.sku.trim()) {
      return setError("Name and SKU are required.");
    }
    if (!Number.isFinite(price) || price < 0) {
      return setError("Price must be a non-negative number.");
    }
    setSubmitting(true);
    try {
      const created = await api.adminCreateProduct(token, {
        name: draft.name.trim(),
        sku: draft.sku.trim(),
        price,
        active: true,
      });
      setProducts((list) => [...(list ?? []), created]);
      setDraft({ name: "", sku: "", price: "" });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Add product</h3>
        <div className="row">
          <div className="col">
            <label>Name</label>
            <input
              type="text"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="e.g. Pneumatic Drill"
            />
          </div>
          <div className="col">
            <label>SKU</label>
            <input
              type="text"
              value={draft.sku}
              onChange={(e) => setDraft({ ...draft, sku: e.target.value })}
              placeholder="e.g. HEN-PD-009"
            />
          </div>
          <div className="col">
            <label>Price (USD)</label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={draft.price}
              onChange={(e) => setDraft({ ...draft, price: e.target.value })}
              placeholder="0.00"
            />
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <button
            className="btn-primary"
            disabled={submitting}
            onClick={addProduct}
          >
            {submitting ? "Adding…" : "Add product"}
          </button>
        </div>
        {error && <p style={{ color: "#dc2626", fontSize: 14 }}>{error}</p>}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>
          Catalog {products ? `(${products.length})` : ""}
        </h3>
        {!products && <p className="muted">Loading…</p>}
        {products && products.length === 0 && (
          <p className="muted">No products yet — add one above.</p>
        )}
        {products && products.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>SKU</th>
                <th>Price</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <ProductRow key={p.id} product={p} onUpdate={updateRow} />
              ))}
            </tbody>
          </table>
        )}
        <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>
          Disabled products are hidden from the distributor catalog but remain
          on existing quotes (prices are snapshotted at quote creation).
        </p>
      </div>
    </div>
  );
}

function ProductRow({
  product,
  onUpdate,
}: {
  product: Product;
  onUpdate: (
    p: Product,
    patch: { name?: string; price?: number; active?: boolean }
  ) => Promise<void>;
}) {
  const [name, setName] = useState(product.name);
  const [price, setPrice] = useState(String(product.price));
  const dirty =
    name !== product.name || parseFloat(price) !== product.price;

  // Keep local state in sync if the parent record changes (e.g. via toggle).
  useEffect(() => {
    setName(product.name);
    setPrice(String(product.price));
  }, [product.name, product.price]);

  const save = () => {
    const parsed = parseFloat(price);
    if (!Number.isFinite(parsed) || parsed < 0) return;
    onUpdate(product, { name, price: parsed });
  };

  return (
    <tr style={{ opacity: product.active ? 1 : 0.55 }}>
      <td>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </td>
      <td>
        <code>{product.sku}</code>
      </td>
      <td>
        <input
          type="number"
          min={0}
          step="0.01"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          style={{ width: 110 }}
        />
      </td>
      <td>
        <span
          className={`status-${product.active ? "active" : "expired"}`}
          style={{ fontSize: 12 }}
        >
          {product.active ? "ACTIVE" : "DISABLED"}
        </span>
      </td>
      <td style={{ whiteSpace: "nowrap" }}>
        <button
          className="btn-primary"
          disabled={!dirty}
          onClick={save}
          style={{ marginRight: 6 }}
        >
          Save
        </button>
        <button
          className="btn-secondary"
          onClick={() => onUpdate(product, { active: !product.active })}
        >
          {product.active ? "Disable" : "Enable"}
        </button>
      </td>
    </tr>
  );
}
