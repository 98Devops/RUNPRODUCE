import { CashCalendarCard } from '@/components/console/cash-calendar-card';
import { Greeting } from '@/components/console/greeting';
import { ModesCard } from '@/components/console/modes-card';
import { RecommendationCard } from '@/components/console/recommendation-card';
import { formatBirds, formatDayDate, formatShortDate } from '@/lib/format';
import { buildConsole } from '@/lib/u9/console';
import { FIXTURE_7 } from '@/lib/u9/fixture';

/** The client's trading name (project-overview.md). */
const FARM_NAME = 'Danrun Poultry';

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
  const batch = view.batch;

  return (
    <>
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <p className="text-lg font-semibold tracking-tight text-accent">RunProduce</p>
          <p className="text-right text-sm leading-tight">
            <span className="font-medium">{FARM_NAME}</span>
            {/* Golden fixture 7, not a real batch: said plainly, never implied. */}
            <span className="block text-xs text-muted sm:inline sm:before:content-['_·_']">Sample batch</span>
          </p>
        </div>
      </header>

      <main className="mx-auto min-h-[100dvh] max-w-[1280px] px-4 pt-6 pb-10 sm:px-6">
        <section className="mb-6 grid gap-1.5">
          <Greeting className="text-3xl font-semibold tracking-tight" />
          <p className="max-w-prose text-[1.0625rem] leading-snug text-pretty">
            <span className="figures font-semibold">Day {batch.as_of_day}</span> of the{' '}
            <span className="figures">{formatBirds(batch.chick_count)}</span>-bird batch placed{' '}
            {formatShortDate(batch.placement_date)}. The next placement is worked out. Your opening cash balance
            would let it check the reserve floor too.
          </p>
          <p className="figures text-sm text-muted">Figures as of {formatDayDate(batch.as_of_day, batch.as_of)}</p>
        </section>

        {/* Stacks 1, 2, 3 on a phone; on a wide screen the calendar takes the right column. */}
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12 lg:grid-rows-[auto_1fr]">
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
    </>
  );
}
