/**
 * What a farmer reads, in one place (AD-100). Engine enums stay stable inside
 * the engine and the database; every screen that shows one goes through here.
 *
 * `plainFlowDescription` rewrites the engine's cash-flow descriptions, which
 * are built for the engine's tests and carry enum names. It recognises each
 * known shape exactly, and passes anything else through unchanged: an
 * unfamiliar sentence is better than a wrong one.
 */
import type { CashFlowKind, Channel, IsoDate, OverheadBasis, OverheadTiming, Phase, SalePricingBasis } from '@runproduce/engine';
import { formatShortDate } from './format';

export const OVERHEAD_BASIS_LABEL: Record<OverheadBasis, string> = {
  PER_BIRD: 'Per bird',
  PER_BATCH: 'One-time charge'
};

export const OVERHEAD_TIMING_LABEL: Record<OverheadTiming, string> = {
  PLACEMENT: 'on placement day',
  MONTHLY: 'monthly',
  HARVEST_COMPLETE: 'on harvest day'
};

export const PHASE_LABEL: Record<Phase, string> = {
  STARTER: 'starter',
  GROWER: 'grower',
  FINISHER: 'finisher'
};

export const CHANNEL_LABEL: Record<Channel, string> = {
  GATE: 'at the gate',
  BULK: 'in bulk'
};

export const PRICING_BASIS_LABEL: Record<SalePricingBasis, string> = {
  PER_BIRD: 'priced per bird',
  PER_KG: 'priced per kg',
  BANDED: 'priced by weight band'
};

const OVERHEAD =
  /^(?<label>.+) \((?<basis>PER_BIRD|PER_BATCH), (?<timing>PLACEMENT|MONTHLY|HARVEST_COMPLETE), timing assumed — OQ-\d+(?:, (?<days>\d+) housed days)?\)$/;
const FEED_DRAW = /^(?<bags>[\d.]+) bags (?<phase>STARTER|GROWER|FINISHER) drawn (?<date>\d{4}-\d{2}-\d{2})$/;
const GATE_SALE = /^(?<birds>\d+) birds GATE$/;
const BULK_SALE = /^(?<birds>\d+) birds BULK, (?<rest>.+) \((?<basis>PER_BIRD|PER_KG|BANDED)\)$/;

export function plainFlowDescription(kind: CashFlowKind, description: string): string {
  switch (kind) {
    case 'OVERHEAD': {
      const m = OVERHEAD.exec(description)?.groups;
      if (!m) return description;
      const when = OVERHEAD_TIMING_LABEL[m['timing'] as OverheadTiming];
      const housed = m['days'] === undefined ? '' : `, ${m['days']} housed days`;
      return `${m['label']} · ${OVERHEAD_BASIS_LABEL[m['basis'] as OverheadBasis]}, ${when}${housed} · date assumed`;
    }
    case 'FEED_DRAW_PAYMENT': {
      const m = FEED_DRAW.exec(description)?.groups;
      if (!m) return description;
      return `${m['bags']} bags of ${PHASE_LABEL[m['phase'] as Phase]}, collected ${formatShortDate(m['date'] as IsoDate)}`;
    }
    case 'GATE_RECEIPT': {
      const m = GATE_SALE.exec(description)?.groups;
      return m ? `${m['birds']} birds ${CHANNEL_LABEL.GATE}` : description;
    }
    case 'BULK_RECEIPT': {
      const m = BULK_SALE.exec(description)?.groups;
      if (!m) return description;
      return `${m['birds']} birds ${CHANNEL_LABEL.BULK}, ${m['rest']} (${PRICING_BASIS_LABEL[m['basis'] as SalePricingBasis]})`;
    }
    default:
      return description;
  }
}
