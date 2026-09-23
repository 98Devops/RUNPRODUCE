import type { Cents } from '@runproduce/engine';
import type { ConsoleView } from '@/lib/u9/console';
import { formatDayDate, formatMoney, formatShortDate } from '@/lib/format';
import { CashChart } from './cash-chart';
import { Explain } from './explain';
import { OutgoingTable } from './outgoing-table';
import { ConfidenceBadge, Panel } from './primitives';

const money = (cents: number) => formatMoney(BigInt(cents) as Cents);

function Stat({ label, children }: { readonly label: string; readonly children: React.ReactNode }) {
  return (
    <div className="px-5 py-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1">{children}</dd>
    </div>
  );
}

/**
 * Card 2: the next 45 days of cash, as net movement since placement. There is
 * no opening balance to start from (OQ-25), so it never calls itself a balance,
 * and the reserve floor, a balance, is named rather than drawn.
 */
export function CashCalendarCard({ view }: { readonly view: ConsoleView }) {
  const cal = view.calendar;

  return (
    <Panel
      labelledBy="calendar-title"
      title="Cash, next 45 days"
      aside={
        <div className="flex flex-wrap justify-end gap-1.5">
          <ConfidenceBadge label="Planned feed" confidence={cal.planned_feed_confidence} />
          <ConfidenceBadge label="Overhead timing" confidence={cal.overhead_timing} />
        </div>
      }
    >
      <p className="px-5 pt-4 text-sm text-muted">
        Net cash moved since this batch was placed on {formatShortDate(view.batch.placement_date)}. Your opening
        balance is not in it yet, so it shows what moves, not what you hold.
      </p>

      <dl className="grid grid-cols-1 divide-y divide-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <Stat label="Lowest point">
          <p className="figures text-2xl font-medium">
            <Explain explained={view.explained.trough} label="Lowest point">
              {money(cal.trough.net_cents)}
            </Explain>
          </p>
          <p className="figures text-xs text-muted">{formatDayDate(cal.trough.day, cal.trough.date)}</p>
        </Stat>
        <Stat label="Going out, these 45 days">
          <p className="figures text-2xl font-medium text-flow-out">
            <Explain explained={view.explained.out_in_window} label="Going out, these 45 days">
              {money(cal.out_in_window_cents)}
            </Explain>
          </p>
        </Stat>
        <Stat label="Coming in, these 45 days">
          {cal.receipts_cents === 0 ? (
            <>
              <p className="text-sm">No sales recorded yet</p>
              <p className="text-xs text-muted">Receipts appear once sales are entered</p>
            </>
          ) : (
            <p className="figures text-2xl font-medium text-flow-in">{money(cal.receipts_cents)}</p>
          )}
        </Stat>
      </dl>

      <figure className="border-t border-line px-2 pt-2 pb-1">
        <div role="img" aria-label={chartSummary(view)}>
          <CashChart points={cal.points} trough={cal.trough} harvest={cal.harvest} />
        </div>
      </figure>

      <OutgoingTable view={view} />

      <p className="border-t border-line px-5 py-3 text-xs text-muted">
        Reserve floor ({money(cal.reserve_floor.cents)}) not drawn: it is a bank balance, and there is no opening
        balance here to measure it against.
      </p>
    </Panel>
  );
}

function chartSummary(view: ConsoleView): string {
  const cal = view.calendar;
  const first = cal.points[0]!;
  const last = cal.points[cal.points.length - 1]!;
  return (
    `Net cash since placement, ${formatDayDate(first.day, first.date)} to ${formatDayDate(last.day, last.date)}. ` +
    `Starts at ${money(first.net_cents)}, lowest ${money(cal.trough.net_cents)} on ${formatShortDate(cal.trough.date)}. ` +
    `Harvest on ${formatShortDate(cal.harvest.date)}.`
  );
}
