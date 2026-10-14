/**
 * The Start batch form's pure core (u8-start-batch.md D2, D5, D9, D12): the
 * fields as the server reads them, the checks against the farm, and the lines
 * the farmer reads before saving. No session and no clock: the caller passes
 * the farm's today and what it read.
 *
 * Each refusal is one sentence, for the first field that fails, in the form's
 * order. The database still decides; these say it in the farmer's words first.
 *
 * Relative imports only: `packages/db-tests` runs the save core that uses this.
 */
import { z } from 'zod';
import { dayNumberFor, type Cents, type IsoDate } from '@runproduce/engine';
import { formatBirds, formatMoney, formatWeekdayDate, parseCents, parseCount } from '../format.js';

/** The longest batch name; the database holds the same bound (D7). */
export const NAME_MAX = 24;

const UNREADABLE = 'Something in this entry could not be read. Reload and try again.';
const NO_CURVE = 'A batch needs your growth curve, and it isn’t set up yet. It’s loaded with your prices.';

export type PlacementMode = 'check' | 'save';

/** The four facts a placement version holds (D3: ordered and extras, separately). */
export interface PlacementFigures {
  readonly placementDate: IsoDate;
  readonly chickCount: number;
  readonly extraChickCount: number;
  readonly chickPriceCents: Cents;
}

export interface StartRequest {
  readonly kind: 'start';
  readonly mode: PlacementMode;
  readonly code: string;
  /** Null when none was chosen; `buildStart` refuses it. */
  readonly breedCurveId: string | null;
  readonly figures: PlacementFigures;
  readonly clientRequestId: string;
}

export interface CorrectRequest {
  readonly kind: 'correct';
  readonly mode: PlacementMode;
  readonly batchId: string;
  /** The placement version the form showed, so a correction of a changed one is stale. */
  readonly supersedesId: string;
  readonly figures: PlacementFigures;
  readonly clientRequestId: string;
}

export type ParsedPlacementForm =
  | { readonly ok: true; readonly request: StartRequest | CorrectRequest }
  | { readonly ok: false; readonly message: string };

/** The shape the form sends. Every figure arrives as the text typed. */
const figureFields = {
  mode: z.enum(['check', 'save']),
  placementDate: z.string().max(20),
  chickCount: z.string().max(20),
  extraChickCount: z.string().max(20),
  chickPrice: z.string().max(20),
  clientRequestId: z.uuid()
};

const formShape = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('start'),
    name: z.string().max(200),
    curveId: z.union([z.literal(''), z.uuid()]),
    ...figureFields
  }),
  z.strictObject({
    kind: z.literal('correct'),
    batchId: z.uuid(),
    supersedesId: z.uuid(),
    ...figureFields
  })
]);

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function isCalendarDate(iso: string): boolean {
  if (!ISO.test(iso)) return false;
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1));
  return date.toISOString().slice(0, 10) === iso;
}

/** "6,000": digits in thousands groups. Still refused, but the message gives the digits back. */
function withoutCommas(text: string): string | null {
  const trimmed = text.trim();
  return /^\d{1,3}(,\d{3})+$/.test(trimmed) ? trimmed.replaceAll(',', '') : null;
}

type Read<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly message: string };
const fail = (message: string) => ({ ok: false, message }) as const;
const pass = <T>(value: T) => ({ ok: true, value }) as const;

export function readName(text: string): Read<string> {
  const name = text.trim();
  if (name === '') return fail('Give the batch a name, for example B1.');
  if (name.length > NAME_MAX) return fail(`Keep the batch name to ${NAME_MAX} characters or fewer.`);
  if (!/^[A-Za-z0-9 -]+$/.test(name)) return fail('Use letters, numbers, spaces and hyphens in the batch name.');
  return pass(name);
}

function readCount(text: string, blank: string, wrong: string, least: number): Read<number> {
  if (text.trim() === '') return fail(blank);
  const digits = withoutCommas(text);
  if (digits !== null) return fail(`Type ${digits}, without the comma.`);
  const count = parseCount(text);
  return count === null || count < least ? fail(wrong) : pass(count);
}

/** The four figures, read in the form's order, or the first field's sentence. */
function readFigures(f: {
  placementDate: string;
  chickCount: string;
  extraChickCount: string;
  chickPrice: string;
}): Read<PlacementFigures> | 'unreadable' {
  if (f.placementDate.trim() === '') return fail('Enter the day the chicks arrived.');
  if (!isCalendarDate(f.placementDate)) return 'unreadable';

  const chicks = readCount(
    f.chickCount,
    'Enter how many chicks were placed.',
    'Chicks placed is a whole number, more than 0.',
    1
  );
  if (!chicks.ok) return chicks;
  const extras = readCount(
    f.extraChickCount,
    'Enter the extra chicks from the hatchery, or 0 if there were none.',
    'Extra chicks is a whole number: 0 or more.',
    0
  );
  if (!extras.ok) return extras;

  if (f.chickPrice.trim() === '') return fail('Enter the price per chick, for example 1.00.');
  const price = parseCents(f.chickPrice);
  if (price === null) return fail('Price per chick is dollars and cents, for example 1.00.');
  if (price === 0n) return fail('The price per chick must be more than $0.00.');

  return pass({
    placementDate: f.placementDate as IsoDate,
    chickCount: chicks.value,
    extraChickCount: extras.value,
    chickPriceCents: price
  });
}

/**
 * The fields, read with a sentence for each mistake a person can make. A shape
 * only a tampered request can send gets one plain refusal and no detail.
 */
export function parseStartBatchForm(raw: unknown): ParsedPlacementForm {
  const shape = formShape.safeParse(raw);
  if (!shape.success) return { ok: false, message: UNREADABLE };
  const f = shape.data;

  if (f.kind === 'start') {
    const name = readName(f.name);
    if (!name.ok) return name;
    const figures = readFigures(f);
    if (figures === 'unreadable') return { ok: false, message: UNREADABLE };
    if (!figures.ok) return figures;
    return {
      ok: true,
      request: {
        kind: 'start',
        mode: f.mode,
        code: name.value,
        breedCurveId: f.curveId === '' ? null : f.curveId,
        figures: figures.value,
        clientRequestId: f.clientRequestId
      }
    };
  }

  const figures = readFigures(f);
  if (figures === 'unreadable') return { ok: false, message: UNREADABLE };
  if (!figures.ok) return figures;
  return {
    ok: true,
    request: {
      kind: 'correct',
      mode: f.mode,
      batchId: f.batchId,
      supersedesId: f.supersedesId,
      figures: figures.value,
      clientRequestId: f.clientRequestId
    }
  };
}

/** What `record_batch` is sent, less the organisation, which the caller's membership names. */
export interface BatchWrite extends PlacementFigures {
  readonly code: string;
  readonly breedCurveId: string;
  readonly clientRequestId: string;
}

/** What `record_batch_placement` is sent. */
export interface PlacementWrite extends PlacementFigures {
  readonly batchId: string;
  readonly supersedesId: string;
  readonly clientRequestId: string;
}

export interface StartBasis {
  /** The farm's date (`farmToday`), never the server's. */
  readonly today: IsoDate;
  /** Every batch code on the farm, closed ones included: codes are unique for good. */
  readonly batchCodes: readonly string[];
  readonly curves: readonly { readonly id: string }[];
}

export interface CorrectBasis {
  readonly today: IsoDate;
  readonly batch: { readonly batchId: string; readonly code: string; readonly placementVersionId: string };
  readonly records: readonly {
    readonly recordDate: IsoDate;
    readonly mortalityCumulative: number;
    readonly cullCumulative: number;
  }[];
}

export type BuiltPlacement =
  | { readonly kind: 'refused'; readonly message: string }
  | {
      readonly kind: 'start';
      readonly dayNumber: number;
      readonly write: BatchWrite;
      /** D12's lines, shown before the write. */
      readonly confirm: readonly string[];
    }
  | {
      readonly kind: 'correct';
      readonly dayNumber: number;
      readonly write: PlacementWrite;
      readonly confirm: readonly string[];
    };

const refused = (message: string) => ({ kind: 'refused', message }) as const;

function futureDate(date: IsoDate, today: IsoDate): string | null {
  return date > today ? `The chicks can’t arrive after today (${formatWeekdayDate(today)}).` : null;
}

function dayLine(date: IsoDate, today: IsoDate): string {
  return `Placement date ${formatWeekdayDate(date)} → today is day ${dayNumberFor(date, today)}.`;
}

/** A new batch: its name unused on the farm, its date not after today, its curve the farm's own (D4). */
export function buildStart(request: StartRequest, basis: StartBasis): BuiltPlacement {
  const { code, figures } = request;
  if (basis.batchCodes.includes(code)) return refused(`There is already a batch called ${code}. Pick another name.`);
  const future = futureDate(figures.placementDate, basis.today);
  if (future !== null) return refused(future);
  if (basis.curves.length === 0) return refused(NO_CURVE);
  const curve = basis.curves.find((c) => c.id === request.breedCurveId);
  if (curve === undefined) return refused('Choose the growth curve for this batch.');

  return {
    kind: 'start',
    dayNumber: dayNumberFor(figures.placementDate, basis.today),
    write: { code, breedCurveId: curve.id, ...figures, clientRequestId: request.clientRequestId },
    confirm: [`Batch name ‘${code}’ can’t be changed later.`, dayLine(figures.placementDate, basis.today)]
  };
}

/**
 * A correction is a new placement version that supersedes the one the form
 * showed (D9). The integrity triggers re-check every record at commit; these
 * say the same thing first, in words.
 */
export function buildCorrection(request: CorrectRequest, basis: CorrectBasis): BuiltPlacement {
  const { figures } = request;
  if (request.supersedesId !== basis.batch.placementVersionId) {
    return refused('This batch was changed since you opened it. Reload.');
  }
  const future = futureDate(figures.placementDate, basis.today);
  if (future !== null) return refused(future);

  const earliest = basis.records.reduce<IsoDate | null>(
    (first, r) => (first === null || r.recordDate < first ? r.recordDate : first),
    null
  );
  if (earliest !== null && earliest < figures.placementDate) {
    return refused(
      `There’s a record for ${formatWeekdayDate(earliest)}, before the new arrival date. The date can’t move past a recorded day.`
    );
  }

  const flock = figures.chickCount + figures.extraChickCount;
  const removed = Math.max(0, ...basis.records.map((r) => r.mortalityCumulative + r.cullCumulative));
  if (removed > flock) {
    return refused(`That’s ${formatBirds(flock)} birds, but ${formatBirds(removed)} are already recorded dead or culled.`);
  }

  return {
    kind: 'correct',
    dayNumber: dayNumberFor(figures.placementDate, basis.today),
    write: {
      batchId: basis.batch.batchId,
      supersedesId: request.supersedesId,
      ...figures,
      clientRequestId: request.clientRequestId
    },
    confirm: [dayLine(figures.placementDate, basis.today)]
  };
}

export interface SummaryFields {
  readonly name: string;
  readonly placementDate: string;
  readonly chickCount: string;
  readonly extraChickCount: string;
  readonly chickPrice: string;
}

/**
 * The line under the form as it is typed (D2): the flock and the day it lands
 * on, so a wrong date shows before saving. Null until every field reads. No
 * chick cost total: TD-17 is open.
 */
export function liveSummary(fields: SummaryFields, today: IsoDate): string | null {
  const name = readName(fields.name);
  if (!name.ok) return null;
  const figures = readFigures(fields);
  if (figures === 'unreadable' || !figures.ok) return null;
  const { placementDate, chickCount, extraChickCount, chickPriceCents } = figures.value;
  if (placementDate > today) return null;

  const birds =
    extraChickCount === 0
      ? `${formatBirds(chickCount)} birds`
      : `${formatBirds(chickCount + extraChickCount)} birds (${formatBirds(chickCount)} + ${formatBirds(extraChickCount)} extra)`;
  return [
    name.value,
    `placed ${formatWeekdayDate(placementDate)}`,
    birds,
    `${formatMoney(chickPriceCents, { cents: true })} a chick`,
    `today is day ${dayNumberFor(placementDate, today)}.`
  ].join(' · ');
}
