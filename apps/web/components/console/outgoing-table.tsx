import type { Cents } from '@runproduce/engine';
import type { ConsoleView } from '@/lib/u9/console';
import { formatDayDate, formatMoney } from '@/lib/format';

function Tag({ children }: { readonly children: string }) {
  return (
    <span className="ml-1.5 inline-block rounded-md border border-dashed border-line-strong px-1.5 text-xs font-normal text-muted">
      {children}
    </span>
  );
}

/**
 * The money going out, bill by bill: one row per engine cash flow, in the
 * ledger's format (cents shown). A table, not a chart (ui-context.md: charts
 * only where a table would not be clearer).
 */
export function OutgoingTable({ view }: { readonly view: ConsoleView }) {
  const { rows, feed_past_harvest: past } = view.outgoing;
  const total = rows.reduce((sum, r) => sum + r.amount_cents, 0n) as Cents;

  return (
    <section aria-labelledby="outgoing-title" className="border-t border-line">
      <h3 id="outgoing-title" className="px-5 pt-4 text-sm font-medium">
        Going out, bill by bill
      </h3>
      <div className="overflow-x-auto px-5 pb-4">
        <table className="mt-2 w-full min-w-[32rem] text-sm">
          <thead>
            <tr className="border-b border-line-strong text-left text-xs text-muted">
              <th scope="col" className="py-2 pr-4 font-normal">Due</th>
              <th scope="col" className="py-2 pr-4 font-normal">Bill</th>
              <th scope="col" className="py-2 text-right font-normal">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r, i) => (
              <tr key={`${r.date}-${r.kind}-${i}`} className="align-top">
                <td className="figures py-2 pr-4 whitespace-nowrap">{formatDayDate(r.day, r.date)}</td>
                <td className="py-2 pr-4">
                  <span>{r.label}</span>
                  {r.planned && <Tag>planned</Tag>}
                  {r.after_harvest && <Tag>after harvest</Tag>}
                  <p className="text-xs text-muted">{r.description}</p>
                </td>
                <td className={`figures py-2 text-right whitespace-nowrap ${r.planned ? 'text-muted' : ''}`}>
                  {formatMoney(r.amount_cents as Cents, { cents: true })}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-line-strong">
              <th scope="row" colSpan={2} className="py-2 text-left font-medium">
                Total
              </th>
              <td className="figures py-2 text-right font-medium text-flow-out">
                {formatMoney(total, { cents: true })}
              </td>
            </tr>
          </tfoot>
        </table>
        {past !== null && (
          <p className="mt-3 text-xs text-muted">
            Feed is planned to day {past.planned_to_day}, but the harvest plan clears the flock on day{' '}
            {past.harvest_day}. The {past.draws} draws marked after harvest cover days after that, so this total and
            the lowest point may be overstated.
          </p>
        )}
      </div>
    </section>
  );
}
