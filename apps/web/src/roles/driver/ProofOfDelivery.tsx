// M5 · Proof of delivery: outcome, count, photo, receiver and signature. Saved on the phone first.
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { compressImage } from '../../offline/image';
import { cx } from '../../ui/format';
import { useDriver, uuid } from './store';
import { BigButton, Card, findStop, Notice, Screen } from './ui';

export function ProofOfDelivery() {
  const { stopId } = useParams();
  const d = useDriver();
  const nav = useNavigate();
  const f = findStop(d.route, stopId ?? '');
  const expected = f ? f.stop.units - f.stop.shortUnits : 0;
  const [outcome, setOutcome] = useState<'delivered' | 'partial'>('delivered');
  const [units, setUnits] = useState(expected);
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoAt, setPhotoAt] = useState<string | null>(null);
  const [receiver, setReceiver] = useState(f?.stop.managerName ?? '');
  const [signature, setSignature] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  if (!f) return <Screen title="Confirm delivery"><Notice title="Stop not found" /></Screen>;
  const { stop } = f;
  const partial = outcome === 'partial' || units < expected;

  async function onPhoto(file?: File) {
    if (!file) return;
    setPhoto(await compressImage(file));
    setPhotoAt(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
  }
  async function confirm() {
    setBusy(true);
    await d.enqueue({
      eventId: uuid(), type: 'stop.delivered', stopId: stop.stopId, occurredAt: new Date().toISOString(),
      outcome: partial ? 'partial' : 'delivered', receiverName: receiver.trim(), deliveredUnits: units,
      photoBase64: photo ?? undefined, signatureBase64: signature ?? undefined,
    }, `POD · ${stop.outlet.id} ${stop.outlet.district}`);
    nav('/driver/run');
  }

  return (
    <Screen
      title="Confirm delivery"
      sub={`${stop.outlet.id} · ${stop.orderRef}`}
      footer={
        <>
          <BigButton onClick={confirm} disabled={busy || !receiver.trim() || units < 0}>Confirm delivery</BigButton>
          <p className="text-[12px] text-drv-muted text-center">Saves to this phone first · syncs when signal allows</p>
        </>
      }
    >
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-drv-soft p-1" role="radiogroup" aria-label="Outcome">
        {(['delivered', 'partial', 'refused'] as const).map((o) => (
          <button key={o} role="radio" aria-checked={o === outcome}
            onClick={() => (o === 'refused' ? nav(`/driver/stop/${stop.stopId}/problem?reason=refused`) : (setOutcome(o), o === 'delivered' && setUnits(expected)))}
            className={cx('h-11 rounded-[9px] text-[14px] capitalize', o === outcome ? 'bg-white border border-drv-line font-semibold text-drv-ink' : 'font-medium text-drv-muted')}>
            {o}
          </button>
        ))}
      </div>

      <Card>
        <span className="text-[13px] font-semibold text-drv-muted">{stop.unitLabel.replace(/^./, (c) => c.toUpperCase())} received</span>
        <div className="flex items-center justify-between mt-2">
          <button className="h-12 w-12 rounded-full border border-drv-line text-[22px]" aria-label="One less" onClick={() => { setUnits((u) => Math.max(0, u - 1)); setOutcome('partial'); }}>−</button>
          <div className="text-center">
            <strong className="text-[32px] font-bold tabular">{units}</strong>
            <p className="text-[12px] text-drv-muted">of {expected} loaded</p>
          </div>
          <button className="h-12 w-12 rounded-full border border-drv-line text-[22px]" aria-label="One more" onClick={() => setUnits((u) => Math.min(expected, u + 1))}>+</button>
        </div>
      </Card>

      <Card>
        <span className="text-[13px] font-semibold text-drv-muted">Photo of goods</span>
        <div className="flex items-center gap-3 mt-2">
          <button onClick={() => fileRef.current?.click()} className="h-16 w-16 rounded-[10px] bg-drv-thumb overflow-hidden grid place-items-center text-[11px] font-semibold text-drv-muted" aria-label="Take a photo">
            {photo ? <img src={photo} alt="Delivered goods" className="h-full w-full object-cover" /> : '+ Photo'}
          </button>
          <div className="grid">
            <strong className="text-[14px]">{photo ? '1 photo attached' : 'No photo yet'}</strong>
            <span className="text-[12px] text-drv-muted">{photo ? `Taken ${photoAt}` : 'Tap to open the camera'}</span>
          </div>
        </div>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onPhoto(e.target.files?.[0])} />
      </Card>

      <Card>
        <label className="text-[13px] font-semibold text-drv-muted" htmlFor="receiver">Received by</label>
        <input id="receiver" className="mt-2 w-full h-11 px-3 rounded-[10px] border border-drv-line bg-drv-field text-[15px] font-medium" value={receiver} onChange={(e) => setReceiver(e.target.value)} autoComplete="off" />
        <SignaturePad onChange={setSignature} />
      </Card>
    </Screen>
  );
}

function SignaturePad({ onChange }: { onChange: (dataUrl: string | null) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [empty, setEmpty] = useState(true);
  useEffect(() => {
    const c = ref.current!;
    const ratio = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * ratio;
    c.height = c.offsetHeight * ratio;
    const ctx = c.getContext('2d')!;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#111827';
  }, []);
  const pos = (e: PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as const;
  };
  return (
    <div className="mt-3">
      <div className="relative">
        <canvas
          ref={ref}
          className="w-full h-24 rounded-[10px] border border-dashed border-drv-sign touch-none bg-white"
          aria-label="Signature"
          onPointerDown={(e) => { drawing.current = true; e.currentTarget.setPointerCapture(e.pointerId); const ctx = e.currentTarget.getContext('2d')!; const [x, y] = pos(e); ctx.beginPath(); ctx.moveTo(x, y); }}
          onPointerMove={(e) => { if (!drawing.current) return; const ctx = e.currentTarget.getContext('2d')!; const [x, y] = pos(e); ctx.lineTo(x, y); ctx.stroke(); }}
          onPointerUp={(e) => { drawing.current = false; setEmpty(false); onChange(e.currentTarget.toDataURL('image/png')); }}
        />
        {empty && <span className="pointer-events-none absolute inset-0 grid place-items-center text-[12px] text-drv-muted">Sign here</span>}
      </div>
      {!empty && (
        <button className="mt-1 text-[12px] font-semibold text-drv-primary" onClick={() => { const c = ref.current!; c.getContext('2d')!.clearRect(0, 0, c.width, c.height); setEmpty(true); onChange(null); }}>
          Clear signature
        </button>
      )}
    </div>
  );
}
