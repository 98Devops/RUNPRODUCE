'use client';

import type { Cents, IsoDate } from '@runproduce/engine';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
  type TooltipValueType
} from 'recharts';
import type { CalendarPoint } from '@/lib/u9/console';
import { formatDayDate, formatMoney, formatShortDate } from '@/lib/format';

const money = (cents: number) => formatMoney(BigInt(cents) as Cents);

/** Round $5,000 gridlines, from $0 down past the lowest point. */
const STEP_CENTS = 500_000;
function gridTicks(lowest: number): number[] {
  const ticks: number[] = [];
  for (let t = 0; t >= lowest; t -= STEP_CENTS) ticks.push(t);
  ticks.push(ticks[ticks.length - 1]! - STEP_CENTS);
  return ticks;
}

function PointTooltip({ active, payload }: TooltipContentProps<TooltipValueType, string | number>) {
  const point = payload?.[0]?.payload as CalendarPoint | undefined;
  if (active !== true || point === undefined) return null;
  return (
    <div className="rounded-md border border-line bg-surface px-3 py-2 text-xs">
      <p className="text-muted">{formatDayDate(point.day, point.date)}</p>
      <p className="figures mt-0.5 text-sm">{money(point.net_cents)}</p>
    </div>
  );
}

/**
 * The cash calendar's line. Static: no animation (ui-context.md §0, MOTION 2),
 * and the data is baked in at build time.
 */
export function CashChart({
  points,
  trough,
  harvest
}: {
  readonly points: readonly CalendarPoint[];
  readonly trough: CalendarPoint;
  readonly harvest: { readonly day: number; readonly date: IsoDate };
}) {
  const weekly = points.filter((_, i) => i % 7 === 0).map((p) => p.date);
  const ticks = gridTicks(trough.net_cents);

  return (
    <ResponsiveContainer width="100%" height={380}>
      <LineChart
        data={[...points]}
        margin={{ top: 16, right: 16, bottom: 4, left: 8 }}
        // The figure's caption carries the text alternative and the bill table
        // carries the detail, so the chart is not a keyboard stop of its own.
        accessibilityLayer={false}
      >
        <CartesianGrid stroke="var(--border-default)" strokeDasharray="0" vertical={false} />
        <XAxis
          dataKey="date"
          ticks={weekly}
          interval="preserveStart"
          minTickGap={12}
          tickFormatter={(d: IsoDate) => formatShortDate(d)}
          tick={{ fill: 'var(--text-muted)', fontSize: 12, fontFamily: 'var(--font-mono)' }}
          tickLine={false}
          axisLine={{ stroke: 'var(--border-strong)' }}
        />
        <YAxis
          domain={[ticks[ticks.length - 1]!, 0]}
          ticks={ticks}
          tickFormatter={money}
          tick={{ fill: 'var(--text-muted)', fontSize: 12, fontFamily: 'var(--font-mono)' }}
          tickLine={false}
          axisLine={false}
          width={76}
        />
        <ReferenceLine
          x={harvest.date}
          stroke="var(--border-strong)"
          strokeDasharray="4 4"
          label={{ value: 'Harvest', position: 'insideTopLeft', fill: 'var(--text-muted)', fontSize: 12 }}
        />
        <Tooltip content={PointTooltip} cursor={{ stroke: 'var(--border-strong)' }} isAnimationActive={false} />
        <Line
          type="linear"
          dataKey="net_cents"
          stroke="var(--text-primary)"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, fill: 'var(--text-primary)' }}
          isAnimationActive={false}
        />
        <ReferenceDot
          x={trough.date}
          y={trough.net_cents}
          r={5}
          fill="var(--flow-out)"
          stroke="var(--bg-surface)"
          strokeWidth={2}
          label={{ value: 'Lowest', position: 'top', offset: 10, dx: 26, fill: 'var(--flow-out)', fontSize: 12 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
