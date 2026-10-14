'use client';

import { useEffect, useState, useTransition, type FormEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import type { Phase } from '@runproduce/engine';
import { removeDayAction, saveDayAction } from '@/app/(farm)/today/actions';
import { clearDraft, phoneStorage, readDraft, writeDraft, type Draft } from '@/lib/today/draft';
import type { TodayView } from '@/lib/today/view';

const PHASE_LABEL: Record<Phase, string> = { STARTER: 'Starter', GROWER: 'Grower', FINISHER: 'Finisher' };
const OFFLINE = 'No connection. Your entry is kept on this phone.';

const INPUT =
  'h-14 w-full rounded-md border border-line-strong bg-surface px-4 text-xl text-ink outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30';
const LABEL = 'text-sm font-medium';
const QUIET_BUTTON =
  'h-11 rounded-md px-3 text-lg font-medium text-accent underline decoration-accent/40 underline-offset-4 hover:decoration-accent';
const TOGGLE =
  'flex h-12 w-full items-center justify-between rounded-md border border-line bg-surface px-4 text-left text-lg font-medium';

function initialDraft(view: TodayView): Draft {
  const e = view.existing;
  const carried = view.previous !== null && (e === null || e.culls === view.previous.culls);
  return {
    forRecordId: e?.id ?? null,
    clientRequestId: crypto.randomUUID(),
    dead: e ? String(e.mortality) : '',
    culls: e ? String(e.culls) : view.previous ? String(view.previous.culls) : '',
    cullsOpen: !carried,
    feedKg: e?.feedKg ?? '',
    standardConfirmed: e?.standardConfirmed ?? false,
    weighOpen: e?.avgWeightG != null,
    avgWeightG: e?.avgWeightG != null ? String(e.avgWeightG) : '',
    weightSampleSize: e?.weightSampleSize != null ? String(e.weightSampleSize) : '',
    notesOpen: e?.notes != null,
    notes: e?.notes ?? ''
  };
}

/**
 * The day's form (U7 D29, D30, D32). Every figure it sends is text as typed;
 * the server reads it, finds the standard itself when "Use" was tapped, and
 * decides. The draft is kept on the phone on every change and cleared only
 * when the server says saved.
 */
export function TodayForm({
  batchId,
  batchQuery,
  date,
  view
}: {
  readonly batchId: string;
  /** `batch=<code>&`, for the URLs this form navigates to. */
  readonly batchQuery: string;
  readonly date: string;
  readonly view: TodayView;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(() => initialDraft(view));
  const [restored, setRestored] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [armed, setArmed] = useState(false);
  const [pending, startTransition] = useTransition();

  // Restored after mount: the server never sees the phone's storage.
  useEffect(() => {
    const kept = readDraft(phoneStorage(), batchId, date);
    if (kept !== null && kept.forRecordId === (view.existing?.id ?? null)) {
      setDraft(kept);
      setRestored(true);
    }
  }, [batchId, date, view.existing?.id]);

  // The second tap of "Remove" must come soon after the first.
  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 5000);
    return () => clearTimeout(timer);
  }, [armed]);

  if (view.existing !== null && !view.canEdit) return <ReadOnly view={view} />;

  // Any change is a new entry with its own id; only an unchanged retry reuses one (AD-75).
  function change(patch: Partial<Draft>) {
    const next = { ...draft, ...patch, clientRequestId: crypto.randomUUID() };
    setDraft(next);
    writeDraft(phoneStorage(), batchId, date, next);
    setMessage(null);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    writeDraft(phoneStorage(), batchId, date, draft);
    if (navigator.onLine === false) {
      setMessage(OFFLINE);
      return;
    }
    startTransition(async () => {
      try {
        const result = await saveDayAction({
          batchId,
          recordDate: date,
          mortalityCumulative: draft.dead,
          cullCumulative: draft.cullsOpen ? draft.culls : String(view.previous?.culls ?? draft.culls),
          feedKg: draft.feedKg,
          standardConfirmed: draft.standardConfirmed,
          avgWeightG: draft.weighOpen ? draft.avgWeightG : '',
          weightSampleSize: draft.weighOpen ? draft.weightSampleSize : '',
          notes: draft.notesOpen ? draft.notes : '',
          clientRequestId: draft.clientRequestId,
          supersedesId: view.existing?.id ?? null
        });
        if (result.kind === 'refused') {
          setMessage(result.message);
          return;
        }
        clearDraft(phoneStorage(), batchId, date);
        router.push(`/today?${batchQuery}date=${result.next}&saved=${result.dayNumber}`);
      } catch {
        setMessage(OFFLINE);
      }
    });
  }

  function remove() {
    if (!armed) {
      setArmed(true);
      return;
    }
    setArmed(false);
    const recordId = view.existing?.id;
    if (recordId === undefined) return;
    startTransition(async () => {
      try {
        const result = await removeDayAction({ batchId, recordDate: date, recordId, clientRequestId: crypto.randomUUID() });
        if (result.kind === 'refused') {
          setMessage(result.message);
          return;
        }
        clearDraft(phoneStorage(), batchId, date);
        router.push(`/today?${batchQuery}date=${date}&removed=${result.dayNumber}`);
      } catch {
        setMessage('No connection. Nothing was removed.');
      }
    });
  }

  const { feed, previous, dayNumber } = view;
  const usingStandard = draft.standardConfirmed && feed.standardKg !== null;
  const when = view.isToday ? 'today' : `on day ${dayNumber}`;

  return (
    <form onSubmit={submit} className="grid gap-6" noValidate>
      {(view.existing !== null || restored) && (
        <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
          {view.existing !== null && (
            <span className="rounded-full border border-line-strong bg-surface px-2.5 py-0.5 font-medium text-ink">Recorded</span>
          )}
          {restored && <span>Your unsaved entry was kept on this phone.</span>}
        </p>
      )}

      <Field id="dead" label="Total dead so far" hint={previous ? `was ${previous.mortality} on day ${previous.day}` : null}>
        <input
          id="dead"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          required
          value={draft.dead}
          onChange={(e) => change({ dead: e.target.value })}
          className={`figures ${INPUT}`}
        />
      </Field>

      {draft.cullsOpen || previous === null ? (
        <Field id="culls" label="Culled so far" hint={previous ? `was ${previous.culls} on day ${previous.day}` : null}>
          <input
            id="culls"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            required
            value={draft.culls}
            onChange={(e) => change({ culls: e.target.value })}
            className={`figures ${INPUT}`}
          />
        </Field>
      ) : (
        <div className="grid gap-1">
          <p className={LABEL}>Culled so far</p>
          <p className="figures flex items-center gap-1 text-lg">
            {previous.culls}, same as day {previous.day} ·
            <button type="button" className={QUIET_BUTTON} onClick={() => change({ cullsOpen: true, culls: String(previous.culls) })}>
              Change
            </button>
          </p>
        </div>
      )}

      <Field
        id="feed"
        label={`${PHASE_LABEL[feed.phase]} feed issued ${when}, kg${feed.lastCurveDay !== null ? ` · past the curve’s day ${feed.lastCurveDay}` : ''}`}
        hint={null}
      >
        <input
          id="feed"
          inputMode="decimal"
          autoComplete="off"
          required
          value={draft.feedKg}
          onChange={(e) => change({ feedKg: e.target.value, standardConfirmed: false })}
          className={`figures ${INPUT}`}
        />
        {feed.standardKg !== null && (
          <p className="figures flex flex-wrap items-center gap-1 text-lg text-muted">
            Standard for day {dayNumber}: {feed.standardKg} kg ·
            {usingStandard ? (
              <span className="px-1 font-medium text-accent">Using it</span>
            ) : (
              <button
                type="button"
                className={QUIET_BUTTON}
                onClick={() => change({ feedKg: feed.standardKg ?? '', standardConfirmed: true })}
              >
                Use
              </button>
            )}
          </p>
        )}
      </Field>

      <div className="grid gap-3">
        <button type="button" aria-expanded={draft.weighOpen} className={TOGGLE} onClick={() => change({ weighOpen: !draft.weighOpen })}>
          Weighed birds today?
          <span aria-hidden className="text-muted">{draft.weighOpen ? '−' : '+'}</span>
        </button>
        {draft.weighOpen && (
          <div className="grid grid-cols-2 gap-3">
            <Field id="avg-weight" label="Average weight, g" hint={null}>
              <input
                id="avg-weight"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="off"
                value={draft.avgWeightG}
                onChange={(e) => change({ avgWeightG: e.target.value })}
                className={`figures ${INPUT}`}
              />
            </Field>
            <Field id="sample" label="Birds weighed" hint={null}>
              <input
                id="sample"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="off"
                value={draft.weightSampleSize}
                onChange={(e) => change({ weightSampleSize: e.target.value })}
                className={`figures ${INPUT}`}
              />
            </Field>
          </div>
        )}
      </div>

      <div className="grid gap-3">
        <button type="button" aria-expanded={draft.notesOpen} className={TOGGLE} onClick={() => change({ notesOpen: !draft.notesOpen })}>
          Add a note
          <span aria-hidden className="text-muted">{draft.notesOpen ? '−' : '+'}</span>
        </button>
        {draft.notesOpen && (
          <textarea
            aria-label="Note"
            rows={3}
            maxLength={2000}
            value={draft.notes}
            onChange={(e) => change({ notes: e.target.value })}
            className="w-full rounded-md border border-line-strong bg-surface px-4 py-3 text-lg text-ink outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30"
          />
        )}
      </div>

      <p role="alert" aria-live="polite" className="min-h-5 text-lg text-[var(--state-error)]">
        {message}
      </p>

      <button
        type="submit"
        disabled={pending}
        className="h-14 w-full rounded-md bg-accent text-lg font-medium text-surface transition-colors hover:bg-accent-hover active:translate-y-px disabled:opacity-60"
      >
        {pending ? 'Saving…' : view.existing !== null ? 'Save correction' : `Save day ${dayNumber}`}
      </button>

      {view.canRemove && (
        <button
          type="button"
          disabled={pending}
          onClick={remove}
          className={`h-12 w-full rounded-md border text-lg font-medium transition-colors ${
            armed ? 'border-[var(--state-error)] bg-[var(--state-error)] text-surface' : 'border-line-strong bg-surface text-[var(--state-error)]'
          }`}
        >
          {armed ? 'Tap again to remove' : 'Remove this day’s record'}
        </button>
      )}
    </form>
  );
}

function Field({ id, label, hint, children }: { readonly id: string; readonly label: string; readonly hint: string | null; readonly children: ReactNode }) {
  return (
    <div className="grid gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className={LABEL}>
          {label}
        </label>
        {hint !== null && <span className="figures shrink-0 text-sm text-muted">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

/** A record someone else made, for a WORKER (AD-86): shown, not editable. */
function ReadOnly({ view }: { readonly view: TodayView }) {
  const e = view.existing;
  if (e === null) return null;
  const rows: Array<[string, string]> = [
    ['Total dead so far', String(e.mortality)],
    ['Culled so far', String(e.culls)],
    [`${PHASE_LABEL[view.feed.phase]} feed, kg`, e.feedKg]
  ];
  if (e.avgWeightG !== null) rows.push(['Average weight, g', `${e.avgWeightG} (${e.weightSampleSize ?? '?'} weighed)`]);
  if (e.notes !== null) rows.push(['Note', e.notes]);
  return (
    <section className="grid gap-4">
      <p className="text-lg">Recorded by someone else. A manager or owner can correct it.</p>
      <dl className="divide-y divide-line rounded-lg border border-line bg-surface">
        {rows.map(([term, value]) => (
          <div key={term} className="flex items-baseline justify-between gap-4 p-4">
            <dt className="text-sm text-muted">{term}</dt>
            <dd className="figures text-lg">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
