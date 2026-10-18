/**
 * Cart maths shared by the till and the mock backend. Mirrors record_sale / return_sale_items
 * (supabase/migrations/20261018000400_shop_sales.sql); the database recomputes everything.
 */
import type { Unit } from '../../lib/api/types';
import { isValidQty, round2 } from '../products/logic';

export interface CartProduct {
  id: string;
  name: string;
  unit: Unit;
  sell_price: number;
  stock_qty: number;
  /** Owners only; used for the live margin line. */
  avg_cost?: number;
}

export interface CartLine {
  product: CartProduct;
  qty: number;
  discount: number;
}

export type LineProblem = 'invalid_quantity' | 'insufficient_stock' | 'discount';

export function lineGross(line: CartLine): number {
  return round2(line.qty * line.product.sell_price);
}

export function lineTotal(line: CartLine): number {
  return lineGross(line) - line.discount;
}

export function lineProblem(line: CartLine, allowNegativeStock: boolean): LineProblem | null {
  if (line.qty <= 0 || !isValidQty(line.product.unit, line.qty)) return 'invalid_quantity';
  if (!allowNegativeStock && line.qty > line.product.stock_qty) return 'insufficient_stock';
  if (line.discount < 0 || line.discount > lineGross(line) || round2(line.discount) !== line.discount) return 'discount';
  return null;
}

export interface CartTotals {
  subtotal: number;
  discount: number;
  total: number;
  /** null when cost is unknown (staff). */
  cost: number | null;
  profit: number | null;
  itemCount: number;
}

export function cartTotals(lines: readonly CartLine[], saleDiscount: number): CartTotals {
  const subtotal = round2(lines.reduce((sum, l) => sum + lineTotal(l), 0));
  const discount = Math.min(Math.max(saleDiscount, 0), subtotal);
  const total = round2(subtotal - discount);
  const knowsCost = lines.length > 0 && lines.every((l) => l.product.avg_cost !== undefined);
  const cost = knowsCost ? round2(lines.reduce((sum, l) => sum + l.qty * (l.product.avg_cost ?? 0), 0)) : null;
  return {
    subtotal,
    discount,
    total,
    cost,
    profit: cost === null ? null : round2(total - cost),
    itemCount: lines.reduce((n, l) => n + l.qty, 0),
  };
}

export function cartProblems(lines: readonly CartLine[], saleDiscount: number, allowNegativeStock: boolean) {
  const byLine = new Map<string, LineProblem>();
  for (const l of lines) {
    const p = lineProblem(l, allowNegativeStock);
    if (p) byLine.set(l.product.id, p);
  }
  const subtotal = round2(lines.reduce((sum, l) => sum + lineTotal(l), 0));
  const saleDiscountInvalid = saleDiscount < 0 || saleDiscount > subtotal || round2(saleDiscount) !== saleDiscount;
  return { byLine, saleDiscountInvalid, ok: lines.length > 0 && byLine.size === 0 && !saleDiscountInvalid };
}

/**
 * Refund for returning `qty` of a line: its share of the sale total after the sale discount.
 * The last units refund exactly what is left so rounding never leaks cents.
 */
export function refundFor(opts: {
  lineTotal: number;
  lineQty: number;
  returnedQty: number;
  alreadyRefunded: number;
  saleTotal: number;
  saleSubtotal: number;
  qty: number;
}): number {
  const net = opts.saleSubtotal > 0 ? (opts.lineTotal * opts.saleTotal) / opts.saleSubtotal : 0;
  if (opts.qty === opts.lineQty - opts.returnedQty) return round2(round2(net) - opts.alreadyRefunded);
  return round2((net * opts.qty) / opts.lineQty);
}
