import { useEffect, useReducer } from 'react';
import type { Customer, PaymentMethod } from '../../lib/api/types';
import type { CartLine, CartProduct } from './logic';

export interface CartState {
  /** Idempotency key for record_sale: stays the same across retries until the sale succeeds. */
  clientRef: string;
  lines: CartLine[];
  discount: number;
  paymentMethod: PaymentMethod;
  customer: Pick<Customer, 'id' | 'name' | 'balance'> | null;
  note: string;
}

type Action =
  | { type: 'add'; product: CartProduct; qty: number }
  | { type: 'setQty'; productId: string; qty: number }
  | { type: 'setLineDiscount'; productId: string; discount: number }
  | { type: 'remove'; productId: string }
  | { type: 'setDiscount'; discount: number }
  | { type: 'setPayment'; method: PaymentMethod }
  | { type: 'setCustomer'; customer: CartState['customer'] }
  | { type: 'setNote'; note: string }
  | { type: 'clear' };

const KEY = 'shop_cart_v1';

function fresh(): CartState {
  return { clientRef: crypto.randomUUID(), lines: [], discount: 0, paymentMethod: 'cash', customer: null, note: '' };
}

function load(): CartState {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as CartState;
      if (parsed && Array.isArray(parsed.lines) && typeof parsed.clientRef === 'string') return parsed;
    }
  } catch {
    /* storage unavailable or corrupt */
  }
  return fresh();
}

export function cartReducer(state: CartState, action: Action): CartState {
  switch (action.type) {
    case 'add': {
      const existing = state.lines.find((l) => l.product.id === action.product.id);
      const lines = existing
        ? state.lines.map((l) => (l.product.id === action.product.id ? { ...l, product: action.product, qty: Math.round((l.qty + action.qty) * 1000) / 1000 } : l))
        : [...state.lines, { product: action.product, qty: action.qty, discount: 0 }];
      return { ...state, lines };
    }
    case 'setQty':
      return {
        ...state,
        lines: action.qty <= 0 ? state.lines.filter((l) => l.product.id !== action.productId) : state.lines.map((l) => (l.product.id === action.productId ? { ...l, qty: action.qty } : l)),
      };
    case 'setLineDiscount':
      return { ...state, lines: state.lines.map((l) => (l.product.id === action.productId ? { ...l, discount: action.discount } : l)) };
    case 'remove':
      return { ...state, lines: state.lines.filter((l) => l.product.id !== action.productId) };
    case 'setDiscount':
      return { ...state, discount: action.discount };
    case 'setPayment':
      return { ...state, paymentMethod: action.method };
    case 'setCustomer':
      return { ...state, customer: action.customer };
    case 'setNote':
      return { ...state, note: action.note };
    case 'clear':
      return fresh();
  }
}

export function useCart() {
  const [state, dispatch] = useReducer(cartReducer, undefined, load);
  useEffect(() => {
    try {
      window.sessionStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }, [state]);
  return [state, dispatch] as const;
}
