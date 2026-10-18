/**
 * Product and stock rules shared by the UI and the mock backend. They mirror the SQL
 * (supabase/migrations/20261018000300_shop_catalog_stock.sql); the database stays authoritative.
 */
import { WHOLE_UNITS, type StockStatus, type Unit } from '../../lib/api/types';

export const round2 = (n: number) => Math.round(n * 100) / 100;
export const round4 = (n: number) => Math.round(n * 10_000) / 10_000;

export function isWholeUnit(unit: Unit): boolean {
  return WHOLE_UNITS.includes(unit);
}

/** A quantity a product can be counted in: ≤ 3 decimals, whole for piece/pack/box (A3.14). */
export function isValidQty(unit: Unit, qty: number): boolean {
  if (!Number.isFinite(qty)) return false;
  if (Math.abs(qty * 1000 - Math.round(qty * 1000)) > 1e-6) return false;
  return !isWholeUnit(unit) || Number.isInteger(qty);
}

/** Weighted average cost after a restock (A3.3). */
export function weightedAverageCost(stock: number, avgCost: number, qty: number, unitCost: number): number {
  if (stock <= 0) return unitCost;
  return round4((stock * avgCost + qty * unitCost) / (stock + qty));
}

export function stockStatus(stock: number, reorderLevel: number): StockStatus {
  if (stock <= 0) return 'out';
  if (stock <= reorderLevel) return 'low';
  return 'ok';
}

export function marginPct(price: number, cost: number): number | null {
  if (price <= 0) return null;
  return Math.round(((price - cost) / price) * 1000) / 10;
}
