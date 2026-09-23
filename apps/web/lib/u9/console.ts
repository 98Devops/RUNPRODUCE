/**
 * U9 v1: the decision console's view model. Everything here is read from the
 * engine; this module only picks figures and shapes them for three cards.
 */
import {
  addDays,
  computeDecision,
  dayNumberFor,
  daysBetween,
  enumerateCandidates,
  pickWinner,
  projectCashCalendar,
  type AllocationMode,
  type Candidate,
  type Cents,
  type Confidence,
  type EngineInput,
  type IsoDate,
  type ScoredCandidate
} from '@runproduce/engine';

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
  const scored = enumerateCandidates(input, harvestCompletion, ceiling).map(unchecked);

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

  return {
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
