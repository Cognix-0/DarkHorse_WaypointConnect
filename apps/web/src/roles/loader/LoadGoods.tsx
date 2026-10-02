// L2 · Load goods, with L3 (report a problem) and L5 (seal & release) as pop-ups over the list.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { TGoodsLineDto, TLoadAction, TLoaderStopDto, TLoaderTripDetail, TLoadProblem } from '@waypoint/shared/contract';
import { Badge, brandTone } from '../../ui/Badge';
import { compressImage } from '../../offline/image';
import { ErrorBox, Loading } from '../../ui/States';
import { useToast } from '../../ui/Toast';
import { cx, num, shortDate } from '../../ui/format';
import { useReport, useSeal, useTick, useTrip } from './api';
import { LAST_TRIP } from './LoaderApp';

const done = (l: TGoodsLineDto) => !!l.loadedAt || l.shortPacks >= l.packs;
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const toMin = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
const one = (p: string) => (p.endsWith('xes') ? p.slice(0, -2) : p.replace(/s$/, ''));
const ORD = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'];

export function LoadGoods() {
  const { tripId = '' } = useParams();
  const q = useTrip(tripId);
  const tick = useTick();
  const nav = useNavigate();
  const toast = useToast();
  const [report, setReport] = useState<{ lineId: string | null } | null>(null);
  const [sealing, setSealing] = useState(false);
  const [open, setOpen] = useState<Record<number, boolean>>({});
  useEffect(() => { localStorage.setItem(LAST_TRIP, tripId); }, [tripId]);

  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <ErrorBox error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data;
  const c = d.card;
  const lines = d.stops.flatMap((s) => s.lines);
  const nDone = lines.filter(done).length;
  const left = lines.length - nDone;
  const sealed = c.status === 'sealed' || c.status === 'departed';
  const nextLine = d.stops.flatMap((s) => s.lines).find((l) => !done(l));
  const minsLeft = toMin(c.sealBy) - toMin(d.now);

  async function toggle(l: TGoodsLineDto) {
    if (sealed || l.shortPacks >= l.packs) return;
    try { await tick.mutateAsync({ lineId: l.id, loaded: !l.loadedAt }); }
    catch (e) { toast({ tone: 'bad', title: 'Not saved', body: (e as Error).message }); }
  }

  return (
    <div>
      <header className="flex flex-wrap items-start gap-3 mb-4">
        <div className="grid gap-1 mr-auto">
          <h1 className="text-[22px] font-bold text-nav">Load goods · {c.vehicleId} · Bay {c.bay}</h1>
          <p className="text-[12.5px] text-ink-3">Trip {c.tripNo} · {c.kind.toLowerCase()} · departs {c.departAt} · driver {d.driverName ?? '—'} · plan v{d.planVersion} · {d.now}</p>
        </div>
        <button className="h-10 px-4 rounded-lg border border-line-strong bg-surface text-[13.5px] font-semibold" onClick={() => nav('/loader')}>Change vehicle</button>
      </header>

      <div className="grid gap-3.5 xl:grid-cols-[1fr_288px] items-start">
        <section className="card overflow-hidden" aria-label="Goods list">
          <div className="flex items-start gap-4 px-4 py-3.5 border-b border-line">
            <div className="grid gap-0.5">
              <h2 className="text-[15px] font-bold text-nav">Goods list</h2>
              <p className="text-xs text-ink-3">Goods come in packs. Load the number of packs shown, then tick the line. Load the last stop first.</p>
            </div>
            <strong className="ml-auto text-[12.5px] text-nav whitespace-nowrap">{nDone} of {lines.length} items loaded</strong>
          </div>
          {d.stops.map((s) => {
            const sDone = s.lines.filter(done).length;
            const collapsed = sDone === s.lines.length && !open[s.stopSeq];
            return (
              <div key={s.orderId}>
                <StopHead s={s} count={d.stops.length} sDone={sDone} collapsed={collapsed} onToggle={() => setOpen((o) => ({ ...o, [s.stopSeq]: !o[s.stopSeq] }))} />
                {!collapsed && s.lines.map((l) => (
                  <LineRow key={l.id} l={l} isNext={nextLine?.id === l.id} disabled={sealed} onTick={() => toggle(l)} onReport={() => setReport({ lineId: l.id })} />
                ))}
              </div>
            );
          })}
        </section>

        <aside className="grid gap-3.5">
          <section className="card p-4">
            <h2 className="text-[14px] font-bold text-nav">Progress</h2>
            <p className="mt-2"><strong className="text-[34px] font-extrabold text-nav tabular">{nDone}</strong> <span className="text-[15px] font-semibold text-ink-3">/ {lines.length} items</span></p>
            <ul className="grid gap-2 mt-2 text-[12.5px]">
              {d.stops.map((s) => {
                const sDone = s.lines.filter(done).length;
                return (
                  <li key={s.orderId} className="flex items-center gap-2">
                    <i className={cx('h-2 w-2 rounded-full', sDone === s.lines.length ? 'bg-ok-bright' : sDone ? 'bg-primary' : 'bg-line-strong')} />
                    <span className="font-medium text-ink-2">Stop {s.stopSeq} · {s.outletId}</span>
                    <span className="ml-auto font-semibold text-nav">{sDone === s.lines.length ? 'Done' : sDone ? `${sDone} of ${s.lines.length}` : 'Waiting'}</span>
                  </li>
                );
              })}
            </ul>
          </section>
          <section className="card p-4 grid gap-2">
            <h2 className="text-[14px] font-bold text-nav">Goods on this vehicle</h2>
            <div className="flex gap-1.5">
              {c.brands.map((b) => <Badge key={b} tone={brandTone(b)}>{b}</Badge>)}
              {c.temps.map((t) => <Badge key={t} tone={t === 'chilled' ? 'chill' : 'neutral'} className="capitalize">{t}</Badge>)}
            </div>
            <p className="text-[12.5px] font-semibold text-ink-2">{d.stops.length} orders · {lines.length} items · {num(c.weightKg)} kg</p>
            <p className="text-xs text-ink-3">{c.temps.includes('chilled') ? 'Chilled goods. Keep the reefer at 2–4 °C and the doors closed between loads.' : 'Ambient goods. Heavy packs at the bottom, cartons upright.'}</p>
          </section>
          <section className="card p-4 grid gap-2.5 text-[12.5px]">
            <h2 className="text-[14px] font-bold text-nav">{c.vehicleId} · {c.kind.toLowerCase()}</h2>
            {d.reefer && <Row k="Reefer" v={<Badge tone="ok" className="h-5 text-[11.5px]">{d.reefer.lastTempC != null ? `${d.reefer.lastTempC} °C · ` : ''}set {d.reefer.range}</Badge>} />}
            <Row k="Departs" v={<strong className="text-[13px] text-nav">{c.departAt}</strong>} />
            <Row k="Seal by" v={sealed ? <Badge tone="ok" className="h-5 text-[11.5px]">Sealed</Badge> : <Badge tone={minsLeft < 0 ? 'bad' : 'warn'} className="h-5 text-[11.5px]">{c.sealBy} · {minsLeft < 0 ? `${-minsLeft} min late` : `${minsLeft} min left`}</Badge>} />
            <Row k="Driver" v={<strong className="text-[13px] text-nav">{d.driverName ?? '—'}</strong>} />
          </section>
          {!sealed && (
            <>
              <button className="h-[52px] rounded-[10px] border border-bad-soft bg-surface text-bad-text text-[15px] font-semibold" onClick={() => setReport({ lineId: null })}>Report a problem</button>
              <button className={cx('h-[52px] rounded-[10px] text-[15px] font-semibold', left ? 'bg-offline-soft text-ink-3' : 'bg-primary text-white')} disabled={left > 0} onClick={() => setSealing(true)}>
                {left ? `Seal & release · ${left} item${left === 1 ? '' : 's'} left` : `Seal & release ${c.vehicleId}`}
              </button>
            </>
          )}
          {sealed && <p className="text-[13px] font-medium text-ok card p-4">Sealed{d.sealNo ? ` · seal ${d.sealNo}` : ''}. The driver confirms on the phone and leaves.</p>}
        </aside>
      </div>

      {report && <ReportModal d={d} lineId={report.lineId} onClose={() => setReport(null)} />}
      {sealing && <SealModal d={d} onClose={() => setSealing(false)} />}
    </div>
  );
}

const Row = ({ k, v }: { k: string; v: ReactNode }) => (
  <div className="flex items-center"><span className="text-ink-3">{k}</span><span className="ml-auto">{v}</span></div>
);

function StopHead({ s, count, sDone, collapsed, onToggle }: { s: TLoaderStopDto; count: number; sDone: number; collapsed: boolean; onToggle: () => void }) {
  const label = s.loadOrder === count ? 'Load last' : `Load ${ORD[s.loadOrder - 1]}`;
  const all = sDone === s.lines.length;
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 bg-sunk border-y border-line">
      <span className={cx('grid place-items-center h-7 min-w-[34px] px-1 rounded-md text-[10.5px] font-bold', all ? 'bg-ok-bright text-white' : sDone ? 'bg-primary text-white' : 'bg-line text-ink-2')}>{all ? '✓' : ORD[s.loadOrder - 1]}</span>
      <div className="grid gap-0.5 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <strong className="text-[13.5px] text-nav">{label} · Stop {s.stopSeq} · {s.outletId} {s.district}</strong>
          <Badge tone={brandTone(s.brand)} className="h-5 text-[11.5px]">{s.brand}</Badge>
          <Badge tone={s.temp === 'chilled' ? 'chill' : 'neutral'} className="h-5 text-[11.5px] capitalize">{s.temp}</Badge>
        </div>
        <span className="text-[11.5px] text-ink-3">{s.orderRef} · window {s.windowOpen}–{s.windowClose} · {num(s.weightKg)} kg{s.newInVersion ? ` · new in plan v${s.newInVersion}` : ''}</span>
      </div>
      <span className={cx('ml-auto text-[11.5px] font-semibold whitespace-nowrap', all ? 'text-ok' : sDone ? 'text-primary' : 'text-ink-3')}>{sDone} of {s.lines.length}{all ? ' loaded' : ''}</span>
      {all && <button className="text-xs font-semibold text-primary" onClick={onToggle}>{collapsed ? 'Show' : 'Hide'}</button>}
    </div>
  );
}

function LineRow({ l, isNext, disabled, onTick, onReport }: { l: TGoodsLineDto; isNext: boolean; disabled: boolean; onTick: () => void; onReport: () => void }) {
  const ok = !!l.loadedAt;
  const loadPacks = l.packs - l.shortPacks;
  return (
    <div className={cx('flex items-center gap-3 pl-4 pr-3 min-h-[50px] border-b border-line-soft', isNext && 'bg-primary-tint')}>
      <button role="checkbox" aria-checked={ok} aria-label={`${l.product} loaded`} disabled={disabled || l.shortPacks >= l.packs} onClick={onTick}
        className={cx('h-7 w-7 rounded-md border-2 grid place-items-center shrink-0', ok ? 'bg-ok-bright border-ok-bright text-white' : 'border-line-strong bg-surface')}>{ok ? '✓' : ''}</button>
      <div className="grid min-w-0 flex-1 cursor-pointer" onClick={disabled ? undefined : onTick}>
        <span className={cx('text-[13.5px] font-semibold', ok ? 'text-ink-2' : 'text-nav')}>{l.product}</span>
        <span className="text-[11.5px] text-ink-3">{l.ordered} · {l.packSize} {one(l.pack)}</span>
      </div>
      <div className="grid text-right w-[110px]">
        <strong className="text-[14px] text-nav tabular">{loadPacks} {l.pack}</strong>
        <span className="text-[11px] text-ink-3">{l.shortPacks ? <span className="text-warn font-semibold">{l.shortPacks} short</span> : `${l.packSize} each`}</span>
      </div>
      <div className="w-[96px] text-center text-[11.5px]">
        {l.shortPacks > 0 ? <Badge tone="warn" className="h-5 text-[11px]">{l.shortPacks} short</Badge>
          : ok ? <span className="font-medium text-ok">Loaded {hhmm(l.loadedAt!)}</span>
            : isNext ? <Badge tone="info" className="h-5 text-[11px]">Next</Badge> : <span className="text-ink-3">—</span>}
      </div>
      <button className="h-9 w-9 rounded-lg grid place-items-center text-bad-text font-extrabold hover:bg-bad-tint disabled:opacity-30" aria-label={`Report a problem with ${l.product}`} disabled={disabled} onClick={onReport}>!</button>
    </div>
  );
}

const PROBLEMS: [TLoadProblem, string, string][] = [
  ['damaged', 'Damaged goods', 'crushed, leaking or torn'],
  ['short', 'Short or missing packs', 'fewer packs than the list'],
  ['wrong_pack', 'Wrong pack size', 'e.g. 2 kg packs, not 5 kg'],
  ['no_space', "Doesn't fit in the vehicle", 'no space left'],
  ['wrong_temp', 'Wrong temperature', 'goods or reefer too warm'],
  ['vehicle', 'Vehicle problem', 'doors, reefer unit, tyres'],
  ['other', 'Other', 'type what happened'],
];
const ACTIONS: [TLoadAction, string][] = [
  ['carry_over', 'Load the rest, send the missing packs tomorrow'],
  ['replace', 'Replace from stock before departure'],
  ['hold', 'Hold the vehicle for the dispatcher'],
];

function Modal({ title, sub, onClose, children, footer, width = 540 }: { title: string; sub: string; onClose: () => void; children: ReactNode; footer: ReactNode; width?: number }) {
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-nav/55 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} className="bg-surface rounded-[14px] w-full max-h-[92vh] overflow-auto shadow-toast" style={{ maxWidth: width }}>
        <div className="flex items-start gap-3 px-6 pt-5">
          <div className="grid gap-1"><h2 className="text-[19px] font-bold text-nav">{title}</h2><p className="text-[12.5px] text-ink-3">{sub}</p></div>
          <button className="ml-auto h-9 w-9 rounded-lg border border-line text-ink-3 text-lg" aria-label="Close" onClick={onClose}>×</button>
        </div>
        <div className="px-6 pt-4 pb-2 grid gap-3">{children}</div>
        <div className="mx-6 py-4 border-t border-line-soft flex items-center gap-2.5 [&>button]:whitespace-nowrap">{footer}</div>
      </div>
    </div>
  );
}

function ReportModal({ d, lineId, onClose }: { d: TLoaderTripDetail; lineId: string | null; onClose: () => void }) {
  const report = useReport();
  const toast = useToast();
  const all = d.stops.flatMap((s) => s.lines.map((l) => ({ l, s })));
  const [problem, setProblem] = useState<TLoadProblem | ''>('');
  const [line, setLine] = useState(lineId ?? '');
  const [packs, setPacks] = useState(1);
  const [action, setAction] = useState<TLoadAction | ''>('');
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pick = all.find((x) => x.l.id === line);
  const max = pick?.l.packs ?? 1;
  const ready = problem && pick && action && (problem !== 'other' || note.trim());
  const perPackKg = pick ? pick.l.weightKg / Math.max(1, pick.l.packs) : 0;

  async function send() {
    if (!ready || !pick) return;
    try {
      await report.mutateAsync({ tripId: d.card.tripId, lineId: pick.l.id, problem: problem as TLoadProblem, packs, action: action as TLoadAction, note: note.trim() || undefined, photo: photo ?? undefined });
      toast({ tone: 'ok', title: 'Report sent', body: `The dispatcher, the driver and store ${pick.s.outletId} are told.` });
      onClose();
    } catch (e) { toast({ tone: 'bad', title: 'Not sent', body: (e as Error).message }); }
  }

  const sel = 'w-full h-12 rounded-lg border border-line-strong bg-surface px-3.5 text-[14px] font-semibold text-nav';
  return (
    <Modal title="Report a problem" sub={`${d.card.vehicleId} · Bay ${d.card.bay} · departs ${d.card.departAt} · ${d.now}`} onClose={onClose}
      footer={<>
        <span className="text-xs text-ink-3 mr-auto">{pick ? `The dispatcher, the driver and store ${pick.s.outletId} are told.` : 'The dispatcher, the driver and the store are told.'}</span>
        <button className="h-10 px-4 rounded-lg border border-line-strong text-[13.5px] font-semibold" onClick={onClose}>Cancel</button>
        <button className={cx('h-10 px-4 rounded-lg text-[13.5px] font-semibold', ready ? 'bg-primary text-white' : 'bg-offline-soft text-ink-3')} disabled={!ready || report.isPending} onClick={send}>Send report</button>
      </>}>
      <label className="grid gap-1.5 text-[12.5px] font-semibold text-ink-2">What happened?
        <select className={sel} value={problem} onChange={(e) => setProblem(e.target.value as TLoadProblem)}>
          <option value="" disabled>Choose a problem</option>
          {PROBLEMS.map(([id, label, hint]) => <option key={id} value={id}>{label} — {hint}</option>)}
        </select>
      </label>
      <label className="grid gap-1.5 text-[12.5px] font-semibold text-ink-2">Which item?
        <select className={sel} value={line} onChange={(e) => { setLine(e.target.value); setPacks(1); }}>
          <option value="" disabled>Choose the goods line</option>
          {all.map(({ l, s }) => <option key={l.id} value={l.id}>{l.product} · {l.packs} {l.pack} of {l.packSize} · Stop {s.stopSeq}, {s.outletId}</option>)}
        </select>
      </label>
      <div className="grid gap-1.5">
        <span className="text-[12.5px] font-semibold text-ink-2">How many {pick?.l.pack ?? 'packs'}?</span>
        <div className="flex items-center gap-3">
          <div className="flex rounded-[10px] border border-line-strong overflow-hidden">
            <button className="h-12 w-12 bg-sunk text-xl" aria-label="One less" onClick={() => setPacks((p) => Math.max(1, p - 1))}>−</button>
            <span className="h-12 w-14 grid place-items-center text-[20px] font-bold border-x border-line-strong tabular">{packs}</span>
            <button className="h-12 w-12 bg-sunk text-xl" aria-label="One more" onClick={() => setPacks((p) => Math.min(max, p + 1))}>+</button>
          </div>
          {pick && <span className="text-[12.5px] text-ink-3">{pick.l.pack} of {pick.l.packSize} ({Math.round(perPackKg * packs)} kg) · {pick.l.packs - packs} {pick.l.pack} still go on the truck</span>}
        </div>
      </div>
      <label className="grid gap-1.5 text-[12.5px] font-semibold text-ink-2">What should happen?
        <select className={sel} value={action} onChange={(e) => setAction(e.target.value as TLoadAction)}>
          <option value="" disabled>Choose what happens next</option>
          {ACTIONS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
      </label>
      {pick && action === 'carry_over' && <p className="text-xs text-ink-3">{d.card.vehicleId} still leaves at {d.card.departAt}. The {packs} {pick.l.pack} go on tomorrow&apos;s loading list for {pick.s.outletId}, unless the dispatcher finds a vehicle today. The store is told before it opens.</p>}
      {pick && action === 'replace' && <p className="text-xs text-ink-3">Take {packs} {pick.l.pack} from stock, then tick the line. If that delays the seal past {d.card.sealBy}, the dispatcher sees it.</p>}
      {action === 'hold' && <p className="text-xs text-ink-3">{d.card.vehicleId} stays at Bay {d.card.bay} until the dispatcher decides. The driver is told not to leave.</p>}
      <div className="flex gap-2.5">
        <button className="h-12 w-16 rounded-lg border border-line-strong overflow-hidden text-[11px] font-semibold text-ink-3 grid place-items-center shrink-0" onClick={() => fileRef.current?.click()} aria-label="Add photo">
          {photo ? <img src={photo} alt="Problem" className="h-full w-full object-cover" /> : '+ Photo'}
        </button>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setPhoto(await compressImage(f, 800)); }} />
        <input className="flex-1 h-12 rounded-lg border border-line-strong px-3 text-[12.5px]" placeholder={problem === 'other' ? 'Say what happened (required)' : 'Add a note (optional)'} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
      </div>
    </Modal>
  );
}

function SealModal({ d, onClose }: { d: TLoaderTripDetail; onClose: () => void }) {
  const seal = useSeal();
  const toast = useToast();
  const nav = useNavigate();
  const lines = d.stops.flatMap((s) => s.lines.map((l) => ({ l, s })));
  const short = lines.filter((x) => x.l.shortPacks > 0);
  const loaded = lines.length - short.filter((x) => x.l.shortPacks >= x.l.packs).length;
  const [temp, setTemp] = useState<string>(d.reefer ? '3.1' : '');
  const [sealNo, setSealNo] = useState('');
  const [note, setNote] = useState(short.length
    ? `Load ${short.map((x) => `${x.l.shortPacks} × ${x.l.packSize} ${x.l.product.toLowerCase()} ${x.l.pack} for ${x.s.outletId} (${x.s.orderRef})`).join('; ')} on the first run. Short on ${shortDate(d.date)}; dispatcher and store already told.`
    : '');
  const minsLeft = toMin(d.card.sealBy) - toMin(d.now);
  const tempNum = temp.trim() === '' ? null : Number(temp);
  const tempBad = d.reefer && (tempNum == null || Number.isNaN(tempNum));
  const tempWarn = d.reefer && tempNum != null && (tempNum < 2 || tempNum > 4);

  async function go() {
    try {
      const r = await seal.mutateAsync({ tripId: d.card.tripId, sealNo: sealNo.trim(), reeferTempC: d.reefer ? tempNum : null, carryOverNote: note.trim() || undefined });
      toast({ tone: 'ok', title: `${d.card.vehicleId} sealed and released`, body: r.carried.length ? `Carried to the next run: ${r.carried.join(', ')}.` : 'The driver can confirm and leave.' });
      onClose();
      nav('/loader');
    } catch (e) { toast({ tone: 'bad', title: 'Not sealed', body: (e as Error).message }); }
  }

  const checks = [
    'All goods ticked, loaded in stop order',
    d.stops.some((s) => s.newInVersion) ? `Plan v${d.planVersion} changes done · ${d.stops.filter((s) => s.newInVersion).map((s) => s.outletId).join(', ')} added` : `Working from plan v${d.planVersion}`,
    d.reefer ? `Reefer temperature logged · ${temp || '—'} °C at ${d.now}` : 'Ambient load · no reefer',
    'Load bars fitted · rear doors closed',
  ];
  return (
    <Modal width={600} title={`Seal & release ${d.card.vehicleId}`} sub={`Bay ${d.card.bay} · departs ${d.card.departAt} · driver ${d.driverName ?? '—'} · ${d.now}`} onClose={onClose}
      footer={<>
        <span className={cx('text-xs font-medium mr-auto', minsLeft >= 0 ? 'text-ok' : 'text-warn')}>{minsLeft >= 0 ? `On time · seal due by ${d.card.sealBy}` : `${-minsLeft} min past the ${d.card.sealBy} seal time`}</span>
        <button className="h-10 px-4 rounded-lg border border-line-strong text-[13.5px] font-semibold" onClick={onClose}>Cancel</button>
        <button className="h-10 px-4 rounded-lg bg-primary text-white text-[13.5px] font-semibold disabled:opacity-50" disabled={seal.isPending || sealNo.trim().length < 3 || !!tempBad} onClick={go}>Seal &amp; release {d.card.vehicleId}</button>
      </>}>
      <div className="grid grid-cols-3 gap-2.5">
        <div className="rounded-lg bg-ok-tint px-3 py-2"><strong className="text-[19px] font-extrabold text-ok">{loaded}</strong><p className="text-[11.5px] font-medium text-ink-2">items loaded</p></div>
        <div className="rounded-lg bg-warn-tint px-3 py-2"><strong className="text-[19px] font-extrabold text-warn">{short.length}</strong><p className="text-[11.5px] font-medium text-ink-2">item{short.length === 1 ? '' : 's'} short{short.length ? ` · ${short.reduce((n, x) => n + x.l.shortPacks, 0)} packs` : ''}</p></div>
        <label className="rounded-lg bg-chill-tint px-3 py-2">
          {d.reefer ? (
            <span className="flex items-baseline gap-1"><input className="w-14 bg-transparent text-[19px] font-extrabold text-chill tabular" inputMode="decimal" value={temp} onChange={(e) => setTemp(e.target.value)} aria-label="Reefer temperature at seal" /><span className="text-[15px] font-bold text-chill">°C</span></span>
          ) : <strong className="text-[19px] font-extrabold text-chill">—</strong>}
          <p className={cx('text-[11.5px] font-medium', tempWarn ? 'text-warn' : 'text-ink-2')}>{d.reefer ? (tempWarn ? 'outside 2–4 °C' : 'reefer at seal') : 'no reefer'}</p>
        </label>
      </div>
      <ul className="grid gap-1.5 pl-1">
        {checks.map((c) => <li key={c} className="flex items-center gap-2 text-[12.5px] text-ink-2"><span className="text-ok font-bold">✓</span>{c}</li>)}
      </ul>
      {short.length > 0 && (
        <section className="rounded-[10px] border border-warn-line bg-warn-tint p-4 grid gap-2.5">
          <strong className="flex items-center gap-2 text-[14px] text-warn"><span className="grid place-items-center h-5 w-5 rounded-full bg-warn text-white text-xs">!</span>Not loaded · goes on the next run</strong>
          {short.map(({ l, s }) => (
            <div key={l.id} className="rounded-lg bg-surface border border-warn-line px-3 py-2 flex items-center">
              <div className="grid"><strong className="text-[13px] text-nav">{l.product} · {l.shortPacks} {l.pack} of {l.packSize}</strong><span className="text-[11.5px] text-ink-3">{s.outletId} {s.district} · {s.orderRef} · {l.problem ?? 'short'}</span></div>
              <Badge tone="warn" className="ml-auto">Next run</Badge>
            </div>
          ))}
          <label className="grid gap-1.5 text-xs font-semibold text-ink-2">Note for the next loader
            <textarea className="rounded-lg border border-line-strong bg-surface px-3 py-2 text-[12.5px] font-normal min-h-[52px]" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
          </label>
        </section>
      )}
      <label className="grid gap-1.5 text-[12.5px] font-semibold text-ink-2">Seal number (scan or type)
        <input className="h-12 rounded-lg border border-line-strong px-3.5 text-[15px] font-semibold tracking-wider uppercase" value={sealNo} onChange={(e) => setSealNo(e.target.value)} placeholder="e.g. SL-004471" autoFocus />
      </label>
    </Modal>
  );
}
