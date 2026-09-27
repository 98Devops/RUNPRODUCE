/**
 * U9 v1: the decision console's three cards, built from fixture 7 by the
 * engine. Every figure asserted here is the engine's; the view model only picks
 * and shapes them.
 */
import type { EngineInput } from '@runproduce/engine';
import golden from '../../../../packages/engine/tests/golden/07-hold-cost-day-30-to-35.json';
import { parseFixtureInput } from '../../../../packages/engine/tests/golden/_shared.js';
import { FIXTURE_7, PLACEMENT_CEILING_BIRDS } from '../../lib/u9/fixture.js';
import { buildConsole } from '../../lib/u9/console.js';

describe('the hardcoded input', () => {
  it('is golden fixture 7, plus only the placement ceiling', () => {
    const { max_placement_birds, ...parameters } = FIXTURE_7.parameters;
    expect(max_placement_birds).toBe(PLACEMENT_CEILING_BIRDS);
    expect({ ...FIXTURE_7, parameters }).toStrictEqual(parseFixtureInput(golden.input) as EngineInput);
  });
});

describe('buildConsole(fixture 7)', () => {
  const view = buildConsole(FIXTURE_7);

  it('states the batch and where it stands today', () => {
    expect(view.batch).toStrictEqual({
      placement_date: '2026-02-06',
      chick_count: 5000,
      as_of: '2026-03-07',
      as_of_day: 30
    });
  });

  describe('card 1 · the recommendation (Maximum Growth)', () => {
    const rec = view.recommendation;

    it('places the ceiling, on the earliest date the biosecurity gap allows', () => {
      expect(rec.birds).toBe(5000);
      expect(rec.placement_date).toBe('2026-03-22');
      expect(rec.harvest_completion_date).toBe('2026-03-08');
      expect(rec.gap_days).toBe(14);
      expect(rec.ceiling_birds).toBe(5000);
    });

    it('reports how insensitive the choice was, not only the winner', () => {
      expect(rec.candidates_considered).toBe(155_000);
      expect(rec.tied_candidates).toBe(31);
    });

    it('never claims the reserve floor was checked: there is no opening balance', () => {
      expect(rec.reserve_floor_checked).toBe(false);
    });

    it('carries the harvest plan confidence, with what it rests on', () => {
      expect(rec.confidence).toBe('assumed');
      expect(rec.confidence_basis).toStrictEqual({
        dressing_yield_pct: 62,
        mortality_source: 'assumed',
        preharvest_uplift_source: 'assumed'
      });
    });
  });

  describe('card 2 · the cash calendar', () => {
    const cal = view.calendar;

    it('runs 45 days from today', () => {
      expect(cal.points).toHaveLength(45);
      expect(cal.points[0]).toMatchObject({ day: 30, date: '2026-03-07' });
      expect(cal.points[44]).toMatchObject({ day: 74, date: '2026-04-20' });
    });

    it('plots net cash since placement, because the opening balance is unknown', () => {
      expect(cal.basis).toBe('net_since_placement');
      expect(cal.points[0]!.net_cents).toBe(-585_720);
      expect(cal.points.find((p) => p.date === '2026-03-08')!.net_cents).toBe(-784_974);
    });

    it('marks the trough the engine found', () => {
      expect(cal.trough).toStrictEqual({ day: 66, date: '2026-04-12', net_cents: -1_956_168 });
    });

    it('says there are no receipts in it, rather than letting a falling line speak alone', () => {
      expect(cal.receipts_cents).toBe(0);
      expect(cal.out_in_window_cents).toBe(1_370_448);
    });

    it('holds the reserve floor back from the chart, with the reason', () => {
      expect(cal.reserve_floor).toStrictEqual({ cents: 0, drawn: false });
    });

    it('carries both of the calendar confidences', () => {
      expect(cal.overhead_timing).toBe('assumed');
      expect(cal.planned_feed_confidence).toBe('assumed');
    });

    it('marks the harvest day inside the window', () => {
      expect(cal.harvest).toStrictEqual({ day: 31, date: '2026-03-08' });
    });
  });

  describe('card 3 · the three modes, in fixed order', () => {
    it('lists Cover Fast, Maximum Growth, Build Reserve, in that order', () => {
      expect(view.modes.map((m) => m.mode)).toStrictEqual(['COVER_FAST', 'MAXIMUM_GROWTH', 'BUILD_RESERVE']);
    });

    it('Maximum Growth answers; the other two say what they need', () => {
      const [coverFast, growth, reserve] = view.modes;
      expect(growth).toMatchObject({ answered: true, birds: 5000, placement_date: '2026-03-22' });
      expect(coverFast).toMatchObject({ answered: false, needs: ['sales_forecast'] });
      expect(reserve).toMatchObject({ answered: false, needs: ['opening_cash', 'sales_forecast'] });
    });
  });
});
