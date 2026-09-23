import { CashCalendarCard } from '@/components/console/cash-calendar-card';
import { ModesCard } from '@/components/console/modes-card';
import { RecommendationCard } from '@/components/console/recommendation-card';
import { formatBirds, formatDayDate, formatShortDate } from '@/lib/format';
import { buildConsole } from '@/lib/u9/console';
import { FIXTURE_7 } from '@/lib/u9/fixture';

/**
 * U9 v1 SHORTCUT (OQ-29). The decision is computed once, at build time, and
 * baked into static HTML, so the page renders instantly. Nothing on it is live.
 *
 * Today this costs milliseconds, not the 20.8 s OQ-29 measured: without an
 * opening balance (OQ-25) no candidate is projected against the reserve floor.
 * The moment one is, every one of 155,000 candidates is scored through a cash
 * projection, and that is the 20.8 s path. OQ-29's real resolution, memoised or
 * incremental scoring, is required before U9 binds to live data. Do not remove
 * `force-static` to get live numbers.
 */
export const dynamic = 'force-static';

export default function DecisionConsole() {
  const view = buildConsole(FIXTURE_7);

  return (
    <main className="mx-auto min-h-[100dvh] max-w-[1280px] px-4 py-6 sm:px-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-2 border-b border-line pb-4">
        <div>
          <p className="text-xs text-muted">Decision console</p>
          <h1 className="text-2xl font-medium tracking-tight">
            Batch placed {formatShortDate(view.batch.placement_date)},{' '}
            <span className="figures">{formatBirds(view.batch.chick_count)}</span> birds
          </h1>
        </div>
        <p className="text-sm">
          <span className="text-muted">Today </span>
          <span className="figures">{formatDayDate(view.batch.as_of_day, view.batch.as_of)}</span>
        </p>
      </header>

      {/* Stacks 1, 2, 3 on a phone; on a wide screen the calendar takes the right column. */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <RecommendationCard view={view} />
        </div>
        <div className="lg:col-span-7 lg:row-span-2">
          <CashCalendarCard view={view} />
        </div>
        <div className="lg:col-span-5">
          <ModesCard view={view} />
        </div>
      </div>
    </main>
  );
}
