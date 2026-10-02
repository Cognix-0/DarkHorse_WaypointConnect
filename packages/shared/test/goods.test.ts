import { test } from 'node:test';
import assert from 'node:assert/strict';
import { goodsLinesFor, storeOrderLines } from '../src/goods.ts';

test('goods lines: packs always add up to the order units', () => {
  for (const [units, kg] of [[1, 8], [2, 20], [12, 98], [192, 1258], [547, 2742], [31, 517]] as const) {
    for (const brand of ['Fresh', 'Style', 'Tech'] as const) {
      const lines = goodsLinesFor(`ORD-${units}-${brand}`, brand, 'chilled', units, kg);
      assert.equal(lines.reduce((s, l) => s + l.packs, 0), units, `${brand} ${units}`);
      assert.ok(lines.every((l) => l.packs >= 1));
      assert.ok(lines.length <= units);
    }
  }
});

test('goods lines are stable and follow the brand and temperature', () => {
  const a = goodsLinesFor('S1-001', 'Fresh', 'chilled', 80, 448.6);
  assert.deepEqual(a, goodsLinesFor('S1-001', 'Fresh', 'chilled', 80, 448.6));
  assert.ok(a.every((l) => ['Fresh milk', 'Buffalo curd', 'Set yoghurt', 'Chicken breast', 'Fresh cream', 'Cheese block', 'Fish fillet'].includes(l.product)));
  const t = goodsLinesFor('S1-020', 'Tech', 'ambient', 5, 900);
  assert.ok(t.every((l) => l.pack === 'items'));
  assert.ok(Math.abs(a.reduce((s, l) => s + l.weightKg, 0) - 448.6) < 1);
});

test('store orders: weight and volume come from the pack, units are the packs', () => {
  const o = storeOrderLines('Fresh', 'ambient', [{ product: 'Rice', packs: 4 }, { product: 'Sugar', packs: 3 }, { product: 'Nope', packs: 9 }, { product: 'Tea', packs: 0 }]);
  assert.equal(o.lines.length, 2);
  assert.equal(o.units, 7);
  assert.equal(o.weightKg, 4 * 5 + 3 * 10);
  assert.equal(o.lines[0]!.ordered, '20 kg ordered');
  assert.equal(storeOrderLines('Fresh', 'chilled', [{ product: 'Rice', packs: 2 }]).units, 0, 'dry goods are not on the chilled list');
});
