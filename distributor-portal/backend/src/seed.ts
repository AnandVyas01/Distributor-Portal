import { Distributor, Product } from "../../shared/types";

export const products: Product[] = [
  { id: "1", name: "BLADE Combination Smoothbore Nozzle", sku: "HEN-BLADE-001", price: 485, active: true },
  { id: "2", name: "HYDRO Full-Ball Shutoff Valve", sku: "HEN-HYDRO-002", price: 320, active: true },
  { id: "3", name: "TURBO Hoseline Back Pressure Increaser", sku: "HEN-TURBO-003", price: 275, active: true },
  { id: "4", name: "FORCE Shutoff with Back Pressure Increaser", sku: "HEN-FORCE-004", price: 410, active: true },
  { id: "5", name: "VERSA Select Gallonage Smoothbore Nozzle", sku: "HEN-VERSA-005", price: 520, active: true },
  { id: "6", name: "TITAN PRIME Master Stream Deck Gun (1250 GPM)", sku: "HEN-TPRIME-006", price: 3200, active: true },
  { id: "7", name: "TITAN ELITE Bumper Turret", sku: "HEN-TELITE-007", price: 4100, active: true },
  { id: "8", name: "STREAM-IQ Intelligent Flow Meter", sku: "HEN-STREAMIQ-008", price: 1850, active: true },
];

export const distributors: Distributor[] = [
  { id: "d1", name: "Acme Industrial Supply", tier: "Gold", discount: 20 },
  { id: "d2", name: "Northwind Equipment Co.", tier: "Silver", discount: 10 },
  { id: "d3", name: "Pioneer Trade Partners", tier: "Bronze", discount: 5 },
];

// Demo-only credentials. In a real app these would be hashed and stored in a
// proper user table, never in seed code.
export const DEFAULT_PASSWORD = "password123";
export const distributorPasswords: Record<string, string> = {
  d1: DEFAULT_PASSWORD,
  d2: DEFAULT_PASSWORD,
  d3: DEFAULT_PASSWORD,
};

// Demo admin account.
export const ADMIN_USERNAME = "admin";
export const ADMIN_PASSWORD = "admin123";
// Static demo token. Real apps issue signed JWTs or session cookies.
export const ADMIN_TOKEN = "admin-demo-token";
