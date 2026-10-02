// M6 · Report a problem at a stop (can't deliver).
import { useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import type { TFailReason } from '@waypoint/shared/contract';
import { compressImage } from '../../offline/image';
import { cx } from '../../ui/format';
import { useDriver, uuid } from './store';
import { BigButton, findStop, Notice, Screen } from './ui';

const OPTIONS: [TFailReason, string][] = [
  ['shop_closed', 'Store closed / no one to receive'],
  ['refused', 'Store refused the delivery'],
  ['damaged_missing', 'Goods damaged or missing'],
  ['no_access', 'Vehicle cannot reach the outlet'],
  ['other', 'Other'],
];

export function ReportProblem() {
  const { stopId } = useParams();
  const loc = useLocation();
  const d = useDriver();
  const nav = useNavigate();
  const f = findStop(d.route, stopId ?? '');
  const pre = new URLSearchParams(loc.search).get('reason') as TFailReason | null;
  const [reason, setReason] = useState<TFailReason | null>(pre);
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  if (!f) return <Screen title="Report a problem"><Notice title="Stop not found" /></Screen>;
  const { stop } = f;

  async function send() {
    if (!reason) return;
    await d.enqueue({ eventId: uuid(), type: 'stop.failed', stopId: stop.stopId, occurredAt: new Date().toISOString(), reason, note: note.trim() || undefined, photoBase64: photo ?? undefined },
      `Problem · ${stop.outlet.id} ${stop.outlet.district}`);
    nav('/driver/run');
  }

  return (
    <Screen
      title="Report a problem"
      sub={`${stop.outlet.id} · ${stop.outlet.district} · Stop ${stop.seq}`}
      footer={<BigButton onClick={send} disabled={!reason || (reason === 'other' && !note.trim())}>Send report to dispatcher</BigButton>}
    >
      <p className="text-[12px] font-semibold text-drv-muted">What happened?</p>
      <div className="grid gap-2" role="radiogroup" aria-label="What happened?">
        {OPTIONS.map(([id, label]) => (
          <button key={id} role="radio" aria-checked={reason === id} onClick={() => setReason(id)}
            className={cx('min-h-[52px] rounded-[10px] border px-4 flex items-center gap-3 text-left text-[14px]', reason === id ? 'border-drv-primary border-2 bg-drv-tint font-semibold' : 'border-drv-line bg-white font-medium')}>
            <span className={cx('h-5 w-5 rounded-full border-2 grid place-items-center shrink-0', reason === id ? 'border-drv-primary' : 'border-drv-radio')} aria-hidden="true">
              {reason === id && <span className="h-2.5 w-2.5 rounded-full bg-drv-primary" />}
            </span>
            {label}
          </button>
        ))}
      </div>
      {(reason === 'other' || reason) && (
        <textarea className="w-full min-h-[64px] rounded-[10px] border border-drv-line px-3 py-2 text-[14px]" placeholder={reason === 'other' ? 'Say what happened (required)' : 'Add a note (optional)'} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
      )}
      <BigButton secondary onClick={() => fileRef.current?.click()}>{photo ? 'Photo added ✓ · retake' : 'Add photo (optional)'}</BigButton>
      <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={async (e) => { const fl = e.target.files?.[0]; if (fl) setPhoto(await compressImage(fl)); }} />
      <section className="rounded-xl border border-drv-tintLine bg-drv-tint p-4 grid gap-1.5">
        <strong className="text-[12px] text-primary">What happens next</strong>
        <ul className="text-[12px] grid gap-1 list-disc pl-4">
          <li>The dispatcher sees this {d.online ? 'now' : 'as soon as you have signal'} and can re-sequence or move it to the next run.</li>
          <li>The store manager gets a notice with your reason.</li>
          <li>The order is logged, so it is not lost or delivered twice.</li>
        </ul>
      </section>
    </Screen>
  );
}
