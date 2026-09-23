/**
 * U9 v1: the decision console's view model. Everything here is read from the
 * engine; this module only picks figures and shapes them for three cards.
 */
import {
  DEFAULT_PLACEMENT_STEP_BIRDS,
  addDays,
  computeDecision,
  dayNumberFor,
  daysBetween,
  enumerateCandidates,
  pickWinner,
  projectCashCalendar,
  type AllocationMode,
  type Candidate,
  type CashDay,
  type CashFlow,
  type CashFlowKind,
  type Cents,
  type Confidence,
  type EngineInput,
  type Explained,
  type IsoDate,
  type ScoredCandidate
} from '@runproduce/engine';
import { formatBirds, formatShortDate } from '../format.js';

/** The calendar card's horizon, counted from `asOf` inclusive. */
const WINDOW_DAYS = 45;

export type ModeNeed = 'opening_cash' | 'sales_forecast';

export type ModeView =
  | {
      readonly mode: AllocationMode;
      readonly answered: true;
      readonly birds: number;
      readonly placement_date: IsoDate;
      readonly reserve_floor_checked: boolean;
    }
  | { readonly mode: AllocationMode; readonly answered: false; readonly needs: readonly ModeNeed[] };

export interface CalendarPoint {
  readonly day: number;
  readonly date: IsoDate;
  /** Cents as a plain number, for the chart. Guarded to be exact. */
  readonly net_cents: number;
}

export interface ConsoleView {
  readonly batch: {
    readonly placement_date: IsoDate;
    readonly chick_count: number;
    readonly as_of: IsoDate;
    readonly as_of_day: number;
  };
  readonly recommendation: {
    readonly birds: number;
    readonly placement_date: IsoDate;
    readonly harvest_completion_date: IsoDate;
    readonly gap_days: number;
    readonly ceiling_birds: number;
    readonly candidates_considered: number;
    readonly tied_candidates: number;
    readonly reserve_floor_checked: boolean;
    readonly confidence: Confidence;
    readonly confidence_basis: {
      readonly dressing_yield_pct: number;
      readonly mortality_source: Confidence;
      readonly preharvest_uplift_source: Confidence;
    };
  };
  readonly calendar: {
    /**
     * The engine projects from an opening balance, and there is none to give it
     * (OQ-25). Projected from zero, every closing figure is exactly the net cash
     * moved since placement. It is labelled that, never "balance".
     */
    readonly basis: 'net_since_placement';
    readonly points: readonly CalendarPoint[];
    readonly trough: CalendarPoint;
    readonly receipts_cents: number;
    readonly out_in_window_cents: number;
    /** A floor is a bank balance; this chart has none, so it is not drawn. */
    readonly reserve_floor: { readonly cents: number; readonly drawn: false };
    readonly overhead_timing: Confidence;
    readonly planned_feed_confidence: Confidence;
    readonly harvest: { readonly day: number; readonly date: IsoDate };
  };
  readonly modes: readonly ModeView[];
  /**
   * Every business figure on the console, with its formula, inputs and
   * confidence. TD-8: the engine defines `Explained<T>` but emits none, so these
   * are assembled here from engine output. `tests/u9/explained.test.ts`
   * recomputes each value from its own inputs.
   */
  readonly explained: {
    readonly birds: Explained<number>;
    readonly placement_date: Explained<IsoDate>;
    readonly harvest_completion: Explained<IsoDate>;
    readonly gap_days: Explained<number>;
    readonly ceiling: Explained<number>;
    readonly tied_candidates: Explained<number>;
    readonly candidates_considered: Explained<number>;
    readonly trough: Explained<Cents>;
    readonly out_in_window: Explained<Cents>;
  };
}

const RANK: Record<Confidence, number> = { assumed: 0, calibrated: 1, measured: 2 };

/** A figure is only as sure as its least sure input. */
function weakest(...levels: readonly Confidence[]): Confidence {
  return levels.reduce((a, b) => (RANK[b] < RANK[a] ? b : a));
}

export const FLOW_LABEL: Record<CashFlowKind, string> = {
  CHICK_COST: 'Chicks',
  FEED_DRAW_PAYMENT: 'Feed, drawn',
  PLANNED_FEED_DRAW_PAYMENT: 'Feed, planned draws',
  FEED_DELIVERY_PAYMENT: 'Feed delivery',
  PLANNED_FEED_DELIVERY_PAYMENT: 'Feed delivery, planned',
  OVERHEAD: 'Overheads',
  GATE_RECEIPT: 'Gate sales',
  BULK_RECEIPT: 'Bulk sales'
};

/**
 * Flows summed by kind, one explanation input per kind. `sign` picks money out
 * as a positive magnitude (-1) or signed net movement (1).
 */
function byKind(days: readonly CashDay[], keep: (f: CashFlow) => boolean, sign: 1n | -1n) {
  const totals = new Map<CashFlowKind, { cents: bigint; count: number }>();
  for (const flow of days.flatMap((d) => d.flows).filter(keep)) {
    const t = totals.get(flow.kind) ?? { cents: 0n, count: 0 };
    totals.set(flow.kind, { cents: t.cents + flow.amount_cents * sign, count: t.count + 1 });
  }
  const inputs: Record<string, { value: unknown; source: string }> = {};
  for (const [kind, t] of totals) {
    inputs[FLOW_LABEL[kind]] = {
      value: t.cents,
      source: `Cash calendar, ${t.count} ${t.count === 1 ? 'payment' : 'payments'}`
    };
  }
  return inputs;
}

function exact(cents: Cents): number {
  const n = Number(cents);
  if (!Number.isSafeInteger(n)) throw new RangeError(`${cents} cents cannot be plotted exactly`);
  return n;
}

/**
 * A candidate the engine can name but not price against the floor. The same
 * shape as `unscorableCandidate` in the engine's allocation module, which
 * `computeAllocation` uses when a bulk input is missing. Here the missing input
 * is the opening balance (OQ-25): without it no candidate's calendar can be
 * tested against the reserve floor, so none is projected and the floor stays
 * unchecked, which `pickWinner` then reports.
 */
function unchecked(candidate: Candidate): ScoredCandidate {
  return {
    candidate,
    calendar: null,
    cover_fast_days: null,
    maximum_growth_birds: candidate.chick_count,
    build_reserve_cents: null,
    breaches_reserve_floor: null
  };
}

export function buildConsole(input: EngineInput): ConsoleView {
  const result = computeDecision(input);
  if (result.kind !== 'ok') {
    throw new Error(`U9 v1 expects its fixture to compute; the engine returned ${result.kind}`);
  }
  const { feed, harvest } = result.decision;
  const placement = input.batch.placement_date;
  const asOfDay = dayNumberFor(placement, input.asOf);

  // Harvest COMPLETION, as `computeAllocation` reads it: the gate window's last
  // day, or a later recorded sale.
  let harvestCompletion = addDays(placement, harvest.gate_window.last_day - 1);
  for (const sale of input.sales) {
    if (sale.order_date > harvestCompletion) harvestCompletion = sale.order_date;
  }

  const ceiling = input.parameters.max_placement_birds;
  if (ceiling === undefined) throw new Error('U9 v1 needs max_placement_birds (OQ-23)');
  const candidates = enumerateCandidates(input, harvestCompletion, ceiling);
  const scored = candidates.map(unchecked);

  const growth = pickWinner('MAXIMUM_GROWTH', scored);
  if (growth === null) throw new Error('Maximum Growth found no candidate');
  const winner = growth.winner.candidate;

  const throughDay = asOfDay + WINDOW_DAYS - 1;
  const calendar = projectCashCalendar(input, throughDay, 0n as Cents, feed);
  const windowDays = calendar.days.filter((d) => d.day_number >= asOfDay);
  const points = windowDays.map((d) => ({ day: d.day_number, date: d.date, net_cents: exact(d.closing_cents) }));
  const trough = points.find((p) => p.date === calendar.minimum_date);
  if (trough === undefined) {
    throw new Error(`the trough (${calendar.minimum_date}) falls before today, outside the window`);
  }

  const modes: ModeView[] = (['COVER_FAST', 'MAXIMUM_GROWTH', 'BUILD_RESERVE'] as const).map((mode) => {
    const picked = mode === 'MAXIMUM_GROWTH' ? growth : pickWinner(mode, scored);
    if (picked !== null) {
      return {
        mode,
        answered: true,
        birds: picked.winner.candidate.chick_count,
        placement_date: picked.winner.candidate.placement_date,
        reserve_floor_checked: picked.reserve_floor_checked
      };
    }
    // Cover Fast needs the candidate's own receipts (OQ-26). Build Reserve ranks
    // a closing balance, which needs both a start (OQ-25) and receipts (OQ-31).
    const needs: ModeNeed[] = mode === 'COVER_FAST' ? ['sales_forecast'] : ['opening_cash', 'sales_forecast'];
    return { mode, answered: false, needs };
  });

  const dates = [...new Set(candidates.map((c) => c.placement_date))].sort();
  const sizes = new Set(candidates.map((c) => c.chick_count)).size;
  const gapDays = daysBetween(harvestCompletion, winner.placement_date);
  const calendarConfidence = weakest(calendar.overhead_timing, calendar.planned_feed_confidence);
  const firstDate = dates[0]!;
  const lastDate = dates[dates.length - 1]!;
  const first = windowDays[0]!;
  const last = windowDays[windowDays.length - 1]!;

  const explained: ConsoleView['explained'] = {
    birds: {
      value: winner.chick_count,
      formula:
        'Maximum Growth places the most birds the reserve floor allows. With no opening balance the floor ' +
        'cannot be checked, so it rules nothing out, and the most is your ceiling.',
      inputs: {
        'Your placement ceiling (birds)': { value: ceiling, source: 'Stated by Daniel (OQ-23)' },
        'Reserve floor': { value: 'Not checked', source: 'No opening cash balance yet (OQ-25)' }
      },
      confidence: harvest.confidence
    },
    placement_date: {
      value: winner.placement_date,
      formula:
        'The day this batch clears, plus the biosecurity gap. Every later date ties on birds, so the earliest ' +
        'is chosen.',
      inputs: {
        'This batch clears': { value: harvestCompletion, source: 'Harvest plan' },
        'Biosecurity gap (days)': { value: gapDays, source: 'Stated by Daniel, 2026-09-10 (invariant 16)' }
      },
      confidence: harvest.confidence
    },
    harvest_completion: {
      value: harvestCompletion,
      formula:
        'The day this batch was placed, plus the last day of the harvest plan’s gate window, less one. ' +
        'Gate birds are paid per bird, so each day past the window adds feed cost and no revenue.',
      inputs: {
        'This batch placed': { value: placement, source: 'Batch record' },
        'Last gate day (cycle day)': { value: harvest.gate_window.last_day, source: 'Harvest plan' },
        'Dressing yield (%)': {
          value: harvest.assumed_dressing_yield_pct,
          source: 'Daniel’s estimate, not yet measured (OQ-17)'
        }
      },
      confidence: harvest.confidence
    },
    gap_days: {
      value: gapDays,
      formula:
        'A fixed floor between this batch’s last bird and the next placement, for spraying and disinfecting ' +
        'the house. Cash never overrides it.',
      inputs: { Rule: { value: 'Spraying and disinfection', source: 'Stated by Daniel, 2026-09-10 (invariant 16)' } },
      confidence: 'measured'
    },
    ceiling: {
      value: ceiling,
      formula: 'The most birds you said you would place today. Entered, not computed.',
      inputs: { 'Stated ceiling (birds)': { value: ceiling, source: 'Daniel, OQ-23 (answered 2026-09-11)' } },
      confidence: 'measured'
    },
    tied_candidates: {
      value: growth.tied_candidates,
      formula:
        `Every one of these dates can take the full ${formatBirds(ceiling)} birds, and the unchecked floor ` +
        'rules none out, so they all tie. The earliest is chosen.',
      inputs: {
        'Placement dates': { value: dates.length, source: `${formatShortDate(firstDate)} to ${formatShortDate(lastDate)}` }
      },
      confidence: 'measured'
    },
    candidates_considered: {
      value: growth.candidates_considered,
      formula: 'Every placement size from 1 bird up to your ceiling, on every date the biosecurity gap allows: sizes × dates.',
      inputs: {
        'Sizes, 1 bird to the ceiling': { value: sizes, source: `Up to your ${formatBirds(ceiling)}-bird ceiling` },
        'Placement step (birds)': {
          value: input.parameters.placement_step_birds ?? DEFAULT_PLACEMENT_STEP_BIRDS,
          source: 'The hatchery invoices per chick (OQ-18)'
        },
        'Placement dates': { value: dates.length, source: `${formatShortDate(firstDate)} to ${formatShortDate(lastDate)}` }
      },
      confidence: 'measured'
    },
    trough: {
      value: calendar.minimum_cents,
      formula:
        `Net cash since placement at its lowest, on ${formatShortDate(calendar.minimum_date)}: every payment ` +
        `from ${formatShortDate(placement)} to then, added up. No sales are recorded, so nothing offsets them.`,
      inputs: byKind(
        calendar.days.filter((d) => d.date <= calendar.minimum_date),
        () => true,
        1n
      ),
      confidence: calendarConfidence
    },
    out_in_window: {
      value: windowDays.reduce((sum, d) => sum + d.out_cents, 0n) as Cents,
      formula: `Every payment due from ${formatShortDate(first.date)} to ${formatShortDate(last.date)}, added up.`,
      inputs: byKind(windowDays, (f) => f.amount_cents < 0n, -1n),
      confidence: calendarConfidence
    }
  };

  return {
    explained,
    batch: {
      placement_date: placement,
      chick_count: input.batch.chick_count,
      as_of: input.asOf,
      as_of_day: asOfDay
    },
    recommendation: {
      birds: winner.chick_count,
      placement_date: winner.placement_date,
      harvest_completion_date: harvestCompletion,
      gap_days: daysBetween(harvestCompletion, winner.placement_date),
      ceiling_birds: ceiling,
      candidates_considered: growth.candidates_considered,
      tied_candidates: growth.tied_candidates,
      reserve_floor_checked: growth.reserve_floor_checked,
      confidence: harvest.confidence,
      confidence_basis: {
        dressing_yield_pct: harvest.assumed_dressing_yield_pct,
        mortality_source: harvest.mortality_source,
        preharvest_uplift_source: harvest.preharvest_uplift_source
      }
    },
    calendar: {
      basis: 'net_since_placement',
      points,
      trough,
      receipts_cents: exact(windowDays.reduce((sum, d) => sum + d.in_cents, 0n) as Cents),
      out_in_window_cents: exact(windowDays.reduce((sum, d) => sum + d.out_cents, 0n) as Cents),
      reserve_floor: { cents: exact(input.parameters.reserve_floor_cents), drawn: false },
      overhead_timing: calendar.overhead_timing,
      planned_feed_confidence: calendar.planned_feed_confidence,
      harvest: { day: harvest.gate_window.last_day, date: harvestCompletion }
    },
    modes
  };
}
