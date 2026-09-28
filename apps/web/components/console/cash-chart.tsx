'use client';

import type { Cents, IsoDate } from '@runproduce/engine';
import {
  Area,
  CartesianGrid,
  ComposedChart,
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

/** Round $5,000 gridlines, spanning zero and every point. */
const STEP_CENTS = 500_000;
function gridTicks(lowest: number, highest: number): number[] {
  const top = Math.max(0, Math.ceil(highest / STEP_CENTS) * STEP_CENTS);
  const bottom = Math.min(0, Math.floor(lowest / STEP_CENTS) * STEP_CENTS - STEP_CENTS);
  const ticks: number[] = [];
  for (let t = top; t >= bottom; t -= STEP_CENTS) ticks.push(t);
  return ticks;
}

/**
 * Where zero sits, as a fraction from the top of the plotted range. The stroke
 * turns at this offset: green above zero, red below (AD-100). Colour carries
 * the sign, never decoration: below zero means more has gone out than come in
 * since placement, which is what "cash out is red" already means.
 */
function zeroOffset(highest: number, lowest: number): number {
  if (highest <= 0) return 0;
  if (lowest >= 0) return 1;
  return highest / (highest - lowest);
}

function PointTooltip({ active, payload }: TooltipContentProps<TooltipValueType, string | number>) {
  const point = payload?.[0]?.payload as CalendarPoint | undefined;
  if (active !== true || point === undefined) return null;
  return (
    <div className="rounded-md border border-line bg-surface px-3 py-2 text-xs">
      <p className="text-muted">{formatDayDate(point.day, point.date)}</p>
      <p className="figures mt-0.5 text-sm font-medium">{money(point.net_cents)}</p>
    </div>
  );
}

/**
 * The cash calendar's line. Static: no animation (ui-context.md §0, MOTION 2),
 * and the data is baked in at build time. The fill runs from the line to the
 * zero line, fading towards zero, so the area reads as the size of the
 * movement.
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
  const values = points.map((p) => p.net_cents);
  const highest = Math.max(...values);
  const lowest = Math.min(...values);
  const ticks = gridTicks(lowest, highest);
  const off = zeroOffset(highest, lowest);

  return (
    <ResponsiveContainer width="100%" height={380}>
      <ComposedChart
        data={[...points]}
        margin={{ top: 24, right: 16, bottom: 4, left: 8 }}
        // The figure's caption carries the text alternative and the bill table
        // carries the detail, so the chart is not a keyboard stop of its own.
        accessibilityLayer={false}
      >
        <defs>
          <linearGradient id="cash-stroke" x1="0" y1="0" x2="0" y2="1">
            <stop offset={off} stopColor="var(--accent-primary)" />
            <stop offset={off} stopColor="var(--flow-out)" />
          </linearGradient>
          <linearGradient id="cash-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset={0} stopColor="var(--accent-primary)" stopOpacity={0.22} />
            <stop offset={off} stopColor="var(--accent-primary)" stopOpacity={0.02} />
            <stop offset={off} stopColor="var(--flow-out)" stopOpacity={0.02} />
            <stop offset={1} stopColor="var(--flow-out)" stopOpacity={0.2} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="var(--border-default)" strokeDasharray="0" vertical={false} />
        <XAxis
          dataKey="date"
          ticks={weekly}
          interval="preserveStart"
          minTickGap={12}
          tickFormatter={(d: IsoDate) => formatShortDate(d)}
          tick={{ fill: 'var(--text-muted)', fontSize: 12, fontFamily: 'var(--font-sans)' }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          domain={[ticks[ticks.length - 1]!, ticks[0]!]}
          ticks={ticks}
          tickFormatter={money}
          tick={{ fill: 'var(--text-muted)', fontSize: 12, fontFamily: 'var(--font-sans)' }}
          tickLine={false}
          axisLine={false}
          width={76}
        />
        <ReferenceLine y={0} stroke="var(--border-strong)" />
        <ReferenceLine
          x={harvest.date}
          stroke="var(--border-strong)"
          strokeDasharray="4 4"
          label={{ value: 'Harvest', position: 'insideTopLeft', fill: 'var(--text-muted)', fontSize: 12 }}
        />
        <Tooltip content={PointTooltip} cursor={{ stroke: 'var(--border-strong)' }} isAnimationActive={false} />
        <Area
          type="linear"
          dataKey="net_cents"
          baseValue={0}
          stroke="url(#cash-stroke)"
          strokeWidth={2.5}
          fill="url(#cash-fill)"
          dot={false}
          activeDot={{ r: 4, fill: 'var(--text-primary)', stroke: 'var(--bg-surface)', strokeWidth: 2 }}
          isAnimationActive={false}
        />
        <ReferenceDot
          x={trough.date}
          y={trough.net_cents}
          r={7}
          fill="var(--flow-out)"
          stroke="var(--bg-surface)"
          strokeWidth={3}
          label={{
            value: `Lowest ${money(trough.net_cents)}`,
            // Below the dot: the line arrives from above, so a label there collides.
            position: 'bottom',
            offset: 14,
            fill: 'var(--flow-out)',
            fontSize: 13,
            fontWeight: 600
          }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
