/**
 * T-SB5 to T-SB7 · The Start batch form's pure core (u8-start-batch.md D2, D5,
 * D9, D12): the fields as the server reads them, the checks against the farm,
 * and the lines the farmer reads before saving.
 *
 * Daniel's real case runs through every layer: 6,000 ordered + 60 extras at
 * $1.00 stores 6000, 60 and 100n.
 */
import type { Cents, IsoDate } from '@runproduce/engine';
import {
  buildCorrection,
  buildStart,
  liveSummary,
  parseStartBatchForm,
  type CorrectBasis,
  type CorrectRequest,
  type StartBasis,
  type StartRequest
} from '../../lib/start/placement.js';

const TODAY = '2026-10-14' as IsoDate; // a Wednesday
const CURVE = '00000000-0000-4000-8000-0000000000c1';
const OTHER_CURVE = '00000000-0000-4000-8000-0000000000c2';
const CRID = '00000000-0000-4000-8000-0000000000f1';
const BATCH = '00000000-0000-4000-8000-0000000000b1';
const HEAD = '00000000-0000-4000-8000-0000000000a1';

const startForm = (over: Record<string, unknown> = {}) => ({
  kind: 'start',
  mode: 'check',
  name: 'B1',
  placementDate: '2026-10-12',
  chickCount: '6000',
  extraChickCount: '60',
  chickPrice: '1.00',
  curveId: CURVE,
  clientRequestId: CRID,
  ...over
});

const correctForm = (over: Record<string, unknown> = {}) => ({
  kind: 'correct',
  mode: 'check',
  batchId: BATCH,
  supersedesId: HEAD,
  placementDate: '2026-10-12',
  chickCount: '6000',
  extraChickCount: '61',
  chickPrice: '1.00',
  clientRequestId: CRID,
  ...over
});

function messageOf(raw: unknown): string {
  const parsed = parseStartBatchForm(raw);
  if (parsed.ok) throw new Error('expected a refusal');
  return parsed.message;
}

describe('T-SB5 · parseStartBatchForm', () => {
  it('reads Daniel’s case as 6000, 60 and 100n, with the name trimmed', () => {
    const parsed = parseStartBatchForm(startForm({ name: '  B1 ', mode: 'save' }));
    expect(parsed).toEqual({
      ok: true,
      request: {
        kind: 'start',
        mode: 'save',
        code: 'B1',
        breedCurveId: CURVE,
        figures: { placementDate: '2026-10-12', chickCount: 6000, extraChickCount: 60, chickPriceCents: 100n },
        clientRequestId: CRID
      }
    });
  });

  it('reads a correction with its batch and the placement version it saw', () => {
    expect(parseStartBatchForm(correctForm())).toEqual({
      ok: true,
      request: {
        kind: 'correct',
        mode: 'check',
        batchId: BATCH,
        supersedesId: HEAD,
        figures: { placementDate: '2026-10-12', chickCount: 6000, extraChickCount: 61, chickPriceCents: 100n },
        clientRequestId: CRID
      }
    });
  });

  it('takes no curve when none is chosen, for the farm check to refuse', () => {
    const parsed = parseStartBatchForm(startForm({ curveId: '' }));
    expect(parsed.ok && parsed.request.kind === 'start' && parsed.request.breedCurveId).toBeNull();
  });

  it.each<[string, Record<string, unknown>, string]>([
    ['a blank name', { name: '  ' }, 'Give the batch a name, for example B1.'],
    ['a name over 24 characters', { name: 'A'.repeat(25) }, 'Keep the batch name to 24 characters or fewer.'],
    ['a name with other characters', { name: 'B1/Oct' }, 'Use letters, numbers, spaces and hyphens in the batch name.'],
    ['a blank date', { placementDate: '' }, 'Enter the day the chicks arrived.'],
    ['blank chicks', { chickCount: ' ' }, 'Enter how many chicks were placed.'],
    ['0 chicks', { chickCount: '0' }, 'Chicks placed is a whole number, more than 0.'],
    ['a decimal chick count', { chickCount: '6000.5' }, 'Chicks placed is a whole number, more than 0.'],
    ['chicks with a comma', { chickCount: '6,000' }, 'Type 6000, without the comma.'],
    ['blank extras, which is not 0', { extraChickCount: '' }, 'Enter the extra chicks from the hatchery, or 0 if there were none.'],
    ['negative extras', { extraChickCount: '-1' }, 'Extra chicks is a whole number: 0 or more.'],
    ['extras with a comma', { extraChickCount: '1,060' }, 'Type 1060, without the comma.'],
    ['a blank price', { chickPrice: '' }, 'Enter the price per chick, for example 1.00.'],
    ['a comma price', { chickPrice: '1,00' }, 'Price per chick is dollars and cents, for example 1.00.'],
    ['a three-decimal price', { chickPrice: '1.005' }, 'Price per chick is dollars and cents, for example 1.00.'],
    ['a zero price', { chickPrice: '0.00' }, 'The price per chick must be more than $0.00.']
  ])('refuses %s with its sentence', (_label, over, sentence) => {
    expect(messageOf(startForm(over))).toBe(sentence);
  });

  it('names the first failing field, in the form’s order', () => {
    expect(messageOf(startForm({ name: '', chickCount: '', chickPrice: '' }))).toBe('Give the batch a name, for example B1.');
    expect(messageOf(startForm({ chickCount: '', chickPrice: '' }))).toBe('Enter how many chicks were placed.');
  });

  it.each<[string, unknown]>([
    ['no object', null],
    ['an unknown kind', startForm({ kind: 'close' })],
    ['an unknown mode', startForm({ mode: 'force' })],
    ['a bad request id', startForm({ clientRequestId: 'x' })],
    ['a bad curve id', startForm({ curveId: 'not-a-uuid' })],
    ['an impossible date', startForm({ placementDate: '2026-02-30' })],
    ['a date in another shape', startForm({ placementDate: '12/10/2026' })],
    ['a correction with no head', correctForm({ supersedesId: null })],
    ['a correction with a name', { ...correctForm(), name: 'B2' }],
    ['a number sent as a number', startForm({ chickCount: 6000 })]
  ])('refuses %s with one plain sentence', (_label, raw) => {
    expect(messageOf(raw)).toBe('Something in this entry could not be read. Reload and try again.');
  });
});

function startRequest(over: Partial<StartRequest> = {}): StartRequest {
  const parsed = parseStartBatchForm(startForm());
  if (!parsed.ok || parsed.request.kind !== 'start') throw new Error('fixture');
  return { ...parsed.request, ...over };
}

function correctRequest(over: Partial<CorrectRequest['figures']> = {}, supersedesId = HEAD): CorrectRequest {
  const parsed = parseStartBatchForm(correctForm());
  if (!parsed.ok || parsed.request.kind !== 'correct') throw new Error('fixture');
  return { ...parsed.request, supersedesId, figures: { ...parsed.request.figures, ...over } };
}

const startBasis = (over: Partial<StartBasis> = {}): StartBasis => ({
  today: TODAY,
  batchCodes: ['A1'],
  curves: [{ id: CURVE }],
  ...over
});

const correctBasis = (over: Partial<CorrectBasis> = {}): CorrectBasis => ({
  today: TODAY,
  batch: { batchId: BATCH, code: 'B1', placementVersionId: HEAD },
  records: [],
  ...over
});

describe('T-SB6 · buildStart, the checks against the farm', () => {
  it('builds the write for Daniel’s case, with the day it lands on', () => {
    expect(buildStart(startRequest(), startBasis())).toEqual({
      kind: 'start',
      dayNumber: 3,
      write: {
        code: 'B1',
        breedCurveId: CURVE,
        placementDate: '2026-10-12',
        chickCount: 6000,
        extraChickCount: 60,
        chickPriceCents: 100n,
        clientRequestId: CRID
      },
      confirm: ['Batch name ‘B1’ can’t be changed later.', 'Placement date Mon 12 Oct → today is day 3.']
    });
  });

  it('refuses a name already used on the farm, closed batches included, matched exactly', () => {
    expect(buildStart(startRequest(), startBasis({ batchCodes: ['A1', 'B1'] }))).toEqual({
      kind: 'refused',
      message: 'There is already a batch called B1. Pick another name.'
    });
    // Codes are unique as stored, so "b1" is another batch, as resolveBatch treats it.
    expect(buildStart(startRequest(), startBasis({ batchCodes: ['b1'] })).kind).toBe('start');
  });

  it('refuses a date after the farm’s today and accepts today itself', () => {
    const tomorrow = startRequest({ figures: { ...startRequest().figures, placementDate: '2026-10-15' as IsoDate } });
    expect(buildStart(tomorrow, startBasis())).toEqual({
      kind: 'refused',
      message: 'The chicks can’t arrive after today (Wed 14 Oct).'
    });
    const today = startRequest({ figures: { ...startRequest().figures, placementDate: TODAY } });
    expect(buildStart(today, startBasis())).toMatchObject({ kind: 'start', dayNumber: 1 });
  });

  it('reads "today" as the farm’s date it is given, never the server clock', () => {
    // 23:30 UTC on the 13th is already the 14th in Harare; the caller passes farmToday().
    const placedOn14 = startRequest({ figures: { ...startRequest().figures, placementDate: TODAY } });
    expect(buildStart(placedOn14, startBasis({ today: '2026-10-13' as IsoDate })).kind).toBe('refused');
    expect(buildStart(placedOn14, startBasis({ today: TODAY })).kind).toBe('start');
  });

  it('refuses when the farm has no growth curve', () => {
    expect(buildStart(startRequest(), startBasis({ curves: [] }))).toEqual({
      kind: 'refused',
      message: 'A batch needs your growth curve, and it isn’t set up yet. It’s loaded with your prices.'
    });
  });

  it('refuses no curve, or one that is not the farm’s', () => {
    const choose = { kind: 'refused', message: 'Choose the growth curve for this batch.' };
    const twoCurves = startBasis({ curves: [{ id: CURVE }, { id: OTHER_CURVE }] });
    expect(buildStart(startRequest({ breedCurveId: null }), twoCurves)).toEqual(choose);
    expect(buildStart(startRequest({ breedCurveId: '00000000-0000-4000-8000-0000000000c9' }), twoCurves)).toEqual(choose);
    expect(buildStart(startRequest({ breedCurveId: OTHER_CURVE }), twoCurves)).toMatchObject({
      kind: 'start',
      write: { breedCurveId: OTHER_CURVE }
    });
  });

  it('checks the name before the date, in the form’s order', () => {
    const both = startRequest({ figures: { ...startRequest().figures, placementDate: '2026-10-20' as IsoDate } });
    expect(buildStart(both, startBasis({ batchCodes: ['B1'] }))).toMatchObject({
      message: 'There is already a batch called B1. Pick another name.'
    });
  });
});

const record = (recordDate: string, mortalityCumulative: number, cullCumulative: number) => ({
  recordDate: recordDate as IsoDate,
  mortalityCumulative,
  cullCumulative
});

describe('T-SB6 · buildCorrection, a new placement version (D9)', () => {
  it('builds the correction against the version the form saw, with no name line', () => {
    expect(buildCorrection(correctRequest(), correctBasis())).toEqual({
      kind: 'correct',
      dayNumber: 3,
      write: {
        batchId: BATCH,
        supersedesId: HEAD,
        placementDate: '2026-10-12',
        chickCount: 6000,
        extraChickCount: 61,
        chickPriceCents: 100n,
        clientRequestId: CRID
      },
      confirm: ['Placement date Mon 12 Oct → today is day 3.']
    });
  });

  it('refuses a correction made against a placement that has changed since', () => {
    expect(buildCorrection(correctRequest({}, '00000000-0000-4000-8000-0000000000a2'), correctBasis())).toEqual({
      kind: 'refused',
      message: 'This batch was changed since you opened it. Reload.'
    });
  });

  it('refuses a future date', () => {
    expect(buildCorrection(correctRequest({ placementDate: '2026-10-15' as IsoDate }), correctBasis())).toMatchObject({
      message: 'The chicks can’t arrive after today (Wed 14 Oct).'
    });
  });

  it('refuses moving the date past a recorded day, naming the earliest', () => {
    const records = [record('2026-10-13', 2, 0), record('2026-10-12', 1, 0)];
    expect(buildCorrection(correctRequest({ placementDate: '2026-10-13' as IsoDate }), correctBasis({ records }))).toEqual({
      kind: 'refused',
      message: 'There’s a record for Mon 12 Oct, before the new arrival date. The date can’t move past a recorded day.'
    });
    // Earlier is fine: the records still fall on or after placement.
    expect(
      buildCorrection(correctRequest({ placementDate: '2026-10-10' as IsoDate }), correctBasis({ records })).kind
    ).toBe('correct');
  });

  it('refuses a flock smaller than the birds already removed, dead and culled together', () => {
    const records = [record('2026-10-13', 6_000, 100)];
    expect(
      buildCorrection(correctRequest({ chickCount: 6_000, extraChickCount: 50 }), correctBasis({ records }))
    ).toEqual({ kind: 'refused', message: 'That’s 6,050 birds, but 6,100 are already recorded dead or culled.' });
    expect(
      buildCorrection(correctRequest({ chickCount: 6_000, extraChickCount: 100 }), correctBasis({ records })).kind
    ).toBe('correct');
  });
});

describe('T-SB7 · liveSummary, under the form as it is typed (D2)', () => {
  const fields = {
    name: 'B1',
    placementDate: '2026-10-12',
    chickCount: '6000',
    extraChickCount: '60',
    chickPrice: '1.00'
  };

  it('reads Daniel’s case back with the flock and the day, and no cost total (TD-17)', () => {
    const summary = liveSummary(fields, TODAY);
    expect(summary).toBe('B1 · placed Mon 12 Oct · 6,060 birds (6,000 + 60 extra) · $1.00 a chick · today is day 3.');
    expect(summary).not.toContain('6,060.00');
    expect(summary).not.toContain('$6,');
  });

  it('leaves the extras out of the count when there are none', () => {
    expect(liveSummary({ ...fields, extraChickCount: '0' }, TODAY)).toBe(
      'B1 · placed Mon 12 Oct · 6,000 birds · $1.00 a chick · today is day 3.'
    );
  });

  it.each<[string, Partial<typeof fields>]>([
    ['the name is blank', { name: ' ' }],
    ['the date is blank', { placementDate: '' }],
    ['the date is after today', { placementDate: '2026-10-15' }],
    ['the chicks have a comma', { chickCount: '6,000' }],
    ['the extras are blank', { extraChickCount: '' }],
    ['the price has a comma', { chickPrice: '1,00' }],
    ['the price is zero', { chickPrice: '0' }]
  ])('shows nothing while %s', (_label, over) => {
    expect(liveSummary({ ...fields, ...over }, TODAY)).toBeNull();
  });

  it('carries the cents as given, never through a float', () => {
    expect(liveSummary({ ...fields, chickPrice: '0.85' }, TODAY)).toContain('$0.85 a chick');
    const typed: Cents = 85n as Cents;
    expect(typeof typed).toBe('bigint');
  });
});
