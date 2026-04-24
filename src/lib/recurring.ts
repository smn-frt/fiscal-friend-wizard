// Helpers for monthly recurring jobs and expenses

const MS_DAY = 24 * 60 * 60 * 1000;

export const lastDayOfMonth = (year: number, monthZeroBased: number) =>
  new Date(year, monthZeroBased + 1, 0);

/**
 * Number of fully completed months from `start` until `today`.
 * A month "completes" the day after the last day of that month.
 * Example: start = 2025-09-15, today = 2025-10-31 -> 1 (September month accrues at end of Sept)
 *          today = 2025-11-01 -> 2 (Sept + Oct completed)
 */
export const monthsAccrued = (startISO: string | null | undefined, today = new Date()) => {
  if (!startISO) return 0;
  const start = new Date(startISO);
  if (isNaN(start.getTime())) return 0;
  let count = 0;
  // We start counting from the month of the start date.
  let cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  while (true) {
    const endOfThisMonth = lastDayOfMonth(cursor.getFullYear(), cursor.getMonth());
    // Month is completed once today is past the last day (i.e. on the next day at 00:00).
    if (today.getTime() <= endOfThisMonth.getTime()) break;
    count += 1;
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }
  return count;
};

/** Returns the date the next monthly accrual will be paid (last day of current/next month). */
export const nextAccrualDate = (startISO: string | null | undefined, today = new Date()) => {
  if (!startISO) return null;
  const start = new Date(startISO);
  if (isNaN(start.getTime())) return null;
  const target = today < start ? start : today;
  return lastDayOfMonth(target.getFullYear(), target.getMonth());
};

export const daysUntil = (date: Date | null, today = new Date()) => {
  if (!date) return null;
  return Math.ceil((date.getTime() - today.getTime()) / MS_DAY);
};
