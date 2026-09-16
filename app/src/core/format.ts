// Presentation-only date/time formatting for the UI (labels, calendar
// grids). All *parsing* and business logic lives in the Rust core
// (core/src/dates.rs) and is reached through Api.parseDate / parseDuration.
const MS_DAY = 86_400_000;

export function startOfDay(t: number | Date): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function endOfDay(t: number | Date): number {
  return startOfDay(t) + MS_DAY - 1;
}

export function addDays(t: number, n: number): number {
  const d = new Date(t);
  d.setDate(d.getDate() + n);
  return d.getTime();
}

export function addWeeks(t: number, n: number): number {
  return addDays(t, 7 * n);
}

export function addMonths(t: number, n: number): number {
  const d = new Date(t);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return d.getTime();
}

export function addYears(t: number, n: number): number {
  return addMonths(t, 12 * n);
}

export function dayKey(t: number | Date): string {
  const d = new Date(t);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${dd}`;
}

export function parseDayKey(k: string): number {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
}

export function isSameDay(a: number, b: number): boolean {
  return startOfDay(a) === startOfDay(b);
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function weekdayShort(t: number): string {
  return WEEKDAYS[new Date(t).getDay()];
}
export function monthShort(t: number): string {
  return MONTHS[new Date(t).getMonth()];
}

/** "Today", "Tomorrow", "Yesterday", "Wed 16", "16 Sep 2027" style label used in rows */
export function relativeDateLabel(t: number, now = Date.now()): string {
  const today = startOfDay(now);
  const day = startOfDay(t);
  const diff = Math.round((day - today) / MS_DAY);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  const d = new Date(t);
  if (Math.abs(diff) < 7) return `${WEEKDAYS[d.getDay()]}`;
  if (d.getFullYear() === new Date(now).getFullYear()) return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function timeLabel(t: number): string {
  const d = new Date(t);
  const h = d.getHours();
  const m = d.getMinutes();
  if (h === 0 && m === 0) return '';
  const hh = ((h + 11) % 12) + 1;
  const mm = String(m).padStart(2, '0');
  return `${hh}:${mm} ${h < 12 ? 'AM' : 'PM'}`;
}

/** Inspector style: "15 Sep 2026, 5:00 PM" */
export function fullDateLabel(t: number): string {
  const d = new Date(t);
  const time = timeLabel(t);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}${time ? ', ' + time : ''}`;
}

export function shortNumericDate(t: number): string {
  const d = new Date(t);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}
