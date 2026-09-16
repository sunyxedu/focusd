import { RepetitionRule } from './types';
import { addDays, addMonths, addWeeks, addYears } from './dates';

export function advance(t: number, rule: RepetitionRule): number {
  const n = rule.every;
  switch (rule.unit) {
    case 'minute':
      return t + n * 60_000;
    case 'hour':
      return t + n * 3_600_000;
    case 'day':
      return addDays(t, n);
    case 'week': {
      if (rule.weekdays && rule.weekdays.length) {
        // next selected weekday after t, respecting "every n weeks"
        const d = new Date(t);
        for (let i = 1; i <= 7 * n + 7; i++) {
          const c = new Date(d);
          c.setDate(d.getDate() + i);
          const weeksApart = Math.floor((startWeek(c.getTime()) - startWeek(t)) / (7 * 86_400_000));
          if (rule.weekdays.includes(c.getDay()) && weeksApart % n === 0) return c.getTime();
        }
      }
      return addWeeks(t, n);
    }
    case 'month':
      return addMonths(t, n);
    case 'year':
      return addYears(t, n);
  }
}

function startWeek(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d.getTime();
}

/**
 * Compute the dates of the next occurrence when an item with `rule` is completed at `completedAt`.
 * Returns null when nothing to schedule.
 */
export function nextOccurrence(
  rule: RepetitionRule,
  dates: { deferDate: number | null; plannedDate: number | null; dueDate: number | null },
  completedAt: number,
): { deferDate: number | null; plannedDate: number | null; dueDate: number | null } {
  const { deferDate, plannedDate, dueDate } = dates;
  if (rule.method === 'fixed') {
    // advance every date by the interval, keeping relative gaps; make sure the result is in the future
    let d = { deferDate, plannedDate, dueDate };
    const anchor = () => d.dueDate ?? d.plannedDate ?? d.deferDate ?? completedAt;
    if (d.dueDate === null && d.plannedDate === null && d.deferDate === null) d = { ...d, dueDate: completedAt };
    let guard = 0;
    do {
      d = {
        deferDate: d.deferDate === null ? null : advance(d.deferDate, rule),
        plannedDate: d.plannedDate === null ? null : advance(d.plannedDate, rule),
        dueDate: d.dueDate === null ? null : advance(d.dueDate, rule),
      };
    } while (anchor() <= completedAt && ++guard < 1000);
    return d;
  }
  if (rule.method === 'startAfterCompletion') {
    const newDefer = advance(completedAt, rule);
    const gapDue = dueDate !== null && deferDate !== null ? dueDate - deferDate : null;
    const gapPlanned = plannedDate !== null && deferDate !== null ? plannedDate - deferDate : null;
    return {
      deferDate: newDefer,
      plannedDate: gapPlanned !== null ? newDefer + gapPlanned : plannedDate === null ? null : advance(completedAt, rule),
      dueDate: gapDue !== null ? newDefer + gapDue : dueDate === null ? null : advance(completedAt, rule),
    };
  }
  // dueAfterCompletion
  const newDue = advance(completedAt, rule);
  const gapDefer = dueDate !== null && deferDate !== null ? dueDate - deferDate : null;
  const gapPlanned = dueDate !== null && plannedDate !== null ? dueDate - plannedDate : null;
  return {
    deferDate: gapDefer !== null ? newDue - gapDefer : deferDate === null ? null : advance(completedAt, rule),
    plannedDate: gapPlanned !== null ? newDue - gapPlanned : plannedDate === null ? null : advance(completedAt, rule),
    dueDate: newDue,
  };
}

export function describeRule(rule: RepetitionRule): string {
  const unit = rule.unit + (rule.every === 1 ? '' : 's');
  const every = rule.every === 1 ? `Every ${rule.unit}` : `Every ${rule.every} ${unit}`;
  const suffix = rule.method === 'fixed' ? '' : rule.method === 'startAfterCompletion' ? ' (defer another)' : ' (due again)';
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const wd = rule.unit === 'week' && rule.weekdays?.length ? ' on ' + rule.weekdays.map((d) => days[d]).join(', ') : '';
  return every + wd + suffix;
}
