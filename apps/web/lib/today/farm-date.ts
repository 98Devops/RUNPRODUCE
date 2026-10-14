/**
 * The farm's date (U7 D28). Netlify runs on UTC and the farm on UTC+2, so the
 * server's date is yesterday's between midnight and 2am on the farm. Nothing
 * in the schema stores a time zone; one constant does, until a second farm in
 * another zone needs a column.
 *
 * The clock is read by the caller and passed in, so this is testable.
 */
import type { IsoDate } from '@runproduce/engine';

export const FARM_TIME_ZONE = 'Africa/Harare';

const FARM_DATE = new Intl.DateTimeFormat('en-US', {
  timeZone: FARM_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

export function farmToday(now: Date): IsoDate {
  const parts = Object.fromEntries(FARM_DATE.formatToParts(now).map((p) => [p.type, p.value]));
  return `${parts['year']}-${parts['month']}-${parts['day']}` as IsoDate;
}
