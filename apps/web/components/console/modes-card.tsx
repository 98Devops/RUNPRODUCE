import type { AllocationMode } from '@runproduce/engine';
import type { ConsoleView, ModeNeed } from '@/lib/u9/console';
import { formatBirds, formatShortDate } from '@/lib/format';
import { Panel } from './primitives';

const MODE_NAME: Record<AllocationMode, string> = {
  COVER_FAST: 'Cover Fast',
  MAXIMUM_GROWTH: 'Maximum Growth',
  BUILD_RESERVE: 'Build Reserve'
};

const MODE_QUESTION: Record<AllocationMode, string> = {
  COVER_FAST: 'Repay the chick and feed credit soonest',
  MAXIMUM_GROWTH: 'Place the most birds',
  BUILD_RESERVE: 'Leave the most cash in the bank'
};

const NEED_TEXT: Record<ModeNeed, string> = {
  opening_cash: 'your opening cash balance',
  sales_forecast: 'a forecast of this batch’s own sales (M6)'
};

function needsSentence(needs: readonly ModeNeed[]): string {
  return `Needs ${needs.map((n) => NEED_TEXT[n]).join(', and ')}.`;
}

/**
 * Card 3: all three modes, in fixed order and identical format
 * (card-system-and-decision-ux.md, no anchoring). A mode that cannot answer
 * says what it needs; it is never blank, a dash or a zero (ui-context.md).
 */
export function ModesCard({ view }: { readonly view: ConsoleView }) {
  return (
    <Panel labelledBy="modes-title" title="The three modes">
      <ol className="divide-y divide-line">
        {view.modes.map((mode) => (
          <li key={mode.mode} className="grid gap-1 px-5 py-4 sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)] sm:gap-4">
            <div>
              <p className="text-sm font-medium">{MODE_NAME[mode.mode]}</p>
              <p className="text-xs text-muted">{MODE_QUESTION[mode.mode]}</p>
            </div>
            {mode.answered ? (
              <div className="text-sm">
                <p>
                  <span className="figures">{formatBirds(mode.birds)}</span> birds on{' '}
                  <span className="figures">{formatShortDate(mode.placement_date)}</span>
                </p>
                {!mode.reserve_floor_checked && (
                  <p className="text-xs text-muted">Reserve floor not checked</p>
                )}
              </div>
            ) : (
              <div className="text-sm">
                <p>Not enough information yet.</p>
                <p className="text-xs text-muted">{needsSentence(mode.needs)}</p>
              </div>
            )}
          </li>
        ))}
      </ol>
    </Panel>
  );
}
