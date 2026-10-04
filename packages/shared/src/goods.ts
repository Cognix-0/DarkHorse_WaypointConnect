// Goods lines ("items") for an order. The competition data gives each order a unit count (crates, cartons,
// items), a weight and a volume. Loaders work from goods in packs, so every order is broken into 2–4
// product lines from a fixed catalogue. The packs on the lines always add up to the order's units, so the
// loader, the driver and the store manager all count the same thing. Deterministic: same order, same lines.
import type { Brand, Temp } from './engine/types.ts';

export interface Product {
  name: string;
  /** what one pack is called on the list */
  pack: string;
  /** how one pack is described, e.g. "5 kg", "12 × 1 L" */
  packSize: string;
  /** ordered quantity per pack, for "25 kg ordered" */
  perPack: number;
  perPackUnit: string;
  /** gross weight and volume of one pack, for store orders (capacity is checked in kg and m³) */
  packKg: number;
  packM3: number;
}

const P = (name: string, pack: string, packSize: string, perPack: number, perPackUnit: string, packKg: number, packM3: number): Product =>
  ({ name, pack, packSize, perPack, perPackUnit, packKg, packM3 });

export const CATALOGUE: Record<string, Product[]> = {
  'Fresh|chilled': [
    P('Fresh milk', 'crates', '12 × 1 L', 12, 'L', 12.5, 0.02),
    P('Buffalo curd', 'crates', '12 kg', 12, 'kg', 12.5, 0.02),
    P('Set yoghurt', 'trays', '3 kg', 3, 'kg', 3.2, 0.006),
    P('Chicken breast', 'packs', '5 kg', 5, 'kg', 5.1, 0.008),
    P('Fresh cream', 'boxes', '2 L', 2, 'L', 2.1, 0.003),
    P('Cheese block', 'blocks', '5 kg', 5, 'kg', 5, 0.006),
    P('Fish fillet', 'trays', '4 kg', 4, 'kg', 4.2, 0.007),
  ],
  'Fresh|ambient': [
    P('Rice', 'bags', '5 kg', 5, 'kg', 5, 0.006),
    P('Coconut oil', 'cartons', '6 × 1 L', 6, 'L', 6.2, 0.009),
    P('Tea', 'boxes', '20 × 400 g', 8, 'kg', 8.3, 0.02),
    P('Sugar', 'bags', '10 × 1 kg', 10, 'kg', 10, 0.012),
    P('Biscuits', 'boxes', '24 packs', 24, 'packs', 4.5, 0.03),
    P('Bottled water', 'packs', '6 × 1.5 L', 9, 'L', 9.2, 0.012),
    P('Dhal', 'bags', '10 × 1 kg', 10, 'kg', 10, 0.012),
    P('UHT milk', 'cartons', '12 × 1 L', 12, 'L', 12.4, 0.016),
    P('Vegetables', 'crates', '10 kg', 10, 'kg', 10.5, 0.04),
  ],
  'Style|ambient': [
    P('T-shirts', 'cartons', '40 pcs', 40, 'pcs', 12, 0.08),
    P('Denim', 'cartons', '24 pcs', 24, 'pcs', 18, 0.09),
    P('Footwear', 'cartons', '12 pairs', 12, 'pairs', 15, 0.12),
    P('Accessories', 'cartons', '60 pcs', 60, 'pcs', 8, 0.06),
    P('Dresses', 'cartons', '30 pcs', 30, 'pcs', 10, 0.08),
  ],
  'Tech|ambient': [
    P('Smartphones', 'items', '1 boxed unit', 1, 'units', 0.5, 0.002),
    P('Laptops', 'items', '1 boxed unit', 1, 'units', 3, 0.01),
    P('LED TV 43"', 'items', '1 boxed unit', 1, 'units', 12, 0.09),
    P('Microwave ovens', 'items', '1 boxed unit', 1, 'units', 14, 0.06),
    P('Electric kettles', 'items', '1 boxed unit', 1, 'units', 1.5, 0.008),
  ],
};

export interface GoodsLine {
  seq: number;
  product: string;
  pack: string;
  packSize: string;
  packs: number;
  /** "25 kg ordered", "360 L ordered" */
  ordered: string;
  /** share of the order weight, for reports ("2 packs = 10 kg") */
  weightKg: number;
}

/** Stable small hash so the same order always gets the same products. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const fmtQty = (n: number) => (Number.isInteger(n) ? n.toLocaleString('en-US') : n.toLocaleString('en-US', { maximumFractionDigits: 1 }));

/**
 * Breaks an order into goods lines. Packs sum exactly to `units`; weight is shared in proportion.
 * @param key a stable key for the order (its id or source reference)
 */
export function goodsLinesFor(key: string, brand: Brand, temp: Temp, units: number, weightKg: number): GoodsLine[] {
  const list = CATALOGUE[`${brand}|${brand === 'Fresh' ? temp : 'ambient'}`] ?? CATALOGUE['Fresh|ambient']!;
  const h = hash(key);
  const count = Math.max(1, Math.min(units, 2 + (h % 3), list.length));
  const start = h % list.length;
  const products = Array.from({ length: count }, (_, i) => list[(start + i * 3) % list.length]!);
  // uneven but stable split: weights 3,2,2,1...
  const shares = products.map((_, i) => 4 - Math.min(i, 3) + ((h >> (i * 3)) % 2));
  const total = shares.reduce((s, x) => s + x, 0);
  const packs = shares.map((s) => Math.max(1, Math.floor((units * s) / total)));
  // fix the rounding so packs add up to units exactly
  let diff = units - packs.reduce((s, x) => s + x, 0);
  for (let i = 0; diff !== 0 && i < 1000; i++) {
    const j = i % packs.length;
    if (diff > 0) { packs[j]!++; diff--; } else if (packs[j]! > 1) { packs[j]!--; diff++; }
  }
  return products.map((p, i) => ({
    seq: i + 1,
    product: p.name,
    pack: p.pack,
    packSize: p.packSize,
    packs: packs[i]!,
    ordered: `${fmtQty(packs[i]! * p.perPack)} ${p.perPackUnit} ordered`,
    weightKg: Math.round((weightKg * packs[i]!) / Math.max(1, units) * 10) / 10,
  }));
}

/** What a store orders from, by brand and temperature (Style and Tech are ambient only). */
export const catalogueFor = (brand: Brand, temp: Temp): Product[] => CATALOGUE[`${brand}|${brand === 'Fresh' ? temp : 'ambient'}`] ?? [];

export function addProductToCatalogue(brand: Brand, temp: Temp, product: Product): Product {
  const key = `${brand}|${brand === 'Fresh' ? temp : 'ambient'}`;
  if (!CATALOGUE[key]) {
    CATALOGUE[key] = [];
  }
  const idx = CATALOGUE[key]!.findIndex((p) => p.name.toLowerCase() === product.name.toLowerCase());
  if (idx >= 0) {
    CATALOGUE[key]![idx] = product;
  } else {
    CATALOGUE[key]!.push(product);
  }
  return product;
}

/** "Dry groceries", "Chilled", "Apparel", "Electronics" */
export const orderTypeLabel = (brand: Brand, temp: Temp) => (brand === 'Fresh' ? (temp === 'chilled' ? 'Chilled' : 'Dry groceries') : brand === 'Style' ? 'Apparel' : 'Electronics');

/** Lines for an order a store manager typed in (packs per product). Unknown products are skipped. */
export function storeOrderLines(brand: Brand, temp: Temp, picks: { product: string; packs: number }[]) {
  const list = catalogueFor(brand, temp);
  const lines = picks
    .filter((p) => p.packs > 0)
    .map((p) => ({ p, prod: list.find((x) => x.name === p.product) }))
    .filter((x): x is { p: { product: string; packs: number }; prod: Product } => !!x.prod)
    .map(({ p, prod }, i) => ({
      seq: i + 1, product: prod.name, pack: prod.pack, packSize: prod.packSize, packs: p.packs,
      ordered: `${fmtQty(p.packs * prod.perPack)} ${prod.perPackUnit} ordered`,
      weightKg: Math.round(p.packs * prod.packKg * 10) / 10,
      volumeM3: Math.round(p.packs * prod.packM3 * 1000) / 1000,
    }));
  return {
    lines,
    units: lines.reduce((n, l) => n + l.packs, 0),
    weightKg: Math.round(lines.reduce((n, l) => n + l.weightKg, 0) * 10) / 10,
    volumeM3: Math.round(lines.reduce((n, l) => n + l.volumeM3, 0) * 100) / 100,
  };
}
