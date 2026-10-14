'use client';

import { useRouter } from 'next/navigation';

/**
 * The day being recorded (U7 D29): a native date input, from placement to the
 * farm's today. The browser's own picker, so it is the phone's, in the phone's
 * language. A date outside the range is never moved; the page says so.
 */
export function DatePicker({
  value,
  min,
  max,
  hrefFor
}: {
  readonly value: string;
  readonly min: string;
  readonly max: string;
  /** The URL up to the date, which is appended. */
  readonly hrefFor: string;
}) {
  const router = useRouter();
  return (
    <div className="grid gap-2">
      <label htmlFor="record-date" className="text-sm font-medium">
        Date
      </label>
      <input
        id="record-date"
        type="date"
        defaultValue={value}
        min={min}
        max={max}
        onChange={(event) => {
          if (event.target.value) router.push(`${hrefFor}${event.target.value}`);
        }}
        className="h-14 w-full rounded-md border border-line-strong bg-surface px-4 text-xl text-ink outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30"
      />
    </div>
  );
}
