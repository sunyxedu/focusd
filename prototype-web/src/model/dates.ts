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

/**
 * Natural-language date parser, modelled on Focusd' date field:
 * today, tomorrow, yesterday, now, mon/tue…, next week, 2d/3w/1m/1y, +1d, "sep 20", "20 sep",
 * "2026-09-20", "9/20", optional time "5pm", "17:30". Returns null if unparsable.
 */
export function parseNaturalDate(input: string, defaultHour: number, now = Date.now()): number | null {
  const s = input.trim().toLowerCase();
  if (!s) return null;
  let base: number | null = null;
  let hour: number | null = null;
  let minute = 0;
  let rest = s;

  const timeMatch = rest.match(/(?:^|\s|,)(\d{1,2})(?::(\d{2}))?\s*(am|pm)?(?=$|\s)/);
  const dateOnlyNumeric = /^\d{1,2}$/.test(rest);
  if (timeMatch && !dateOnlyNumeric && (timeMatch[2] || timeMatch[3])) {
    let h = parseInt(timeMatch[1], 10);
    minute = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
    if (timeMatch[3] === 'pm' && h < 12) h += 12;
    if (timeMatch[3] === 'am' && h === 12) h = 0;
    hour = h;
    rest = (rest.slice(0, timeMatch.index) + ' ' + rest.slice(timeMatch.index! + timeMatch[0].length)).trim();
  }
  rest = rest.replace(/^(at|on)\s+/, '').trim();

  const today = startOfDay(now);
  const iso = rest.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const slash = rest.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  const rel = rest.match(/^\+?(\d+)\s*(d|day|days|w|week|weeks|m|month|months|y|year|years|h|hour|hours)$/);
  const monthNames = MONTHS.map((m) => m.toLowerCase());
  const monthDay = rest.match(/^([a-z]{3,9})\s+(\d{1,2})(?:,?\s*(\d{4}))?$/);
  const dayMonth = rest.match(/^(\d{1,2})\s+([a-z]{3,9})(?:,?\s*(\d{4}))?$/);

  if (rest === '' && hour !== null) base = today;
  else if (rest === 'today' || rest === 'tod') base = today;
  else if (rest === 'tomorrow' || rest === 'tom' || rest === 'tmr') base = addDays(today, 1);
  else if (rest === 'yesterday') base = addDays(today, -1);
  else if (rest === 'now') return now;
  else if (rest === 'next week') base = addDays(today, 7);
  else if (rest === 'next month') base = addMonths(today, 1);
  else if (rest === 'next year') base = addYears(today, 1);
  else if (iso) base = new Date(+iso[1], +iso[2] - 1, +iso[3]).getTime();
  else if (slash) {
    const y = slash[3] ? (slash[3].length === 2 ? 2000 + +slash[3] : +slash[3]) : new Date(now).getFullYear();
    base = new Date(y, +slash[1] - 1, +slash[2]).getTime();
    if (!slash[3] && base < today) base = addYears(base, 1);
  } else if (rel) {
    const n = +rel[1];
    const u = rel[2][0];
    if (u === 'd') base = addDays(today, n);
    else if (u === 'w') base = addWeeks(today, n);
    else if (u === 'm') base = addMonths(today, n);
    else if (u === 'y') base = addYears(today, n);
    else if (u === 'h') return now + n * 3_600_000;
  } else if (monthDay || dayMonth) {
    const mm = monthDay ? monthDay[1] : dayMonth![2];
    const dd = +(monthDay ? monthDay[2] : dayMonth![1]);
    const yy = (monthDay ? monthDay[3] : dayMonth![3]) || null;
    const mi = monthNames.findIndex((m) => mm.startsWith(m));
    if (mi < 0) return null;
    base = new Date(yy ? +yy : new Date(now).getFullYear(), mi, dd).getTime();
    if (!yy && base < today) base = addYears(base, 1);
  } else {
    const wd = WEEKDAYS.map((w) => w.toLowerCase());
    const long = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const next = rest.startsWith('next ');
    const name = rest.replace(/^next\s+/, '');
    let idx = wd.indexOf(name.slice(0, 3));
    if (idx < 0) idx = long.indexOf(name);
    if (idx < 0) return null;
    const cur = new Date(today).getDay();
    let delta = (idx - cur + 7) % 7;
    if (delta === 0 || next) delta += next && delta === 0 ? 7 : 0;
    if (delta === 0) delta = 7;
    base = addDays(today, delta);
  }
  if (base === null) return null;
  const d = new Date(base);
  d.setHours(hour ?? defaultHour, hour !== null ? minute : 0, 0, 0);
  return d.getTime();
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function parseDuration(s: string): number | null {
  const t = s.trim().toLowerCase();
  if (!t) return null;
  const m = t.match(/^(?:(\d+(?:\.\d+)?)\s*h(?:ours?)?)?\s*(?:(\d+)\s*m(?:in(?:utes?)?)?)?$/);
  if (m && (m[1] || m[2])) return Math.round((m[1] ? +m[1] * 60 : 0) + (m[2] ? +m[2] : 0));
  if (/^\d+$/.test(t)) return +t;
  return null;
}
