export type Tier = "Gold" | "Silver" | "Bronze";

export interface Product {
  id: string;
  name: string;
  sku: string;
  price: number;
  active: boolean;
}

export interface Distributor {
  id: string;
  name: string;
  tier: Tier;
  discount: number;
}

export interface LineItem {
  sku: string;
  qty: number;
}

export interface QuoteLineItem {
  sku: string;
  name: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
}

export interface Quote {
  id: string;
  distributorId: string;
  distributorName: string;
  distributorTier: Tier;
  customerName: string;
  lineItems: QuoteLineItem[];
  subtotal: number;
  tierDiscountPct: number;
  tierDiscountAmount: number;
  volumeDiscountPct: number;
  volumeDiscountAmount: number;
  total: number;
  createdAt: string;
  expiresAt: string;
  status: "active" | "expired";
}

export interface CreateQuoteRequest {
  distributorId: string;
  customerName: string;
  lineItems: LineItem[];
}
