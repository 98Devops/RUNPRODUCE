'use client';

import { useState, useTransition, type FormEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import type { IsoDate } from '@runproduce/engine';
import { submitPlacementAction } from '@/app/(farm)/start/actions';
import { liveSummary, NAME_MAX, type SummaryFields } from '@/lib/start/placement';

const INPUT =
  'h-14 w-full rounded-md border border-line-strong bg-surface px-4 text-xl text-ink outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30';
const LABEL = 'text-sm font-medium';
const PRIMARY =
  'h-14 w-full rounded-md bg-accent text-lg font-medium text-surface transition-colors hover:bg-accent-hover active:translate-y-px disabled:opacity-60';
const SECONDARY =
  'h-14 w-full rounded-md border border-line-strong bg-surface text-lg font-medium transition-colors hover:bg-raised active:translate-y-px disabled:opacity-60';
const OFFLINE = 'No connection. Nothing was saved. Try again.';

export type StartFormProps =
  | {
      readonly kind: 'start';
      readonly today: IsoDate;
      readonly curves: readonly { readonly id: string; readonly name: string }[];
    }
  | {
      readonly kind: 'correct';
      readonly today: IsoDate;
      readonly batch: { readonly batchId: string; readonly code: string; readonly placementVersionId: string };
      readonly initial: Omit<SummaryFields, 'name'>;
    };

/**
 * The Start batch form and its confirm step (U8 D2, D11, D12). Every figure it
 * sends is text as typed; the server reads it and decides. Save asks the server
 * to check first, and only an entry that passed every check reaches the
 * confirm step. Go back keeps every value.
 */
export function StartForm(props: StartFormProps) {
  const router = useRouter();
  const correcting = props.kind === 'correct';
  const [fields, setFields] = useState<SummaryFields>(() =>
    props.kind === 'correct'
      ? { name: props.batch.code, ...props.initial }
      : { name: '', placementDate: '', chickCount: '', extraChickCount: '', chickPrice: '' }
  );
  const onlyCurve = props.kind === 'start' && props.curves.length === 1 ? props.curves[0] : undefined;
  const [curveId, setCurveId] = useState(onlyCurve?.id ?? '');
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [confirm, setConfirm] = useState<readonly string[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Any change is a new entry with its own id; only an unchanged retry reuses one (AD-75).
  function change(patch: Partial<SummaryFields>) {
    setFields((f) => ({ ...f, ...patch }));
    setRequestId(crypto.randomUUID());
    setMessage(null);
  }

  function payload(mode: 'check' | 'save') {
    const figures = {
      mode,
      placementDate: fields.placementDate,
      chickCount: fields.chickCount,
      extraChickCount: fields.extraChickCount,
      chickPrice: fields.chickPrice,
      clientRequestId: requestId
    };
    return props.kind === 'correct'
      ? { kind: 'correct', batchId: props.batch.batchId, supersedesId: props.batch.placementVersionId, ...figures }
      : { kind: 'start', name: fields.name, curveId, ...figures };
  }

  function send(mode: 'check' | 'save') {
    startTransition(async () => {
      try {
        const result = await submitPlacementAction(payload(mode));
        if (result.kind === 'refused') {
          // A refusal shows on the form, never on the confirm step (D12).
          setConfirm(null);
          setMessage(result.message);
          return;
        }
        if (result.kind === 'confirm') {
          setConfirm(result.confirm);
          return;
        }
        router.push(`/today?batch=${encodeURIComponent(result.code)}`);
      } catch {
        setConfirm(null);
        setMessage(OFFLINE);
      }
    });
  }

  function check(event: FormEvent) {
    event.preventDefault();
    send('check');
  }

  if (confirm !== null) {
    return (
      <section aria-labelledby="confirm-heading" className="grid gap-5">
        <h2 id="confirm-heading" className="text-xl font-semibold tracking-tight">
          {correcting ? 'Save this correction?' : 'Save this batch?'}
        </h2>
        <ul className="grid gap-2 rounded-lg border border-line-strong bg-surface p-4">
          {confirm.map((line) => (
            <li key={line} className="figures text-lg leading-snug">
              {line}
            </li>
          ))}
        </ul>
        <div className="grid gap-3">
          <button type="button" className={PRIMARY} disabled={pending} onClick={() => send('save')}>
            {pending ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            className={SECONDARY}
            disabled={pending}
            onClick={() => {
              setConfirm(null);
              setRequestId(crypto.randomUUID());
            }}
          >
            Go back
          </button>
        </div>
      </section>
    );
  }

  const summary = liveSummary(fields, props.today);

  return (
    <form onSubmit={check} className="grid gap-6" noValidate>
      {correcting ? (
        <p className="text-lg">
          Batch <span className="font-semibold">{fields.name}</span>. Its name can’t be changed.
        </p>
      ) : (
        <Field id="name" label="Batch name" hint={`up to ${NAME_MAX} characters`}>
          <input
            id="name"
            className={INPUT}
            value={fields.name}
            maxLength={NAME_MAX + 10}
            autoComplete="off"
            onChange={(e) => change({ name: e.target.value })}
          />
        </Field>
      )}

      <Field id="placementDate" label="Day the chicks arrived" hint={null}>
        <input
          id="placementDate"
          type="date"
          className={`figures ${INPUT}`}
          value={fields.placementDate}
          max={props.today}
          onChange={(e) => change({ placementDate: e.target.value })}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field id="chickCount" label="Chicks placed" hint={null}>
          <input
            id="chickCount"
            inputMode="numeric"
            className={`figures ${INPUT}`}
            value={fields.chickCount}
            autoComplete="off"
            onChange={(e) => change({ chickCount: e.target.value })}
          />
        </Field>
        <Field id="extraChickCount" label="Extra chicks" hint={null}>
          <input
            id="extraChickCount"
            inputMode="numeric"
            className={`figures ${INPUT}`}
            value={fields.extraChickCount}
            autoComplete="off"
            aria-describedby="extras-hint"
            onChange={(e) => change({ extraChickCount: e.target.value })}
          />
        </Field>
      </div>
      <p id="extras-hint" className="-mt-4 text-sm text-muted">
        Extras are the hatchery’s chicks on top of the order. Type 0 if there were none.
      </p>

      <Field id="chickPrice" label="Price per chick, $" hint={null}>
        <input
          id="chickPrice"
          inputMode="decimal"
          className={`figures ${INPUT}`}
          value={fields.chickPrice}
          autoComplete="off"
          onChange={(e) => change({ chickPrice: e.target.value })}
        />
      </Field>

      {props.kind === 'start' &&
        (onlyCurve !== undefined ? (
          <p className="text-lg">
            <span className="text-muted">Growth curve:</span> {onlyCurve.name}
          </p>
        ) : (
          <Field id="curve" label="Growth curve" hint={null}>
            <select
              id="curve"
              className={INPUT}
              value={curveId}
              onChange={(e) => {
                setCurveId(e.target.value);
                setRequestId(crypto.randomUUID());
                setMessage(null);
              }}
            >
              <option value="">Choose…</option>
              {props.curves.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        ))}

      <p aria-live="polite" className="figures min-h-6 text-lg leading-snug text-muted">
        {summary}
      </p>

      <p role="alert" aria-live="polite" className="min-h-5 text-lg text-[var(--state-error)]">
        {message}
      </p>

      <button type="submit" className={PRIMARY} disabled={pending}>
        {pending ? 'Checking…' : correcting ? 'Save correction' : 'Save batch'}
      </button>
    </form>
  );
}

function Field({
  id,
  label,
  hint,
  children
}: {
  readonly id: string;
  readonly label: string;
  readonly hint: string | null;
  readonly children: ReactNode;
}) {
  return (
    <div className="grid gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className={LABEL}>
          {label}
        </label>
        {hint !== null && <span className="shrink-0 text-sm text-muted">{hint}</span>}
      </div>
      {children}
    </div>
  );
}
