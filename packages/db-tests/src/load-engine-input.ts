/**
 * Reads a batch back out of the database and assembles `EngineInput`, for
 * T-RP1 only.
 *
 * **This is a test-local stand-in, not chunk 7's repository.** The approved
 * design (AD-90) reads everything in one `engine_snapshot` statement and maps
 * it with Zod (AD-91, AD-92). That code is scheduled after chunk 5. Until it
 * lands, this reads the chunk 5 views over PostgREST as the signed-in owner
 * (so RLS applies) and applies AD-92's mapping table exactly. When
 * `loadEngineInput` exists, T-RP1 switches to it and this file is deleted, not
 * kept beside it.
 *
 * Money and bags are cast to text in the select (AD-91), and a number where a
 * string belongs throws.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  dayNumberFor,
  type BreedCurve,
  type Cents,
  type DailyRecord,
  type EngineInput,
  type FeedDraw,
  type IsoDate,
  type Parameters,
  type SalesOrder
} from '@runproduce/engine';

type Row = Record<string, unknown>;

function cents(value: unknown, label: string): Cents {
  if (typeof value !== 'string' || !/^-?\d+$/.test(value)) {
    throw new Error(`${label}: money must arrive as an integer string, got ${JSON.stringify(value)}`);
  }
  return BigInt(value) as Cents;
}

function centsOrNull(value: unknown, label: string): Cents | null {
  return value === null ? null : cents(value, label);
}

function bags(value: unknown): number {
  if (typeof value !== 'string' || !/^\d+(\.\d{1,2})?$/.test(value)) {
    throw new Error(`bags must arrive as a string with at most two decimals, got ${JSON.stringify(value)}`);
  }
  return Number(value);
}

async function rows(query: PromiseLike<{ data: unknown; error: { message: string } | null }>, label: string): Promise<Row[]> {
  const { data, error } = await query;
  if (error) throw new Error(`${label}: ${error.message}`);
  return data as Row[];
}

export async function loadEngineInputForTest(client: SupabaseClient, batchId: string, asOf: IsoDate): Promise<EngineInput> {
  const [batch] = await rows(
    client
      .from('batches')
      .select('id,org_id,breed_curve_id,placement_date,chick_count,extra_chick_count,chick_price_cents::text')
      .eq('id', batchId),
    'batches'
  );
  if (!batch) throw new Error(`batch ${batchId} not visible`);
  const placement = batch['placement_date'] as IsoDate;

  const [set] = await rows(
    client
      .from('parameter_sets')
      .select(
        'id,mortality_base_rate_bp_daily,mortality_ramp_start_day,mortality_ramp_rate_bp_daily,slaughter_target_g,' +
          'gate_pricing_basis,gate_price_cents_per_bird::text,gate_price_cents_per_kg::text,gate_capacity_per_day,' +
          'abattoir_fee_cents::text,transport_cents_per_bird::text,delivery_mode,feed_terms_days,' +
          'delivery_cents_per_tonne::text,reserve_floor_cents::text,dressing_yield_pct,calibration_trailing_days_min,' +
          'placement_step_birds,max_placement_birds'
      )
      .eq('org_id', batch['org_id'] as string)
      .lte('effective_from', asOf)
      .order('effective_from', { ascending: false })
      .order('revision', { ascending: false })
      .limit(1),
    'parameter_sets'
  );
  if (!set) throw new Error(`no parameter set in force on ${asOf}`);
  const setId = set['id'] as string;

  const [overheads, bands, feedPrices, curves, points, phases, records, draws, sales] = await Promise.all([
    rows(
      client
        .from('overhead_lines')
        .select('key,label,basis,timing,amount_cents::text,measured_at_flock_size,confidence,source')
        .eq('parameter_set_id', setId)
        .order('position'),
      'overhead_lines'
    ),
    rows(
      client.from('planning_bulk_bands').select('dressed_floor_g,price_cents_per_bird::text').eq('parameter_set_id', setId).order('dressed_floor_g'),
      'planning_bulk_bands'
    ),
    rows(client.from('feed_prices').select('phase,price_per_bag_cents::text,bag_kg').eq('parameter_set_id', setId), 'feed_prices'),
    rows(client.from('breed_curves').select('source').eq('id', batch['breed_curve_id'] as string), 'breed_curves'),
    rows(
      client.from('breed_curve_points').select('day_number,weight_g,feed_g,phase').eq('curve_id', batch['breed_curve_id'] as string).order('day_number'),
      'breed_curve_points'
    ),
    rows(client.from('breed_curve_phases').select('phase,first_day,last_day').eq('curve_id', batch['breed_curve_id'] as string).order('first_day'), 'breed_curve_phases'),
    rows(
      client
        .from('daily_records')
        .select('record_date,mortality_cumulative,cull_cumulative,feed_starter_g,feed_grower_g,feed_finisher_g,avg_weight_g,weight_sample_size')
        .eq('batch_id', batchId)
        .order('record_date'),
      'daily_records'
    ),
    rows(
      client
        .from('feed_draws')
        .select('collection_date,phase,bags::text,feed_g,price_per_bag_cents::text,terms_days')
        .eq('batch_id', batchId)
        .order('collection_date')
        .order('created_at'),
      'feed_draws'
    ),
    rows(
      client
        .from('sales_orders')
        .select(
          'channel,order_date,bird_count,avg_live_weight_g,avg_dressed_weight_g,pricing_basis,' +
            'price_cents_per_bird::text,price_cents_per_kg::text,terms_days,bands'
        )
        .eq('batch_id', batchId)
        .order('order_date')
        .order('created_at'),
      'sales_orders'
    )
  ]);

  const priceFor = new Map(feedPrices.map((f) => [f['phase'] as string, f]));
  const curve: BreedCurve = {
    source: curves[0]!['source'] as string,
    points: points.map((p) => ({
      day_number: p['day_number'],
      weight_g: p['weight_g'],
      feed_g: p['feed_g'],
      phase: p['phase']
    })) as unknown as BreedCurve['points'],
    phases: phases.map((ph) => {
      const price = priceFor.get(ph['phase'] as string);
      if (!price) throw new Error(`parameter set has no feed price for ${String(ph['phase'])}`);
      return {
        phase: ph['phase'],
        first_day: ph['first_day'],
        last_day: ph['last_day'],
        price_per_bag_cents: cents(price['price_per_bag_cents'], 'price_per_bag_cents'),
        bag_kg: price['bag_kg']
      };
    }) as unknown as BreedCurve['phases']
  };

  const parameters = {
    mortality: {
      base_rate_bp_daily: set['mortality_base_rate_bp_daily'],
      preharvest_ramp_start_day: set['mortality_ramp_start_day'],
      preharvest_ramp_rate_bp_daily: set['mortality_ramp_rate_bp_daily']
    },
    slaughter_target_g: set['slaughter_target_g'],
    gate_price_cents_per_bird: centsOrNull(set['gate_price_cents_per_bird'], 'gate_price_cents_per_bird'),
    gate_price_cents_per_kg: centsOrNull(set['gate_price_cents_per_kg'], 'gate_price_cents_per_kg'),
    gate_pricing_basis: set['gate_pricing_basis'],
    gate_capacity_per_day: set['gate_capacity_per_day'],
    abattoir_fee_cents: centsOrNull(set['abattoir_fee_cents'], 'abattoir_fee_cents'),
    transport_cents_per_bird: centsOrNull(set['transport_cents_per_bird'], 'transport_cents_per_bird'),
    delivery_mode: set['delivery_mode'],
    feed_terms_days: set['feed_terms_days'],
    reserve_floor_cents: cents(set['reserve_floor_cents'], 'reserve_floor_cents'),
    overheads: {
      lines: overheads.map((l) => ({
        key: l['key'],
        label: l['label'],
        basis: l['basis'],
        timing: l['timing'],
        amount_cents: cents(l['amount_cents'], 'amount_cents'),
        measured_at_flock_size: l['measured_at_flock_size'],
        confidence: l['confidence'],
        source: l['source']
      }))
    },
    dressing_yield_pct: set['dressing_yield_pct'],
    bulk_bands: bands.map((b) => ({
      dressed_floor_g: b['dressed_floor_g'],
      price_cents_per_bird: cents(b['price_cents_per_bird'], 'price_cents_per_bird')
    })),
    delivery_cents_per_tonne: cents(set['delivery_cents_per_tonne'], 'delivery_cents_per_tonne'),
    calibration_trailing_days_min: set['calibration_trailing_days_min'],
    placement_step_birds: set['placement_step_birds'],
    // AD-92: a null ceiling is OMITTED, never passed as null.
    ...(set['max_placement_birds'] === null ? {} : { max_placement_birds: set['max_placement_birds'] })
  } as unknown as Parameters;

  return {
    asOf,
    batch: {
      placement_date: placement,
      chick_count: batch['chick_count'] as number,
      extra_chick_count: batch['extra_chick_count'] as number,
      chick_price_cents: cents(batch['chick_price_cents'], 'chick_price_cents')
    },
    parameters,
    curve,
    records: records.map(
      (r) =>
        ({
          day_number: dayNumberFor(placement, r['record_date'] as IsoDate),
          mortality_cumulative: r['mortality_cumulative'],
          cull_cumulative: r['cull_cumulative'],
          // TD-5: the engine types feed as kg; the database stores grams.
          feed_starter_kg: (r['feed_starter_g'] as number) / 1000,
          feed_grower_kg: (r['feed_grower_g'] as number) / 1000,
          feed_finisher_kg: (r['feed_finisher_g'] as number) / 1000,
          avg_weight_g: r['avg_weight_g'],
          weight_sample_size: r['weight_sample_size']
        }) as unknown as DailyRecord
    ),
    draws: draws.map(
      (d) =>
        ({
          collection_date: d['collection_date'],
          phase: d['phase'],
          bags: bags(d['bags']),
          kg: (d['feed_g'] as number) / 1000,
          price_per_bag_cents: cents(d['price_per_bag_cents'], 'price_per_bag_cents'),
          terms_days: d['terms_days']
        }) as unknown as FeedDraw
    ),
    sales: sales.map((s) => {
      const orderBands = s['bands'] as Row[];
      return {
        channel: s['channel'],
        order_date: s['order_date'],
        bird_count: s['bird_count'],
        avg_live_weight_g: s['avg_live_weight_g'],
        avg_dressed_weight_g: s['avg_dressed_weight_g'],
        pricing_basis: s['pricing_basis'],
        price_cents_per_bird: centsOrNull(s['price_cents_per_bird'], 'price_cents_per_bird'),
        price_cents_per_kg: centsOrNull(s['price_cents_per_kg'], 'price_cents_per_kg'),
        // AD-92: zero band rows is `null`, the engine's "not supplied".
        bands:
          orderBands.length === 0
            ? null
            : orderBands.map((b) => ({
                dressed_floor_g: b['dressed_floor_g'],
                price_cents_per_bird: cents(b['price_cents_per_bird'], 'band price_cents_per_bird')
              })),
        terms_days: s['terms_days']
      } as unknown as SalesOrder;
    })
  };
}
