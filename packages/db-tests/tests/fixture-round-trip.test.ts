/**
 * T-RP1 · Golden fixtures through the database. AN ARCHITECTURAL CANARY.
 *
 * Each golden fixture's input is written through the write functions, read back
 * through the views as the organisation's OWNER, and assembled into
 * `EngineInput`. The engine's decision on the loaded input must equal its
 * decision on the fixture's in-memory input, across the whole decision.
 *
 * When this goes red, the engine and the database disagree about what an
 * `EngineInput` is. That is a failure of the U6 schema strategy, not a bug
 * ticket (code-standards.md, "Some tests are architectural canaries"). Stop,
 * find what diverged, fix it at the source. Never adjust an expectation, add a
 * tolerance, exclude a field or skip a fixture to make it pass.
 */
import { addDays, computeDecision, type EngineInput, type IsoDate } from '@runproduce/engine';
import { loadFixtures, parseFixtureInput } from '../../engine/tests/golden/_shared.js';
import { curvePayload, parameterSetPayload } from '../src/payloads.js';
import { newMember, newOrg, pool, rpc, uuid, type Member } from '../src/harness.js';
import { loadEngineInputForTest } from '../src/load-engine-input.js';

afterAll(async () => {
  await pool.end();
});

function grams(kg: number, label: string): number {
  const g = kg * 1000;
  if (!Number.isInteger(g)) throw new Error(`${label}: ${kg} kg is not a whole number of grams`);
  return g;
}

async function recordFixture(owner: Member, orgId: string, input: EngineInput): Promise<string> {
  if (input.curve !== undefined) {
    throw new Error('fixture carries its own curve; T-RP1 records the seed curve only');
  }
  const curveId = await rpc<string>(owner, 'create_breed_curve', { payload: curvePayload(orgId) });
  await rpc(owner, 'create_parameter_set', {
    payload: parameterSetPayload(orgId, input.batch.placement_date, input.parameters)
  });
  const batchId = await rpc<string>(owner, 'record_batch', {
    payload: {
      org_id: orgId,
      code: `FX-${uuid().slice(0, 8)}`,
      breed_curve_id: curveId,
      client_request_id: uuid(),
      placement_date: input.batch.placement_date,
      chick_count: input.batch.chick_count,
      extra_chick_count: input.batch.extra_chick_count,
      chick_price_cents: input.batch.chick_price_cents.toString()
    }
  });

  if (input.records.length > 0) {
    await rpc(owner, 'record_daily_records', {
      p_batch_id: batchId,
      p_rows: input.records.map((r) => ({
        client_request_id: uuid(),
        record_date: addDays(input.batch.placement_date, r.day_number - 1),
        mortality_cumulative: r.mortality_cumulative,
        cull_cumulative: r.cull_cumulative,
        feed_starter_g: grams(r.feed_starter_kg, 'feed_starter_kg'),
        feed_grower_g: grams(r.feed_grower_kg, 'feed_grower_kg'),
        feed_finisher_g: grams(r.feed_finisher_kg, 'feed_finisher_kg'),
        avg_weight_g: r.avg_weight_g,
        weight_sample_size: r.weight_sample_size,
        notes: null
      }))
    });
  }

  for (const d of input.draws) {
    await rpc(owner, 'record_feed_draw', {
      payload: {
        batch_id: batchId,
        client_request_id: uuid(),
        collection_date: d.collection_date,
        phase: d.phase,
        bags: String(d.bags),
        feed_g: grams(d.kg, 'draw kg'),
        price_per_bag_cents: d.price_per_bag_cents.toString(),
        terms_days: d.terms_days,
        reference: null
      }
    });
  }

  for (const s of input.sales) {
    await rpc(owner, 'record_sales_order', {
      payload: {
        batch_id: batchId,
        client_request_id: uuid(),
        channel: s.channel,
        order_date: s.order_date,
        bird_count: s.bird_count,
        avg_live_weight_g: s.avg_live_weight_g,
        avg_dressed_weight_g: s.avg_dressed_weight_g,
        pricing_basis: s.pricing_basis,
        price_cents_per_bird: s.price_cents_per_bird?.toString() ?? null,
        price_cents_per_kg: s.price_cents_per_kg?.toString() ?? null,
        terms_days: s.terms_days,
        bands: (s.bands ?? []).map((b) => ({
          dressed_floor_g: b.dressed_floor_g,
          price_cents_per_bird: b.price_cents_per_bird.toString()
        }))
      }
    });
  }
  return batchId;
}

type Outcome = { readonly value: unknown } | { readonly threw: string };

function outcome(read: () => unknown): Outcome {
  try {
    return { value: read() };
  } catch (error) {
    return { threw: error instanceof Error ? `${error.name}: ${error.message}` : String(error) };
  }
}

function decisionOutcomes(input: EngineInput): Record<string, Outcome> {
  const result = computeDecision(input);
  if (result.kind !== 'ok') return { result: { value: result } };
  const d = result.decision;
  return {
    production: outcome(() => d.production),
    costing: outcome(() => d.costing),
    feed: outcome(() => d.feed),
    harvest: outcome(() => d.harvest),
    allocation: outcome(() => d.allocation)
  };
}

describe('T-RP1 · golden fixtures through the database (architectural canary)', () => {
  const fixtures = loadFixtures();

  it('covers every golden fixture file', () => {
    expect(fixtures.length).toBeGreaterThan(0);
  });

  it.each(fixtures.map((f) => [f.id, f.name, f] as const))('fixture %i (%s)', async (_id, _name, fixture) => {
    const input = parseFixtureInput(fixture.input) as EngineInput;
    const orgId = await newOrg(`T-RP1 fixture ${fixture.id}`);
    const owner = await newMember(orgId, 'OWNER');

    const batchId = await recordFixture(owner, orgId, input);
    const loaded = await loadEngineInputForTest(owner.client, batchId, input.asOf as IsoDate);

    expect(decisionOutcomes(loaded)).toEqual(decisionOutcomes(input));
  });
});
