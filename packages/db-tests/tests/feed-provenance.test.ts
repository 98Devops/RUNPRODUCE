/**
 * Feed provenance in the database (U7 chunk 3, D20; the D3 addition, AD-99,
 * AD-102, AD-103). Three nullable columns on `facts.daily_record_versions`,
 * required keys in `record_daily_records`' payload, and carried through
 * `public.daily_records`, `public.daily_records_history` and `engine_snapshot`.
 *
 * Written as a WORKER throughout: the capture form is a WORKER's, and the checks
 * must hold for the role that cannot see the placement (U6 D22).
 */
import { day, newBatch, newFarm, type Farm } from '../src/payloads.js';
import { pool, refused, rpc, rowCount, type Member } from '../src/harness.js';

let farm: Farm;

beforeAll(async () => {
  farm = await newFarm('D20 feed provenance');
});

afterAll(async () => {
  await pool.end();
});

const placement = { placement_date: '2026-02-06', chick_count: 100, extra_chick_count: 0, chick_price_cents: '100' };

const STANDARD_STARTER = { feed_entry_source: 'STANDARD_CONFIRMED', feed_phase: 'STARTER', feed_phase_source: 'FROM_CURVE' };
const MEASURED_FINISHER_PAST_CURVE = {
  feed_starter_g: 0,
  feed_finisher_g: 1200,
  feed_entry_source: 'MEASURED',
  feed_phase: 'FINISHER',
  feed_phase_source: 'EXTRAPOLATED_BEYOND_CURVE'
};
const UNRECORDED = { feed_entry_source: null, feed_phase: null, feed_phase_source: null };

function write(by: Member, batchId: string, rows: Record<string, unknown>[]): Promise<string[]> {
  return rpc<string[]>(by, 'record_daily_records', { p_batch_id: batchId, p_rows: rows });
}

async function versions(batchId: string): Promise<number> {
  return rowCount('select 1 from facts.daily_record_versions where batch_id = $1', [batchId]);
}

type Provenance = [string, string | null, string | null, string | null];
const provenance = (rows: Array<Record<string, unknown>>): Provenance[] =>
  rows.map((r) => [
    r['record_date'] as string,
    r['feed_entry_source'] as string | null,
    r['feed_phase'] as string | null,
    r['feed_phase_source'] as string | null
  ]);

describe('D20 · provenance is stored and read back through every surface', () => {
  const EXPECTED: Provenance[] = [
    ['2026-02-06', 'STANDARD_CONFIRMED', 'STARTER', 'FROM_CURVE'],
    ['2026-02-07', 'MEASURED', 'FINISHER', 'EXTRAPOLATED_BEYOND_CURVE'],
    ['2026-02-08', null, null, null]
  ];
  let batchId: string;

  beforeAll(async () => {
    batchId = await newBatch(farm, placement);
    await write(farm.worker, batchId, [
      day({ record_date: '2026-02-06', mortality_cumulative: 0, cull_cumulative: 0, ...STANDARD_STARTER }),
      day({ record_date: '2026-02-07', mortality_cumulative: 1, cull_cumulative: 0, ...MEASURED_FINISHER_PAST_CURVE }),
      day({ record_date: '2026-02-08', mortality_cumulative: 1, cull_cumulative: 0, ...UNRECORDED })
    ]);
  });

  it('public.daily_records, read by the WORKER who wrote them', async () => {
    const { data, error } = await farm.worker.client
      .from('daily_records')
      .select('record_date, feed_entry_source, feed_phase, feed_phase_source')
      .eq('batch_id', batchId)
      .order('record_date');
    expect(error).toBeNull();
    expect(provenance(data ?? [])).toEqual(EXPECTED);
  });

  it('public.daily_records_history', async () => {
    const { data, error } = await farm.owner.client
      .from('daily_records_history')
      .select('record_date, feed_entry_source, feed_phase, feed_phase_source')
      .eq('batch_id', batchId)
      .order('record_date');
    expect(error).toBeNull();
    expect(provenance(data ?? [])).toEqual(EXPECTED);
  });

  it('engine_snapshot, with every key present on every record', async () => {
    const snapshot = await rpc<{ daily_records: Array<Record<string, unknown>> }>(farm.owner, 'engine_snapshot', {
      p_batch_id: batchId,
      p_as_of: '2026-02-08'
    });
    expect(provenance(snapshot.daily_records)).toEqual(EXPECTED);
    for (const record of snapshot.daily_records) {
      expect(Object.keys(record)).toEqual(expect.arrayContaining(['feed_entry_source', 'feed_phase', 'feed_phase_source']));
    }
  });
});

describe('D20 · every provenance key is required, null allowed (present even when null)', () => {
  it.each(['feed_entry_source', 'feed_phase', 'feed_phase_source'])('refuses a row with no %s key', async (key) => {
    const batchId = await newBatch(farm, placement);
    const row = day({ record_date: '2026-02-06', mortality_cumulative: 0, cull_cumulative: 0 });
    delete row[key];
    const error = await refused(write(farm.worker, batchId, [row]), '22023');
    expect(error.message).toContain(`payload is missing "${key}"`);
    expect(await versions(batchId)).toBe(0);
  });
});

describe('D20 · the named CHECKs refuse a contradiction, as a WORKER, and write nothing', () => {
  it.each<[string, Record<string, unknown>, string]>([
    ['a phase with no phase source', { feed_phase: 'STARTER', feed_phase_source: null }, 'daily_record_versions_phase_with_source'],
    ['a phase source with no phase', { feed_phase: null, feed_phase_source: 'FROM_CURVE' }, 'daily_record_versions_phase_with_source'],
    [
      'feed in a second column when a phase is set',
      { feed_starter_g: 1000, feed_grower_g: 500, feed_phase: 'STARTER', feed_phase_source: 'FROM_CURVE' },
      'daily_record_versions_feed_under_phase'
    ],
    [
      'feed outside the column the phase names',
      { feed_starter_g: 1000, feed_phase: 'GROWER', feed_phase_source: 'FROM_CURVE' },
      'daily_record_versions_feed_under_phase'
    ],
    [
      'a confirmed standard past the curve (AD-102)',
      { ...MEASURED_FINISHER_PAST_CURVE, feed_entry_source: 'STANDARD_CONFIRMED' },
      'daily_record_versions_standard_from_curve'
    ],
    [
      'a confirmed standard with no phase at all (AD-102; a CHECK passes on NULL unless written not to)',
      { feed_entry_source: 'STANDARD_CONFIRMED', feed_phase: null, feed_phase_source: null },
      'daily_record_versions_standard_from_curve'
    ],
    ['an unknown entry source', { feed_entry_source: 'GUESSED' }, 'daily_record_versions_feed_entry_source_values'],
    ['an unknown phase', { feed_phase: 'PRESTARTER', feed_phase_source: 'FROM_CURVE' }, 'daily_record_versions_feed_phase_values'],
    ['an unknown phase source', { feed_phase: 'STARTER', feed_phase_source: 'ASSUMED' }, 'daily_record_versions_feed_phase_source_values']
  ])('%s', async (_what, change, constraint) => {
    const batchId = await newBatch(farm, placement);
    const error = await refused(
      write(farm.worker, batchId, [day({ record_date: '2026-02-06', mortality_cumulative: 0, cull_cumulative: 0, ...change })]),
      '23514'
    );
    expect(error.message).toContain(constraint);
    expect(await versions(batchId)).toBe(0);
  });

  it.each<[string, Record<string, unknown>]>([
    ['a 0 the operator typed, under a phase', { feed_starter_g: 0, feed_entry_source: 'MEASURED', feed_phase: 'STARTER', feed_phase_source: 'FROM_CURVE' }],
    ['a measured amount with no phase (an import of mixed historical days)', { feed_starter_g: 700, feed_grower_g: 300, feed_entry_source: 'MEASURED' }],
    ['nothing recorded about provenance', UNRECORDED]
  ])('accepts %s', async (_what, change) => {
    const batchId = await newBatch(farm, placement);
    await write(farm.worker, batchId, [day({ record_date: '2026-02-06', mortality_cumulative: 0, cull_cumulative: 0, ...change })]);
    expect(await versions(batchId)).toBe(1);
  });
});

describe('AD-103 · the database does not check the phase against the curve', () => {
  it('stores FINISHER on day 2, which the seed curve calls STARTER: the server derives the phase, not the database', async () => {
    const batchId = await newBatch(farm, placement);
    await write(farm.worker, batchId, [
      day({ record_date: '2026-02-07', mortality_cumulative: 0, cull_cumulative: 0, ...MEASURED_FINISHER_PAST_CURVE })
    ]);
    expect(await versions(batchId)).toBe(1);
  });
});

describe('D20 · provenance is part of the record: no-ops, corrections and voids', () => {
  const first = { record_date: '2026-02-06', mortality_cumulative: 0, cull_cumulative: 0, ...STANDARD_STARTER };

  it('an identical resubmission, provenance included, writes nothing and returns the same id', async () => {
    const batchId = await newBatch(farm, placement);
    const [id] = await write(farm.worker, batchId, [day(first)]);
    await expect(write(farm.worker, batchId, [day(first)])).resolves.toEqual([id]);
    expect(await versions(batchId)).toBe(1);
  });

  it('a change to provenance alone is a correction, not a silent no-op', async () => {
    const batchId = await newBatch(farm, placement);
    const [id] = await write(farm.worker, batchId, [day(first)]);
    const [corrected] = await write(farm.worker, batchId, [day({ ...first, feed_entry_source: 'MEASURED' })]);
    expect(corrected).not.toBe(id);
    expect(await versions(batchId)).toBe(2);
  });

  it('a void keeps the provenance of the record it voids', async () => {
    const batchId = await newBatch(farm, placement);
    const [id] = await write(farm.worker, batchId, [day(first)]);
    await write(farm.worker, batchId, [day({ ...first, supersedes_id: id!, voided: true })]);
    const { rows } = await pool.query(
      `select feed_entry_source, feed_phase, feed_phase_source from facts.daily_record_versions
        where batch_id = $1 and voided`,
      [batchId]
    );
    expect(rows).toEqual([STANDARD_STARTER]);
  });
});
