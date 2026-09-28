/**
 * The plain-language layer (U9 visual pass, AD-100). Engine enums stay stable
 * inside; what a farmer reads comes from one mapping file. These tests pin the
 * translations and guard the screen against an enum name leaking through.
 */
import { buildConsole } from '../../lib/u9/console.js';
import { FIXTURE_7 } from '../../lib/u9/fixture.js';
import {
  OVERHEAD_BASIS_LABEL,
  OVERHEAD_TIMING_LABEL,
  PHASE_LABEL,
  plainFlowDescription
} from '../../lib/display-labels.js';

/** An engine enum token: two or more capitals, optionally joined by underscores. */
const ENUM_TOKEN = /\b[A-Z]{2,}(?:_[A-Z]+)+\b|\b(?:STARTER|GROWER|FINISHER|GATE|BULK|PLACEMENT|MONTHLY)\b/;

describe('the mapping file', () => {
  it('names the overhead bases and timings in plain words', () => {
    expect(OVERHEAD_BASIS_LABEL).toEqual({ PER_BIRD: 'Per bird', PER_BATCH: 'One-time charge' });
    expect(OVERHEAD_TIMING_LABEL).toEqual({
      PLACEMENT: 'on placement day',
      MONTHLY: 'monthly',
      HARVEST_COMPLETE: 'on harvest day'
    });
  });

  it('names the feed phases in plain words', () => {
    expect(PHASE_LABEL).toEqual({ STARTER: 'starter', GROWER: 'grower', FINISHER: 'finisher' });
  });
});

describe('plainFlowDescription', () => {
  it('rewrites an overhead line, keeping that its date is assumed', () => {
    expect(plainFlowDescription('OVERHEAD', 'Labour (PER_BATCH, HARVEST_COMPLETE, timing assumed — OQ-19)')).toBe(
      'Labour · One-time charge, on harvest day · date assumed'
    );
  });

  it('keeps the housed days on a monthly instalment', () => {
    expect(
      plainFlowDescription('OVERHEAD', 'Electricity (PER_BIRD, MONTHLY, timing assumed — OQ-19, 30 housed days)')
    ).toBe('Electricity · Per bird, monthly, 30 housed days · date assumed');
  });

  it('rewrites a recorded feed draw', () => {
    expect(plainFlowDescription('FEED_DRAW_PAYMENT', '12 bags GROWER drawn 2026-03-01')).toBe(
      '12 bags of grower, collected 1 Mar'
    );
  });

  it('rewrites sales channels and pricing bases', () => {
    expect(plainFlowDescription('GATE_RECEIPT', '40 birds GATE')).toBe('40 birds at the gate');
    expect(
      plainFlowDescription('BULK_RECEIPT', '1200 birds BULK, net of the abattoir fee and the run (PER_KG)')
    ).toBe('1200 birds in bulk, net of the abattoir fee and the run (priced per kg)');
  });

  it('passes through a description it does not recognise, unchanged', () => {
    expect(plainFlowDescription('CHICK_COST', '5000 chicks at 100 cents')).toBe('5000 chicks at 100 cents');
  });
});

describe('the console shows no engine enum names', () => {
  it('in any bill description', () => {
    const view = buildConsole(FIXTURE_7);
    const leaks = view.outgoing.rows.map((r) => r.description).filter((d) => ENUM_TOKEN.test(d));
    expect(leaks).toEqual([]);
  });
});

/**
 * Our own bookkeeping: open-question and decision numbers, invariant numbers,
 * and the client's name. The reader is the client, so a stated figure is
 * "Stated by you", never "Stated by Daniel (OQ-23)".
 */
const INTERNAL_REFERENCE = /\b(OQ|AD|TD)-\d+|\binvariant \d+|\bDaniel/;

describe('the console shows no internal references', () => {
  const view = buildConsole(FIXTURE_7);

  it('in any explanation: formula, input names, values or sources', () => {
    const texts = Object.values(view.explained).flatMap((e) => [
      e.formula,
      ...Object.entries(e.inputs).flatMap(([name, input]) => [name, String(input.value), input.source])
    ]);
    expect(texts.filter((t) => INTERNAL_REFERENCE.test(t))).toEqual([]);
  });

  it('in any bill description', () => {
    const leaks = view.outgoing.rows.map((r) => r.description).filter((d) => INTERNAL_REFERENCE.test(d));
    expect(leaks).toEqual([]);
  });

  it('and a figure the client gave is attributed to the reader', () => {
    expect(view.explained.ceiling.inputs['Stated ceiling (birds)']?.source).toBe('Stated by you');
  });
});
