/**
 * U9 v1: the money going out in the 45-day window, bill by bill. Every row is
 * one engine cash flow, named; the rows must add up to the figure on the card.
 */
import { FIXTURE_7 } from '../../lib/u9/fixture.js';
import { buildConsole } from '../../lib/u9/console.js';

const view = buildConsole(FIXTURE_7);
const out = view.outgoing;

describe('the outgoing breakdown', () => {
  it('adds up to the "going out" figure, exactly', () => {
    const total = out.rows.reduce((sum, r) => sum + r.amount_cents, 0n);
    expect(total).toBe(view.explained.out_in_window.value);
  });

  it('lists every payment in the window, in date order', () => {
    expect(out.rows.map((r) => r.date)).toStrictEqual([
      '2026-03-08',
      '2026-03-08',
      '2026-03-13',
      '2026-03-22',
      '2026-03-29',
      '2026-04-05',
      '2026-04-12'
    ]);
    expect([...out.rows.map((r) => r.date)].sort()).toStrictEqual(out.rows.map((r) => r.date));
  });

  it('names each bill by its kind, and keeps the engine’s own description', () => {
    const labour = out.rows[0]!;
    expect(labour).toMatchObject({ day: 31, label: 'Overheads', amount_cents: 64_000n, planned: false });
    expect(labour.description).toContain('Labour');
    expect(out.rows[1]).toMatchObject({ label: 'Feed, planned draws', amount_cents: 135_254n, planned: true });
    expect(out.rows[2]).toMatchObject({ label: 'Feed delivery, planned', planned: true });
  });

  it('marks the planned feed that covers days after the harvest plan clears the flock', () => {
    expect(out.rows.filter((r) => r.after_harvest).map((r) => r.date)).toStrictEqual(['2026-04-05', '2026-04-12']);
    expect(out.feed_past_harvest).toStrictEqual({ harvest_day: 31, planned_to_day: 41, draws: 2 });
  });
});
