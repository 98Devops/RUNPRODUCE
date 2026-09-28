import type { ConsoleView } from '@/lib/u9/console';
import { formatBirds, formatDayDate, formatShortDate } from '@/lib/format';
import { Explain } from './explain';
import { ConfidenceBadge, Panel, Row } from './primitives';

/**
 * Card 1, the page's hero (AD-100): Maximum Growth's answer, the only mode that
 * answers today. A faint accent tint sets it apart; the answer itself is the
 * largest type on the page.
 */
export function RecommendationCard({ view }: { readonly view: ConsoleView }) {
  const rec = view.recommendation;
  const basis = rec.confidence_basis;
  const ex = view.explained;

  return (
    <Panel
      labelledBy="recommendation-title"
      title="Today’s recommendation"
      aside={<ConfidenceBadge confidence={rec.confidence} />}
      tone="hero"
    >
      <div className="px-5 pt-5 pb-5">
        <p className="text-sm text-muted">Next batch · Maximum Growth</p>
        <p className="mt-2 text-ink">
          <span className="block">
            <span className="text-sm font-medium">Place </span>
            <Explain explained={ex.birds} label="Birds to place">
              <span className="figures text-6xl font-semibold tracking-tight">{formatBirds(rec.birds)}</span>
            </Explain>
            <span className="ml-2 text-2xl font-semibold">birds</span>
          </span>
          <span className="mt-1 block text-2xl font-semibold">
            on{' '}
            <Explain explained={ex.placement_date} label="Placement date">
              <span className="figures">{formatShortDate(rec.placement_date)}</span>
            </Explain>
          </span>
        </p>
        <p className="mt-4 max-w-prose text-sm">
          The most you said you would place, on the first day the {rec.gap_days}-day biosecurity gap allows after
          this batch clears on {formatShortDate(rec.harvest_completion_date)}.
        </p>
        <p className="mt-2 text-sm">Reserve floor not checked. It needs your opening cash balance.</p>
      </div>

      <dl className="mx-5 mb-5 divide-y divide-line rounded-md border border-accent-soft-border bg-surface">
        <Row label="This batch clears">
          <Explain explained={ex.harvest_completion} label="This batch clears">
            {formatDayDate(view.calendar.harvest.day, rec.harvest_completion_date)}
          </Explain>
        </Row>
        <Row label="Biosecurity gap">
          <Explain explained={ex.gap_days} label="Biosecurity gap">
            {rec.gap_days} days
          </Explain>
        </Row>
        <Row label="Your placement ceiling">
          <Explain explained={ex.ceiling} label="Your placement ceiling">
            {formatBirds(rec.ceiling_birds)} birds
          </Explain>
        </Row>
        <Row label="Placement dates that tie">
          <Explain explained={ex.tied_candidates} label="Placement dates that tie">
            {formatBirds(rec.tied_candidates)}
          </Explain>
          , earliest chosen
        </Row>
        <Row label="Options considered">
          <Explain explained={ex.candidates_considered} label="Options considered">
            {formatBirds(rec.candidates_considered)}
          </Explain>
        </Row>
      </dl>

      <p className="border-t border-accent-soft-border px-5 py-3 text-xs text-muted">
        Rated {rec.confidence}: the harvest plan behind the clearing date uses a {basis.dressing_yield_pct}%
        dressing yield that has not been measured yet.
      </p>
    </Panel>
  );
}
