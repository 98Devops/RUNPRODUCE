/**
 * The save action's pure core (U7 D30, D25 amended): the form's fields as the
 * server reads them, and the one row they become.
 *
 * The server trusts nothing from the browser but the typed fields, the "Use"
 * flag, the date, the client request id and the `supersedesId`. Everything
 * else (the phase, the standard, the totals either side) it reads again
 * itself and passes in as `DayBasis`.
 *
 * Relative imports only: `packages/db-tests` runs this module directly (T-T9).
 */
import {
  dayNumberFor,
  feedPhaseForDay,
  standardFeedForDay,
  type BreedCurvePoint,
  type IsoDate,
  type Phase
} from '@runproduce/engine';
import { z } from 'zod';
import { formatBirds, formatWeekdayDate, parseKgTenths } from '../format.js';
import type { CapturedDay, DailyRecordRow } from '../repositories/index.js';
import { toDailyRecords } from './records.js';

/** One day as the worker entered it, after `parseDayForm`. */
export interface DayEntry {
  readonly recordDate: IsoDate;
  readonly mortalityCumulative: number;
  readonly cullCumulative: number;
  /** The typed figure. Ignored when `standardConfirmed`: the server finds the grams itself. */
  readonly feedKg: string;
  readonly standardConfirmed: boolean;
  readonly avgWeightG: number | null;
  readonly weightSampleSize: number | null;
  readonly notes: string | null;
  readonly clientRequestId: string;
  /** The id of the record the form opened with, never the server's current one (finding 5). */
  readonly supersedesId: string | null;
}

/** What the server read itself, at submit. */
export interface DayBasis {
  readonly placementDate: IsoDate;
  readonly chickCount: number;
  readonly extraChickCount: number;
  readonly points: readonly BreedCurvePoint[];
  /** The batch's current records, any order. */
  readonly records: readonly CapturedDay[];
  /** The farm's date (D28). */
  readonly today: IsoDate;
}

export type BuiltDay =
  | { readonly kind: 'row'; readonly dayNumber: number; readonly row: DailyRecordRow }
  | { readonly kind: 'refused'; readonly message: string };

const refused = (message: string): BuiltDay => ({ kind: 'refused', message });

const PHASE_COLUMN: Record<Phase, 'feedStarterG' | 'feedGrowerG' | 'feedFinisherG'> = {
  STARTER: 'feedStarterG',
  GROWER: 'feedGrowerG',
  FINISHER: 'feedFinisherG'
};

export function buildDayRow(entry: DayEntry, basis: DayBasis): BuiltDay {
  const { placementDate, today, points, records } = basis;

  if (entry.recordDate < placementDate || entry.recordDate > today) {
    return refused(`Pick a day from placement (${formatWeekdayDate(placementDate)}) to today.`);
  }
  if ((entry.avgWeightG === null) !== (entry.weightSampleSize === null)) {
    return refused('Give the average weight and how many birds were weighed, or neither.');
  }
  const totals = totalsProblem(entry, basis);
  if (totals !== null) return refused(totals);

  const day = dayNumberFor(placementDate, entry.recordDate);
  const { phase, source } = feedPhaseForDay(points, day);

  let grams: number;
  if (entry.standardConfirmed) {
    const standard = standardFeedForDay({
      points,
      day,
      chick_count: basis.chickCount,
      extra_chick_count: basis.extraChickCount,
      records: toDailyRecords(placementDate, records)
    });
    // The form never offers "Use" past the curve; only a tampered request gets here.
    if (standard.kind === 'beyond_curve') {
      return refused(`There is no standard past the curve’s day ${standard.last_curve_day}. Type the amount.`);
    }
    grams = standard.feed_g;
  } else {
    const typed = parseKgTenths(entry.feedKg);
    if (typed === null) return refused('Feed is in kg, to one decimal (for example 302.5).');
    grams = typed;
  }

  const feed = { feedStarterG: 0, feedGrowerG: 0, feedFinisherG: 0, [PHASE_COLUMN[phase]]: grams };
  const row: DailyRecordRow = {
    clientRequestId: entry.clientRequestId,
    recordDate: entry.recordDate,
    mortalityCumulative: entry.mortalityCumulative,
    cullCumulative: entry.cullCumulative,
    ...feed,
    avgWeightG: entry.avgWeightG,
    weightSampleSize: entry.weightSampleSize,
    notes: entry.notes,
    feedEntrySource: entry.standardConfirmed ? 'STANDARD_CONFIRMED' : 'MEASURED',
    feedPhase: phase,
    feedPhaseSource: source,
    supersedesId: entry.supersedesId,
    voided: false
  };

  // The one race the database cannot see: with no supersedes_id it supersedes
  // whatever head it finds, so a blank form would silently replace a record
  // saved since it opened. A head holding exactly these values is let through:
  // that is this entry's own first attempt, whose reply was lost, and the
  // database answers a retry with the existing id (AD-75).
  const current = records.find((r) => r.recordDate === entry.recordDate);
  if (entry.supersedesId === null && current !== undefined && !sameValues(current, row)) {
    return refused('Someone saved this date first. Reload.');
  }

  return { kind: 'row', dayNumber: day, row };
}

/** The values the write function compares to call a write a no-op. */
function sameValues(current: CapturedDay, row: DailyRecordRow): boolean {
  return (
    current.mortalityCumulative === row.mortalityCumulative &&
    current.cullCumulative === row.cullCumulative &&
    current.feedStarterG === row.feedStarterG &&
    current.feedGrowerG === row.feedGrowerG &&
    current.feedFinisherG === row.feedFinisherG &&
    current.avgWeightG === row.avgWeightG &&
    current.weightSampleSize === row.weightSampleSize &&
    current.notes === row.notes &&
    current.feedEntrySource === row.feedEntrySource &&
    current.feedPhase === row.feedPhase &&
    current.feedPhaseSource === row.feedPhaseSource
  );
}

/**
 * The database's own rules (invariant 13), checked first only so the farmer
 * reads a sentence instead of a column name. The database still decides.
 */
function totalsProblem(entry: DayEntry, basis: DayBasis): string | null {
  const { placementDate, records } = basis;
  const sorted = records.slice().sort((a, b) => (a.recordDate < b.recordDate ? -1 : 1));
  const before = sorted.filter((r) => r.recordDate < entry.recordDate).pop();
  const after = sorted.find((r) => r.recordDate > entry.recordDate);
  const dayOf = (r: CapturedDay) => dayNumberFor(placementDate, r.recordDate);
  const dead = entry.mortalityCumulative;
  const culled = entry.cullCumulative;

  if (before && dead < before.mortalityCumulative) {
    return `Total dead can’t go down: it was ${formatBirds(before.mortalityCumulative)} on day ${dayOf(before)}.`;
  }
  if (before && culled < before.cullCumulative) {
    return `Culled so far can’t go down: it was ${formatBirds(before.cullCumulative)} on day ${dayOf(before)}.`;
  }
  if (after && dead > after.mortalityCumulative) {
    return `Total dead can’t be more than day ${dayOf(after)}’s ${formatBirds(after.mortalityCumulative)}.`;
  }
  if (after && culled > after.cullCumulative) {
    return `Culled so far can’t be more than day ${dayOf(after)}’s ${formatBirds(after.cullCumulative)}.`;
  }
  const flock = basis.chickCount + basis.extraChickCount;
  if (dead + culled > flock) {
    return `Dead and culled together (${formatBirds(dead + culled)}) are more than the ${formatBirds(flock)} birds placed.`;
  }
  return null;
}

// ─── parseDayForm ────────────────────────────────────────────────────────────

export type ParsedDayForm =
  | { readonly ok: true; readonly batchId: string; readonly entry: DayEntry }
  | { readonly ok: false; readonly message: string };

const UNREADABLE = 'Something in this entry could not be read. Reload and try again.';

/** The shape the form sends. Every number arrives as the text typed. */
const formShape = z.object({
  batchId: z.uuid(),
  recordDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  mortalityCumulative: z.string().max(20),
  cullCumulative: z.string().max(20),
  feedKg: z.string().max(20),
  standardConfirmed: z.boolean(),
  avgWeightG: z.string().max(20),
  weightSampleSize: z.string().max(20),
  notes: z.string().max(2000),
  clientRequestId: z.uuid(),
  supersedesId: z.uuid().nullable()
});

function isCalendarDate(iso: string): boolean {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1));
  return date.toISOString().slice(0, 10) === iso;
}

/** A whole number from text, ASCII digits only; null for anything else. */
function wholeNumber(text: string): number | null {
  const trimmed = text.trim();
  return /^\d{1,7}$/.test(trimmed) ? Number(trimmed) : null;
}

/**
 * The fields, read with a sentence for each mistake a person can make. A shape
 * only a tampered request can send gets one plain refusal and no detail.
 */
export function parseDayForm(raw: unknown): ParsedDayForm {
  const shape = formShape.safeParse(raw);
  if (!shape.success || !isCalendarDate(shape.data.recordDate)) return { ok: false, message: UNREADABLE };
  const f = shape.data;
  const fail = (message: string): ParsedDayForm => ({ ok: false, message });

  if (f.mortalityCumulative.trim() === '') return fail('Enter the total dead so far.');
  const mortalityCumulative = wholeNumber(f.mortalityCumulative);
  if (mortalityCumulative === null) return fail('Total dead is a whole number.');

  if (f.cullCumulative.trim() === '') return fail('Enter the number culled so far.');
  const cullCumulative = wholeNumber(f.cullCumulative);
  if (cullCumulative === null) return fail('Culled so far is a whole number.');

  if (!f.standardConfirmed && f.feedKg.trim() === '') return fail('Enter the feed issued today, in kg.');

  let avgWeightG: number | null = null;
  if (f.avgWeightG.trim() !== '') {
    avgWeightG = wholeNumber(f.avgWeightG);
    if (avgWeightG === null || avgWeightG === 0) return fail('Average weight is whole grams, more than 0.');
  }
  let weightSampleSize: number | null = null;
  if (f.weightSampleSize.trim() !== '') {
    weightSampleSize = wholeNumber(f.weightSampleSize);
    if (weightSampleSize === null || weightSampleSize === 0) return fail('Birds weighed is a whole number, more than 0.');
  }

  const notes = f.notes.trim();
  return {
    ok: true,
    batchId: f.batchId,
    entry: {
      recordDate: f.recordDate as IsoDate,
      mortalityCumulative,
      cullCumulative,
      feedKg: f.feedKg,
      standardConfirmed: f.standardConfirmed,
      avgWeightG,
      weightSampleSize,
      notes: notes === '' ? null : notes,
      clientRequestId: f.clientRequestId,
      supersedesId: f.supersedesId
    }
  };
}
