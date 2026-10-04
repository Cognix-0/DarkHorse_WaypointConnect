// SM2 / D-SM2 · Place order (before the 16:00 cutoff). Weight and volume are shown because they decide the vehicle.
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ErrorBox, Loading } from '../../ui/States';
import { useToast } from '../../ui/Toast';
import { cx, shortDate, singular } from '../../ui/format';
import { useAddProduct, useCatalogue, usePlaceOrder, useToday } from './api';
import { Page } from './StoreApp';
import { Btn, dayName, leftText, Panel } from './ui';

export function PlaceOrder() {
  const loc = useLocation();
  const nav = useNavigate();
  const toast = useToast();
  const today = useToday();
  const [temp, setTemp] = useState(new URLSearchParams(loc.search).get('temp') === 'chilled' ? 'chilled' : 'ambient');
  const q = useCatalogue(temp);
  const place = usePlaceOrder();
  const addProductMutation = useAddProduct();
  const [qty, setQty] = useState<Record<string, number>>({});
  const [note, setNote] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  // New product modal form state
  const [newName, setNewName] = useState('');
  const [newPack, setNewPack] = useState('cartons');
  const [newPackSize, setNewPackSize] = useState('12 × 1 L');
  const [newPerPack, setNewPerPack] = useState(12);
  const [newPerPackUnit, setNewPerPackUnit] = useState('L');
  const [newPackKg, setNewPackKg] = useState(10);
  const [newPackM3, setNewPackM3] = useState(0.015);
  const [adding, setAdding] = useState(false);

  // Start from the order already placed for that day (edit), else empty.
  useEffect(() => {
    if (!q.data) return;
    setQty(Object.fromEntries((q.data.existing?.lines ?? []).map((l) => [l.product, l.packs])));
  }, [q.data]);

  const totals = useMemo(() => {
    const p = q.data?.products ?? [];
    return p.reduce((a, x) => {
      const n = qty[x.product] ?? 0;
      return { packs: a.packs + n, kg: a.kg + n * x.packKg, m3: a.m3 + n * x.packM3, lines: a.lines + (n > 0 ? 1 : 0) };
    }, { packs: 0, kg: 0, m3: 0, lines: 0 });
  }, [q.data, qty]);

  if (q.isLoading) return <Page title="Place order"><Loading /></Page>;
  if (q.error || !q.data) return <Page title="Place order"><ErrorBox error={q.error} onRetry={() => q.refetch()} /></Page>;
  const d = q.data;
  const fresh = today.data?.outlet.brand === 'Fresh';
  const set = (p: string, n: number) => setQty((x) => ({ ...x, [p]: Math.max(0, Math.min(999, n)) }));

  async function submit() {
    try {
      const r = await place.mutateAsync({ temp, lines: d.products.map((p) => ({ product: p.product, packs: qty[p.product] ?? 0 })).filter((l) => l.packs > 0), note: note.trim() || undefined });
      toast({ tone: 'ok', title: `${d.typeLabel} order ${d.existing ? 'updated' : 'received'}`, body: `Ref ${r.order.ref} · ${r.order.units} ${r.order.unitLabel}` });
      nav(`/store/orders/${r.order.id}?placed=1`);
    } catch (e) { toast({ tone: 'bad', title: 'Order not sent', body: (e as Error).message }); }
  }

  function handleAutoSuggest() {
    if (!d) return;
    const suggestedQty = Object.fromEntries(
      d.products.map((p) => [p.product, p.suggestedPacks ?? 0])
    );
    setQty(suggestedQty);
    toast({
      tone: 'ok',
      title: '✨ Order Auto-Suggested',
      body: d.suggestionSummary || 'Quantities pre-filled based on store demand trends & safety buffer.',
    });
  }

  async function handleAddProduct(e: FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setAdding(true);
    try {
      await addProductMutation.mutateAsync({
        temp,
        name: newName.trim(),
        pack: newPack.trim(),
        packSize: newPackSize.trim(),
        perPack: Number(newPerPack) || 1,
        perPackUnit: newPerPackUnit.trim(),
        packKg: Number(newPackKg) || 1,
        packM3: Number(newPackM3) || 0.01,
      });
      toast({ tone: 'ok', title: 'Product added', body: `"${newName.trim()}" is now available in your catalogue.` });
      set(newName.trim(), 1);
      setNewName('');
      setShowAddModal(false);
      q.refetch();
    } catch (err) {
      toast({ tone: 'bad', title: 'Failed to add product', body: (err as Error).message });
    } finally {
      setAdding(false);
    }
  }

  return (
    <Page
      title={`Order for ${dayName(d.deliveryDate)}`}
      sub={d.cutoff.open ? `Orders close at 4:00 PM today · ${leftText(d.cutoff.minutesLeft)} left` : `Today's 4:00 PM cutoff has passed, so this order goes on the ${shortDate(d.deliveryDate)} run`}
      pill={<span className="h-7 px-3 rounded-full bg-st-navy text-white text-[13px] font-semibold grid place-items-center">{d.cutoff.open ? 'Closes 4:00 PM' : 'After cutoff'}</span>}
    >
      {/* Auto-Suggest Recommendation Banner */}
      {d.suggestionSummary && (
        <div className="bg-gradient-to-r from-indigo-50 via-purple-50 to-pink-50 border border-purple-200 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-purple-600 text-white flex items-center justify-center text-lg shadow-sm">✨</span>
            <div>
              <h4 className="text-sm font-bold text-purple-950">Smart Auto-Suggestion Ready</h4>
              <p className="text-xs text-purple-800">{d.suggestionSummary}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleAutoSuggest}
            className="h-9 px-4 rounded-xl bg-purple-700 hover:bg-purple-800 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-sm cursor-pointer"
          >
            <span>✨</span> Apply Suggested Quantities
          </button>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_360px] items-start">
        <Panel className="p-0 overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 px-5 py-4 border-b border-st-bar">
            {fresh ? (['ambient', 'chilled'] as const).map((t) => (
              <button key={t} onClick={() => setTemp(t)} aria-pressed={temp === t}
                className={cx('h-9 px-4 rounded-full text-[13px] font-semibold', temp === t ? 'bg-primary-tint text-st-navy' : 'text-st-muted')}>
                {t === 'ambient' ? 'Dry' : 'Chilled'}{temp === t ? ` · ${totals.lines} items` : ''}
              </button>
            )) : <span className="text-[13px] font-semibold text-st-navy">{d.typeLabel}</span>}

            <div className="ml-auto flex items-center gap-2.5">
              <button
                type="button"
                onClick={handleAutoSuggest}
                className="h-9 px-3 rounded-lg bg-purple-600 text-white text-xs font-bold hover:bg-purple-700 transition flex items-center gap-1.5 shadow-xs cursor-pointer"
                title="Automatically pre-fill order quantities based on past demand velocity"
              >
                <span>✨</span> Auto-Suggest Order
              </button>

              <button
                type="button"
                onClick={() => setShowAddModal(true)}
                className="h-9 px-3 rounded-lg bg-teal text-white text-xs font-bold hover:brightness-110 transition flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                <span>+</span> Add New Product
              </button>

              {d.lastOrderDate && (
                <button className="text-[13px] font-semibold text-teal hover:underline cursor-pointer" onClick={() => setQty(Object.fromEntries(d.products.map((p) => [p.product, p.lastPacks])))}>
                  ↺ Copy last order
                </button>
              )}
            </div>
          </div>
          <div className="hidden md:grid grid-cols-[1.6fr_0.9fr_1fr_150px_80px] gap-3 px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-st-muted border-b border-st-bar">
            <span>Item</span><span>Pack</span><span>Last / Suggested</span><span>Quantity</span><span className="text-right">Weight</span>
          </div>
          <ul>
            {d.products.map((p) => {
              const n = qty[p.product] ?? 0;
              return (
                <li key={p.product} className="grid grid-cols-[1fr_auto] md:grid-cols-[1.6fr_0.9fr_1fr_150px_80px] gap-x-3 gap-y-1 items-center px-5 py-3.5 border-b border-line-soft">
                  <strong className="text-[15px] font-medium text-st-ink">{p.product}</strong>
                  <span className="text-[14px] text-st-muted md:block hidden">{p.packSize} {singular(p.pack)}</span>

                  {/* Last order & Suggested column */}
                  <div className="text-[13px] text-st-muted md:flex items-center gap-2 hidden">
                    <span>{p.lastPacks ? `${p.lastPacks} ${p.pack}` : '—'}</span>
                    {p.suggestedPacks > 0 && (
                      <span
                        className="text-[11px] font-semibold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md border border-purple-200 flex items-center gap-1"
                        title={p.suggestionReason}
                      >
                        ✨ {p.suggestedPacks}
                      </span>
                    )}
                  </div>

                  <div className="row-span-2 md:row-span-1 flex items-center gap-1 justify-self-end md:justify-self-start">
                    <button className="h-10 w-10 rounded-full border border-st-bar text-[18px] font-semibold text-st-navy cursor-pointer" aria-label={`One less ${p.product}`} onClick={() => set(p.product, n - 1)}>−</button>
                    <input className="w-12 h-10 text-center text-[16px] font-bold tabular bg-transparent" inputMode="numeric" value={n} aria-label={`${p.product} packs`} onChange={(e) => set(p.product, Number(e.target.value.replace(/\D/g, '')) || 0)} />
                    <button className="h-10 w-10 rounded-full border border-st-bar text-[18px] font-semibold text-st-navy cursor-pointer" aria-label={`One more ${p.product}`} onClick={() => set(p.product, n + 1)}>+</button>
                  </div>

                  <span className="text-xs text-st-muted md:hidden">
                    {p.packSize} · last {p.lastPacks || '—'} {p.suggestedPacks ? `(✨ suggested: ${p.suggestedPacks})` : ''}
                  </span>

                  <span className="hidden md:block text-right text-[14px] font-medium text-st-ink tabular">{n ? `${Math.round(n * p.packKg)} kg` : '—'}</span>
                </li>
              );
            })}
          </ul>
        </Panel>

        <div className="grid gap-4 lg:sticky lg:top-[110px]">
          <Panel className="grid gap-3">
            <h2 className="text-[17px] font-semibold text-st-ink">Order summary</h2>
            <dl className="grid grid-cols-[1fr_auto] gap-y-2 text-[14px]">
              <dt className="text-st-muted">Packs</dt><dd className="font-bold text-st-navy tabular">{totals.packs}</dd>
              <dt className="text-st-muted">Weight</dt><dd className="font-bold text-st-navy tabular">{Math.round(totals.kg)} kg</dd>
              <dt className="text-st-muted">Volume</dt><dd className="font-bold text-st-navy tabular">{totals.m3.toFixed(1)} m³</dd>
            </dl>
            <p className="text-xs text-st-muted">Weight and volume decide which vehicle can carry this order, so the dispatcher sees them with it.</p>
            <textarea className="rounded-lg border border-st-bar px-3 py-2 text-[13px] min-h-[56px]" placeholder="Note for the dispatcher (optional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
            <Btn onClick={submit} disabled={!totals.packs || place.isPending}>{d.existing ? `Update ${temp === 'chilled' ? 'chilled' : 'dry'} order` : `Submit ${fresh ? (temp === 'chilled' ? 'chilled' : 'dry') : ''} order`.replace('  ', ' ')}</Btn>
            <Btn kind="outline" onClick={() => nav('/store')}>Back to today</Btn>
          </Panel>
          <Panel tone="teal" className="grid gap-1">
            <strong className="text-[13px] text-st-navy">Until 4:00 PM</strong>
            <p className="text-xs text-st-ink">You can edit or add to orders until the cutoff. Later orders wait for the following run.</p>
          </Panel>
        </div>
      </div>

      {/* Modal: Add New Product */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-surface border border-st-bar rounded-2xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-6 py-4 border-b border-st-bar bg-st-navy text-white">
              <h3 className="text-lg font-bold">Add New Product</h3>
              <button type="button" onClick={() => setShowAddModal(false)} className="text-white/70 hover:text-white text-lg font-bold px-2 cursor-pointer">✕</button>
            </div>
            <form onSubmit={handleAddProduct} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-st-muted mb-1">Product Name *</label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Organic Butter / Crisps / Smart Watch"
                  className="w-full h-10 px-3 border border-st-bar rounded-xl text-sm text-st-ink bg-white focus:outline-none focus:border-teal transition"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-st-muted mb-1">Pack Type *</label>
                  <input
                    type="text"
                    required
                    value={newPack}
                    onChange={(e) => setNewPack(e.target.value)}
                    placeholder="cartons, crates, boxes, bags..."
                    className="w-full h-10 px-3 border border-st-bar rounded-xl text-sm text-st-ink bg-white focus:outline-none focus:border-teal transition"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-st-muted mb-1">Pack Size Description *</label>
                  <input
                    type="text"
                    required
                    value={newPackSize}
                    onChange={(e) => setNewPackSize(e.target.value)}
                    placeholder="e.g. 12 × 1 L or 10 kg"
                    className="w-full h-10 px-3 border border-st-bar rounded-xl text-sm text-st-ink bg-white focus:outline-none focus:border-teal transition"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-st-muted mb-1">Units per Pack *</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={newPerPack}
                    onChange={(e) => setNewPerPack(Number(e.target.value))}
                    className="w-full h-10 px-3 border border-st-bar rounded-xl text-sm text-st-ink bg-white focus:outline-none focus:border-teal transition"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-st-muted mb-1">Unit Label *</label>
                  <input
                    type="text"
                    required
                    value={newPerPackUnit}
                    onChange={(e) => setNewPerPackUnit(e.target.value)}
                    placeholder="kg, L, pcs, units"
                    className="w-full h-10 px-3 border border-st-bar rounded-xl text-sm text-st-ink bg-white focus:outline-none focus:border-teal transition"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-st-muted mb-1">Weight per Pack (kg) *</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    required
                    value={newPackKg}
                    onChange={(e) => setNewPackKg(Number(e.target.value))}
                    className="w-full h-10 px-3 border border-st-bar rounded-xl text-sm text-st-ink bg-white focus:outline-none focus:border-teal transition"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-st-muted mb-1">Volume per Pack (m³) *</label>
                  <input
                    type="number"
                    step="0.001"
                    min="0.0001"
                    required
                    value={newPackM3}
                    onChange={(e) => setNewPackM3(Number(e.target.value))}
                    className="w-full h-10 px-3 border border-st-bar rounded-xl text-sm text-st-ink bg-white focus:outline-none focus:border-teal transition"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-st-bar">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 h-10 rounded-xl border border-st-bar text-sm font-semibold text-st-muted hover:bg-sunk transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={adding}
                  className="px-5 h-10 rounded-xl bg-teal text-white text-sm font-semibold hover:brightness-110 transition disabled:opacity-50 cursor-pointer"
                >
                  {adding ? 'Adding...' : 'Save Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Page>
  );
}
