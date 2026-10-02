// SM2 / D-SM2 · Place order (before the 16:00 cutoff). Weight and volume are shown because they decide the vehicle.
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ErrorBox, Loading } from '../../ui/States';
import { useToast } from '../../ui/Toast';
import { cx, shortDate, singular } from '../../ui/format';
import { useCatalogue, usePlaceOrder, useToday } from './api';
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
  const [qty, setQty] = useState<Record<string, number>>({});
  const [note, setNote] = useState('');

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

  return (
    <Page
      title={`Order for ${dayName(d.deliveryDate)}`}
      sub={d.cutoff.open ? `Orders close at 4:00 PM today · ${leftText(d.cutoff.minutesLeft)} left` : `Today's 4:00 PM cutoff has passed, so this order goes on the ${shortDate(d.deliveryDate)} run`}
      pill={<span className="h-7 px-3 rounded-full bg-st-navy text-white text-[13px] font-semibold grid place-items-center">{d.cutoff.open ? 'Closes 4:00 PM' : 'After cutoff'}</span>}
    >
      <div className="grid gap-5 lg:grid-cols-[1fr_360px] items-start">
        <Panel className="p-0 overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 px-5 py-4 border-b border-st-bar">
            {fresh ? (['ambient', 'chilled'] as const).map((t) => (
              <button key={t} onClick={() => setTemp(t)} aria-pressed={temp === t}
                className={cx('h-9 px-4 rounded-full text-[13px] font-semibold', temp === t ? 'bg-primary-tint text-st-navy' : 'text-st-muted')}>
                {t === 'ambient' ? 'Dry' : 'Chilled'}{temp === t ? ` · ${totals.lines} items` : ''}
              </button>
            )) : <span className="text-[13px] font-semibold text-st-navy">{d.typeLabel}</span>}
            {d.lastOrderDate && (
              <button className="ml-auto text-[13px] font-semibold text-teal" onClick={() => setQty(Object.fromEntries(d.products.map((p) => [p.product, p.lastPacks])))}>
                ↺ Copy last order ({shortDate(d.lastOrderDate)})
              </button>
            )}
          </div>
          <div className="hidden md:grid grid-cols-[1.6fr_0.9fr_0.8fr_150px_80px] gap-3 px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-st-muted border-b border-st-bar">
            <span>Item</span><span>Pack</span><span>Last order</span><span>Quantity</span><span className="text-right">Weight</span>
          </div>
          <ul>
            {d.products.map((p) => {
              const n = qty[p.product] ?? 0;
              return (
                <li key={p.product} className="grid grid-cols-[1fr_auto] md:grid-cols-[1.6fr_0.9fr_0.8fr_150px_80px] gap-x-3 gap-y-1 items-center px-5 py-3.5 border-b border-line-soft">
                  <strong className="text-[15px] font-medium text-st-ink">{p.product}</strong>
                  <span className="text-[14px] text-st-muted md:block hidden">{p.packSize} {singular(p.pack)}</span>
                  <span className="text-[14px] text-st-muted md:block hidden">{p.lastPacks ? `${p.lastPacks} ${p.pack}` : '—'}</span>
                  <div className="row-span-2 md:row-span-1 flex items-center gap-1 justify-self-end md:justify-self-start">
                    <button className="h-10 w-10 rounded-full border border-st-bar text-[18px] font-semibold text-st-navy" aria-label={`One less ${p.product}`} onClick={() => set(p.product, n - 1)}>−</button>
                    <input className="w-12 h-10 text-center text-[16px] font-bold tabular bg-transparent" inputMode="numeric" value={n} aria-label={`${p.product} packs`} onChange={(e) => set(p.product, Number(e.target.value.replace(/\D/g, '')) || 0)} />
                    <button className="h-10 w-10 rounded-full border border-st-bar text-[18px] font-semibold text-st-navy" aria-label={`One more ${p.product}`} onClick={() => set(p.product, n + 1)}>+</button>
                  </div>
                  <span className="text-xs text-st-muted md:hidden">{p.packSize} · last {p.lastPacks || '—'}</span>
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
    </Page>
  );
}
