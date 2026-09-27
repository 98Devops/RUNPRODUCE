/**
 * U9 v1: every figure on the console is an `Explained<T>` (ui-context.md, "The
 * explainability pattern"). The engine does not emit these yet (TD-8), so the
 * view model assembles them from engine output.
 *
 * What keeps that honest is reconciliation: each test recomputes the figure
 * from the explanation's own inputs. An explanation whose inputs do not produce
 * its value fails here, so none can be written that merely sounds right.
 */
import { addDays, type Cents, type Explained, type IsoDate } from '@runproduce/engine';
import { FIXTURE_7 } from '../../lib/u9/fixture.js';
import { buildConsole } from '../../lib/u9/console.js';

const view = buildConsole(FIXTURE_7);
const ex = view.explained;

function input<T>(explained: Explained<unknown>, key: string): T {
  const entry = explained.inputs[key];
  if (entry === undefined) throw new Error(`no input "${key}"; has ${Object.keys(explained.inputs).join(', ')}`);
  expect(entry.source.length).toBeGreaterThan(0);
  return entry.value as T;
}

function sumOfInputs(explained: Explained<Cents>): bigint {
  return Object.values(explained.inputs).reduce((sum, i) => sum + (i.value as bigint), 0n);
}

describe('every explanation states a formula and a source for each input', () => {
  it.each(Object.entries(ex))('%s', (_name, explained) => {
    expect(explained.formula.length).toBeGreaterThan(0);
    expect(Object.keys(explained.inputs).length).toBeGreaterThan(0);
    for (const entry of Object.values(explained.inputs)) expect(entry.source.length).toBeGreaterThan(0);
  });
});

describe('card 1 · each figure reconciles to its inputs', () => {
  it('options considered = sizes x dates', () => {
    expect(ex.candidates_considered.value).toBe(155_000);
    const sizes = input<number>(ex.candidates_considered, 'Sizes, 1 bird to the ceiling');
    const dates = input<number>(ex.candidates_considered, 'Placement dates');
    expect(sizes * dates).toBe(ex.candidates_considered.value);
    expect(input<number>(ex.candidates_considered, 'Placement step (birds)')).toBe(1);
    expect(ex.candidates_considered.confidence).toBe('measured');
  });

  it('dates that tie = every date, since each can take the full ceiling', () => {
    expect(ex.tied_candidates.value).toBe(31);
    expect(input<number>(ex.tied_candidates, 'Placement dates')).toBe(ex.tied_candidates.value);
  });

  it('birds = the ceiling, because the unchecked floor refuses nothing', () => {
    expect(ex.birds.value).toBe(5000);
    expect(input<number>(ex.birds, 'Your placement ceiling (birds)')).toBe(ex.birds.value);
    expect(input<string>(ex.birds, 'Reserve floor')).toBe('Not checked');
    expect(ex.birds.confidence).toBe('assumed');
  });

  it('the placement date = the clearing date + the biosecurity gap', () => {
    const clears = input<IsoDate>(ex.placement_date, 'This batch clears');
    const gap = input<number>(ex.placement_date, 'Biosecurity gap (days)');
    expect(addDays(clears, gap)).toBe(ex.placement_date.value);
    expect(ex.placement_date.value).toBe('2026-03-22');
  });

  it('the clearing date = placement + the gate window’s last day, less one', () => {
    const placed = input<IsoDate>(ex.harvest_completion, 'This batch placed');
    const lastDay = input<number>(ex.harvest_completion, 'Last gate day (cycle day)');
    expect(addDays(placed, lastDay - 1)).toBe(ex.harvest_completion.value);
    expect(ex.harvest_completion.confidence).toBe('assumed');
  });

  it('the gap and the ceiling are the client’s own figures', () => {
    expect(ex.gap_days.value).toBe(14);
    expect(ex.gap_days.confidence).toBe('measured');
    expect(ex.ceiling.value).toBe(5000);
    expect(ex.ceiling.confidence).toBe('measured');
  });
});

describe('card 2 · each money figure is the sum of the flows it names', () => {
  it('the lowest point = every flow from placement to the trough, by kind', () => {
    expect(ex.trough.value).toBe(-1_956_168n);
    expect(sumOfInputs(ex.trough)).toBe(ex.trough.value);
    expect(ex.trough.inputs['Chicks']?.value).toBe(-500_000n);
    expect(ex.trough.confidence).toBe('assumed');
  });

  it('going out = every payment due in the 45 days, by kind', () => {
    expect(ex.out_in_window.value).toBe(1_370_448n);
    expect(sumOfInputs(ex.out_in_window)).toBe(ex.out_in_window.value);
    expect(ex.out_in_window.confidence).toBe('assumed');
  });
});
