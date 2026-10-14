/**
 * T-T6 · `buildDayRow`, the save action's pure core (U7 D30, D25 amended), and
 * `parseDayForm`, the form's fields as the server reads them.
 *
 * The server trusts nothing from the browser but the typed fields, the
 * "Use" flag, the date and the two ids. With the flag it stores the engine's
 * exact grams as STANDARD_CONFIRMED / FROM_CURVE; typed kg is MEASURED.
 */
import { SEED_BREED_CURVE, standardFeedForDay, type IsoDate } from '@runproduce/engine';
import type { CapturedDay } from '../../lib/repositories/index.js';
import { buildDayRow, parseDayForm, type DayBasis, type DayEntry } from '../../lib/today/day-row.js';
import { toDailyRecords } from '../../lib/today/records.js';

const POINTS = SEED_BREED_CURVE.points;
const LAST_CURVE_DAY = Math.max(...POINTS.map((p) => p.day_number));
const FIRST_GROWER_DAY = POINTS.find((p) => p.phase === 'GROWER')!.day_number;

const PLACEMENT = '2026-10-06' as IsoDate; // a Tuesday; day 1
const CRID = '00000000-0000-4000-8000-00000000c001';
const HEAD = '00000000-0000-4000-8000-00000000d001';

/** The ISO date of a day of the batch: day 1 is the placement date. */
function dateOfDay(day: number): IsoDate {
  const ms = Date.UTC(2026, 9, 6) + (day - 1) * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10) as IsoDate;
}

const recorded = (day: number, mortality: number, culls: number, over: Partial<CapturedDay> = {}): CapturedDay => ({
  id: `00000000-0000-4000-8000-${String(day).padStart(12, '0')}`,
  recordDate: dateOfDay(day),
  mortalityCumulative: mortality,
  cullCumulative: culls,
  feedStarterG: 300_000,
  feedGrowerG: 0,
  feedFinisherG: 0,
  avgWeightG: null,
  weightSampleSize: null,
  notes: null,
  createdBy: null,
  feedEntrySource: 'MEASURED',
  feedPhase: 'STARTER',
  feedPhaseSource: 'FROM_CURVE',
  ...over
});

const basis = (over: Partial<DayBasis> = {}): DayBasis => ({
  placementDate: PLACEMENT,
  chickCount: 6000,
  extraChickCount: 60,
  points: POINTS,
  records: [],
  today: dateOfDay(12),
  ...over
});

const entry = (over: Partial<DayEntry> = {}): DayEntry => ({
  recordDate: dateOfDay(12),
  mortalityCumulative: 14,
  cullCumulative: 3,
  feedKg: '302.5',
  standardConfirmed: false,
  avgWeightG: null,
  weightSampleSize: null,
  notes: null,
  clientRequestId: CRID,
  supersedesId: null,
  ...over
});

function row(e: DayEntry, b: DayBasis) {
  const built = buildDayRow(e, b);
  if (built.kind !== 'row') throw new Error(`expected a row, got: ${built.message}`);
  return built;
}

function refusal(e: DayEntry, b: DayBasis): string {
  const built = buildDayRow(e, b);
  if (built.kind !== 'refused') throw new Error('expected a refusal, got a row');
  return built.message;
}

describe('T-T6 · buildDayRow: the feed', () => {
  it('with the flag, stores the engine’s exact grams as STANDARD_CONFIRMED / FROM_CURVE, ignoring the typed figure', () => {
    // Day 12, no records: all 6,060 birds at the curve's grams a bird.
    const perBird = POINTS.find((p) => p.day_number === 12)!.feed_g;
    const built = row(entry({ standardConfirmed: true, feedKg: '999.9' }), basis());
    expect(built.row).toMatchObject({
      feedStarterG: perBird * 6060,
      feedGrowerG: 0,
      feedFinisherG: 0,
      feedEntrySource: 'STANDARD_CONFIRMED',
      feedPhase: 'STARTER',
      feedPhaseSource: 'FROM_CURVE'
    });
  });

  it('with the flag, charges the standard to the birds left after the latest earlier record', () => {
    const records = [recorded(11, 14, 3)];
    const built = row(entry({ standardConfirmed: true, mortalityCumulative: 15 }), basis({ records }));
    const standard = standardFeedForDay({
      points: POINTS,
      day: 12,
      chick_count: 6000,
      extra_chick_count: 60,
      records: toDailyRecords(PLACEMENT, records)
    });
    expect(standard.kind).toBe('standard');
    expect(built.row.feedStarterG).toBe(standard.kind === 'standard' ? standard.feed_g : NaN);
    expect(built.row.feedStarterG).toBe(POINTS.find((p) => p.day_number === 12)!.feed_g * 6043);
  });

  it('stores typed kg as MEASURED, exact to the gram', () => {
    expect(row(entry({ feedKg: '302.5' }), basis()).row).toMatchObject({
      feedStarterG: 302_500,
      feedEntrySource: 'MEASURED',
      feedPhaseSource: 'FROM_CURVE'
    });
  });

  it('files the amount under the day’s own phase, with 0 under the other two', () => {
    const b = basis({ today: dateOfDay(FIRST_GROWER_DAY) });
    const built = row(entry({ recordDate: dateOfDay(FIRST_GROWER_DAY), feedKg: '410' }), b);
    expect(built.row).toMatchObject({ feedStarterG: 0, feedGrowerG: 410_000, feedFinisherG: 0, feedPhase: 'GROWER' });
  });

  it('refuses the flag past the curve’s last day: there is no standard to confirm', () => {
    const day = LAST_CURVE_DAY + 1;
    const message = refusal(entry({ recordDate: dateOfDay(day), standardConfirmed: true }), basis({ today: dateOfDay(day) }));
    expect(message).toBe(`There is no standard past the curve’s day ${LAST_CURVE_DAY}. Type the amount.`);
  });

  it('takes a typed amount past the curve, under the last phase, marked EXTRAPOLATED_BEYOND_CURVE', () => {
    const day = LAST_CURVE_DAY + 1;
    const built = row(entry({ recordDate: dateOfDay(day), feedKg: '900' }), basis({ today: dateOfDay(day) }));
    expect(built.row).toMatchObject({
      feedFinisherG: 900_000,
      feedStarterG: 0,
      feedGrowerG: 0,
      feedEntrySource: 'MEASURED',
      feedPhase: 'FINISHER',
      feedPhaseSource: 'EXTRAPOLATED_BEYOND_CURVE'
    });
  });

  it.each(['302.55', '3,02', '', '-1', '1e3'])('refuses %j as a feed amount', (feedKg) => {
    expect(refusal(entry({ feedKg }), basis())).toBe('Feed is in kg, to one decimal (for example 302.5).');
  });
});

describe('T-T6 · buildDayRow: the day and the ids', () => {
  it('passes the client request id and supersedesId through as sent', () => {
    const records = [recorded(12, 10, 3, { id: HEAD })];
    const built = row(entry({ supersedesId: HEAD }), basis({ records }));
    expect(built.row).toMatchObject({ clientRequestId: CRID, supersedesId: HEAD, voided: false, recordDate: dateOfDay(12) });
    expect(built.dayNumber).toBe(12);
  });

  it('passes a supersedesId that is no longer the head through unchanged, for the database to call stale', () => {
    const records = [recorded(12, 10, 3, { id: HEAD })];
    const stale = '00000000-0000-4000-8000-00000000dead';
    expect(row(entry({ supersedesId: stale }), basis({ records })).row.supersedesId).toBe(stale);
  });

  it('refuses a first entry for a date someone has saved since the form opened', () => {
    const records = [recorded(12, 10, 3)];
    expect(refusal(entry({ supersedesId: null }), basis({ records }))).toBe('Someone saved this date first. Reload.');
  });

  it('lets a retry through when the saved record is exactly this entry: the first attempt landed but its reply was lost (AD-75)', () => {
    const records = [recorded(12, 14, 3, { feedStarterG: 302_500 })];
    const built = row(entry({ supersedesId: null, feedKg: '302.5' }), basis({ records }));
    expect(built.row).toMatchObject({ clientRequestId: CRID, supersedesId: null, feedStarterG: 302_500 });
  });

  it('still refuses when the saved record differs in any one value', () => {
    const records = [recorded(12, 14, 3, { feedStarterG: 302_500, notes: 'someone else' })];
    expect(refusal(entry({ supersedesId: null, feedKg: '302.5' }), basis({ records }))).toBe(
      'Someone saved this date first. Reload.'
    );
  });

  it.each([
    ['before placement', dateOfDay(0)],
    ['after the farm’s today', dateOfDay(13)]
  ])('refuses a date %s, and never moves it', (_label, recordDate) => {
    expect(refusal(entry({ recordDate }), basis())).toBe('Pick a day from placement (Tue 6 Oct) to today.');
  });

  it('accepts the placement date and today itself', () => {
    expect(row(entry({ recordDate: PLACEMENT, mortalityCumulative: 0, cullCumulative: 0 }), basis()).dayNumber).toBe(1);
    expect(row(entry(), basis()).dayNumber).toBe(12);
  });

  it('carries the weights and notes', () => {
    const built = row(entry({ avgWeightG: 410, weightSampleSize: 50, notes: 'Fan 2 fixed' }), basis());
    expect(built.row).toMatchObject({ avgWeightG: 410, weightSampleSize: 50, notes: 'Fan 2 fixed' });
  });

  it.each([
    [410, null],
    [null, 50]
  ])('refuses a weight without its sample size, or the reverse (%s, %s)', (avgWeightG, weightSampleSize) => {
    expect(refusal(entry({ avgWeightG, weightSampleSize }), basis())).toBe(
      'Give the average weight and how many birds were weighed, or neither.'
    );
  });
});

describe('T-T6 · buildDayRow: the totals, in words a farmer reads', () => {
  const records = [recorded(11, 14, 3), recorded(13, 20, 5)];
  const b = basis({ records, today: dateOfDay(13) });

  it('refuses total dead below the day before', () => {
    expect(refusal(entry({ mortalityCumulative: 13 }), b)).toBe('Total dead can’t go down: it was 14 on day 11.');
  });

  it('refuses culls below the day before', () => {
    expect(refusal(entry({ cullCumulative: 2 }), b)).toBe('Culled so far can’t go down: it was 3 on day 11.');
  });

  it('refuses total dead above a later day’s', () => {
    expect(refusal(entry({ mortalityCumulative: 21 }), b)).toBe('Total dead can’t be more than day 13’s 20.');
  });

  it('refuses culls above a later day’s', () => {
    expect(refusal(entry({ cullCumulative: 6 }), b)).toBe('Culled so far can’t be more than day 13’s 5.');
  });

  it('refuses dead and culls together above the flock', () => {
    expect(refusal(entry({ mortalityCumulative: 6000, cullCumulative: 61 }), basis())).toBe(
      'Dead and culled together (6,061) are more than the 6,060 birds placed.'
    );
  });

  it('accepts totals equal to the days either side', () => {
    expect(row(entry({ mortalityCumulative: 14, cullCumulative: 3 }), b).dayNumber).toBe(12);
    expect(row(entry({ mortalityCumulative: 20, cullCumulative: 5 }), b).dayNumber).toBe(12);
  });
});

describe('T-T6 · parseDayForm: the fields as the server reads them', () => {
  const raw = {
    batchId: '00000000-0000-4000-8000-0000000000b1',
    recordDate: '2026-10-17',
    mortalityCumulative: '14',
    cullCumulative: '3',
    feedKg: '302.5',
    standardConfirmed: false,
    avgWeightG: '',
    weightSampleSize: '',
    notes: '  ',
    clientRequestId: CRID,
    supersedesId: null
  };

  it('reads whole numbers from text, and blank optional fields as null', () => {
    expect(parseDayForm(raw)).toEqual({
      ok: true,
      batchId: raw.batchId,
      entry: {
        recordDate: '2026-10-17',
        mortalityCumulative: 14,
        cullCumulative: 3,
        feedKg: '302.5',
        standardConfirmed: false,
        avgWeightG: null,
        weightSampleSize: null,
        notes: null,
        clientRequestId: CRID,
        supersedesId: null
      }
    });
  });

  it('trims notes and keeps the weights', () => {
    const parsed = parseDayForm({ ...raw, avgWeightG: '410', weightSampleSize: '50', notes: ' Fan 2 fixed ' });
    expect(parsed.ok && parsed.entry).toMatchObject({ avgWeightG: 410, weightSampleSize: 50, notes: 'Fan 2 fixed' });
  });

  it.each([
    ['mortalityCumulative', '', 'Enter the total dead so far.'],
    ['mortalityCumulative', '14.5', 'Total dead is a whole number.'],
    ['mortalityCumulative', '-1', 'Total dead is a whole number.'],
    ['cullCumulative', '', 'Enter the number culled so far.'],
    ['cullCumulative', 'three', 'Culled so far is a whole number.'],
    ['feedKg', '', 'Enter the feed issued today, in kg.'],
    ['avgWeightG', '0', 'Average weight is whole grams, more than 0.'],
    ['weightSampleSize', '2.5', 'Birds weighed is a whole number, more than 0.']
  ])('refuses %s = %j: %s', (field, value, message) => {
    expect(parseDayForm({ ...raw, [field]: value })).toEqual({ ok: false, message });
  });

  it.each([
    ['a batch id that is not a uuid', { batchId: 'B1' }],
    ['a date that is not ISO', { recordDate: '17/10/2026' }],
    ['a client request id that is not a uuid', { clientRequestId: 'x' }],
    ['a flag that is not a boolean', { standardConfirmed: 'yes' }],
    ['nothing at all', null]
  ])('refuses %s, with no detail a tampered request could use', (_label, change) => {
    const input = change === null ? null : { ...raw, ...change };
    expect(parseDayForm(input)).toEqual({ ok: false, message: 'Something in this entry could not be read. Reload and try again.' });
  });
});
