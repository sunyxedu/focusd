//! Local-time date helpers and the natural-language date parser used by the
//! Defer / Planned / Due fields ("tomorrow 5pm", "fri", "2w", "sep 20", "+1m").
use chrono::{Datelike, Duration, Local, NaiveDate, NaiveDateTime, TimeZone, Timelike, Weekday};

pub const MS_DAY: i64 = 86_400_000;

pub fn now_ms() -> i64 {
    Local::now().timestamp_millis()
}

fn to_local(ms: i64) -> chrono::DateTime<Local> {
    Local.timestamp_millis_opt(ms).single().unwrap_or_else(|| Local.timestamp_millis_opt(0).unwrap())
}

fn from_naive(n: NaiveDateTime) -> i64 {
    match Local.from_local_datetime(&n) {
        chrono::LocalResult::Single(d) => d.timestamp_millis(),
        chrono::LocalResult::Ambiguous(a, _) => a.timestamp_millis(),
        chrono::LocalResult::None => Local.from_local_datetime(&(n + Duration::hours(1))).single().map(|d| d.timestamp_millis()).unwrap_or(0),
    }
}

pub fn start_of_day(ms: i64) -> i64 {
    let d = to_local(ms).date_naive();
    from_naive(d.and_hms_opt(0, 0, 0).unwrap())
}

pub fn end_of_day(ms: i64) -> i64 {
    start_of_day(ms) + MS_DAY - 1
}

pub fn add_days(ms: i64, n: i64) -> i64 {
    let dt = to_local(ms).naive_local();
    from_naive(dt + Duration::days(n))
}

pub fn add_weeks(ms: i64, n: i64) -> i64 {
    add_days(ms, 7 * n)
}

pub fn add_months(ms: i64, n: i32) -> i64 {
    let dt = to_local(ms).naive_local();
    let total = dt.year() * 12 + dt.month0() as i32 + n;
    let (y, m0) = (total.div_euclid(12), total.rem_euclid(12));
    let last = last_day_of_month(y, m0 as u32 + 1);
    let day = dt.day().min(last);
    let date = NaiveDate::from_ymd_opt(y, m0 as u32 + 1, day).unwrap();
    from_naive(date.and_time(dt.time()))
}

pub fn add_years(ms: i64, n: i32) -> i64 {
    add_months(ms, 12 * n)
}

fn last_day_of_month(y: i32, m: u32) -> u32 {
    let (ny, nm) = if m == 12 { (y + 1, 1) } else { (y, m + 1) };
    NaiveDate::from_ymd_opt(ny, nm, 1).unwrap().pred_opt().unwrap().day()
}

/// "YYYY-MM-DD" in local time
pub fn day_key(ms: i64) -> String {
    to_local(ms).format("%Y-%m-%d").to_string()
}

pub fn parse_day_key(k: &str) -> Option<i64> {
    let d = NaiveDate::parse_from_str(k, "%Y-%m-%d").ok()?;
    Some(from_naive(d.and_hms_opt(0, 0, 0).unwrap()))
}

pub fn at_hour(ms_day: i64, hour: u32) -> i64 {
    let d = to_local(ms_day).date_naive();
    from_naive(d.and_hms_opt(hour.min(23), 0, 0).unwrap())
}

pub fn weekday_index(ms: i64) -> u32 {
    to_local(ms).weekday().num_days_from_sunday()
}

const WEEKDAYS: [&str; 7] = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS: [&str; 12] = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

pub fn weekday_short(ms: i64) -> &'static str {
    WEEKDAYS[weekday_index(ms) as usize]
}

pub fn month_short(ms: i64) -> &'static str {
    MONTHS[to_local(ms).month0() as usize]
}

pub fn day_of_month(ms: i64) -> u32 {
    to_local(ms).day()
}

pub fn time_label(ms: i64) -> String {
    let d = to_local(ms);
    let (h, m) = (d.hour(), d.minute());
    if h == 0 && m == 0 {
        return String::new();
    }
    let hh = (h + 11) % 12 + 1;
    format!("{}:{:02} {}", hh, m, if h < 12 { "AM" } else { "PM" })
}

/// "Today", "Tomorrow", "Yesterday", "Fri", "20 Sep", "20 Sep 2027"
pub fn relative_date_label(ms: i64, now: i64) -> String {
    let today = start_of_day(now);
    let day = start_of_day(ms);
    let diff = ((day - today) as f64 / MS_DAY as f64).round() as i64;
    match diff {
        0 => return "Today".into(),
        1 => return "Tomorrow".into(),
        -1 => return "Yesterday".into(),
        _ => {}
    }
    let d = to_local(ms);
    if diff.abs() < 7 {
        return WEEKDAYS[d.weekday().num_days_from_sunday() as usize].to_string();
    }
    if d.year() == to_local(now).year() {
        return format!("{} {}", d.day(), MONTHS[d.month0() as usize]);
    }
    format!("{} {} {}", d.day(), MONTHS[d.month0() as usize], d.year())
}

/// Row style "Due: Today 5:00 PM"
pub fn relative_date_time_label(ms: i64, now: i64) -> String {
    let t = time_label(ms);
    if t.is_empty() {
        relative_date_label(ms, now)
    } else {
        format!("{} {}", relative_date_label(ms, now), t)
    }
}

/// Inspector style "15 Sep 2026, 5:00 PM"
pub fn full_date_label(ms: i64) -> String {
    let d = to_local(ms);
    let t = time_label(ms);
    let base = format!("{} {} {}", d.day(), MONTHS[d.month0() as usize], d.year());
    if t.is_empty() {
        base
    } else {
        format!("{}, {}", base, t)
    }
}

pub fn short_numeric_date(ms: i64) -> String {
    to_local(ms).format("%d/%m/%Y").to_string()
}

/// "Tuesday, September 15"
pub fn long_date_label(ms: i64) -> String {
    to_local(ms).format("%A, %B %-d").to_string()
}

pub fn format_duration(minutes: u32) -> String {
    if minutes < 60 {
        return format!("{}m", minutes);
    }
    let (h, m) = (minutes / 60, minutes % 60);
    if m == 0 {
        format!("{}h", h)
    } else {
        format!("{}h {}m", h, m)
    }
}

pub fn parse_duration(s: &str) -> Option<u32> {
    let t = s.trim().to_lowercase();
    if t.is_empty() {
        return None;
    }
    if let Ok(n) = t.parse::<u32>() {
        return Some(n);
    }
    let mut total = 0f64;
    let mut num = String::new();
    let mut matched = false;
    for c in t.chars() {
        if c.is_ascii_digit() || c == '.' {
            num.push(c);
        } else if c == 'h' || c == 'm' {
            if num.is_empty() {
                return None;
            }
            let v: f64 = num.parse().ok()?;
            total += if c == 'h' { v * 60.0 } else { v };
            num.clear();
            matched = true;
        } else if c.is_whitespace() || c.is_alphabetic() {
            // skip "ours", "in", "inutes"
        } else {
            return None;
        }
    }
    if matched && num.is_empty() {
        Some(total.round() as u32)
    } else {
        None
    }
}

/// Natural-language date parser modelled on the Focusd date field.
pub fn parse_natural_date(input: &str, default_hour: u32, now: i64) -> Option<i64> {
    let s = input.trim().to_lowercase();
    if s.is_empty() {
        return None;
    }
    let mut rest = s.clone();
    let mut hour: Option<u32> = None;
    let mut minute = 0u32;

    // trailing time: "5pm", "17:30", "5:00 pm"
    let tokens: Vec<&str> = rest.split_whitespace().collect();
    if tokens.len() >= 1 {
        let n = tokens.len();
        let (time_tokens, consumed) = if n >= 2 && (tokens[n - 1] == "am" || tokens[n - 1] == "pm") {
            (format!("{}{}", tokens[n - 2], tokens[n - 1]), 2)
        } else {
            (tokens[n - 1].to_string(), 1)
        };
        if let Some((h, m)) = parse_time(&time_tokens) {
            // don't treat a lone number like "20" (day) as a time
            let lone_number = consumed == 1 && time_tokens.chars().all(|c| c.is_ascii_digit());
            if !lone_number || n == 1 && false {
                hour = Some(h);
                minute = m;
                rest = tokens[..n - consumed].join(" ");
            }
        }
    }
    let rest = rest.trim().trim_start_matches("at ").trim_start_matches("on ").trim().to_string();
    let today = start_of_day(now);

    let base: i64 = if rest.is_empty() && hour.is_some() {
        today
    } else {
        match rest.as_str() {
            "today" | "tod" => today,
            "tomorrow" | "tom" | "tmr" => add_days(today, 1),
            "yesterday" => add_days(today, -1),
            "now" => return Some(now),
            "next week" => add_days(today, 7),
            "next month" => add_months(today, 1),
            "next year" => add_years(today, 1),
            _ => parse_date_expr(&rest, today, now)?,
        }
    };
    let d = to_local(base).date_naive();
    let (h, m) = match hour {
        Some(h) => (h, minute),
        None => (default_hour.min(23), 0),
    };
    Some(from_naive(d.and_hms_opt(h, m, 0)?))
}

fn parse_time(t: &str) -> Option<(u32, u32)> {
    let (body, suffix) = if let Some(b) = t.strip_suffix("am") {
        (b, Some("am"))
    } else if let Some(b) = t.strip_suffix("pm") {
        (b, Some("pm"))
    } else {
        (t, None)
    };
    let (h, m) = if let Some((hh, mm)) = body.split_once(':') {
        (hh.parse::<u32>().ok()?, mm.parse::<u32>().ok()?)
    } else {
        (body.parse::<u32>().ok()?, 0)
    };
    if suffix.is_none() && !body.contains(':') {
        return None; // plain number without am/pm or colon is not a time
    }
    if h > 23 || m > 59 {
        return None;
    }
    let h = match suffix {
        Some("pm") if h < 12 => h + 12,
        Some("am") if h == 12 => 0,
        _ => h,
    };
    Some((h, m))
}

fn parse_date_expr(rest: &str, today: i64, now: i64) -> Option<i64> {
    // ISO yyyy-mm-dd
    if let Ok(d) = NaiveDate::parse_from_str(rest, "%Y-%m-%d") {
        return Some(from_naive(d.and_hms_opt(0, 0, 0)?));
    }
    // m/d or m/d/y  (also d/m if first > 12)
    if rest.contains('/') {
        let parts: Vec<&str> = rest.split('/').collect();
        if parts.len() >= 2 {
            let a: u32 = parts[0].parse().ok()?;
            let b: u32 = parts[1].parse().ok()?;
            let (m, d) = if a > 12 { (b, a) } else { (a, b) };
            let year = if parts.len() == 3 {
                let y: i32 = parts[2].parse().ok()?;
                if y < 100 {
                    2000 + y
                } else {
                    y
                }
            } else {
                to_local(now).year()
            };
            let mut ms = from_naive(NaiveDate::from_ymd_opt(year, m, d)?.and_hms_opt(0, 0, 0)?);
            if parts.len() == 2 && ms < today {
                ms = add_years(ms, 1);
            }
            return Some(ms);
        }
    }
    // relative: 2d, 3w, 1m, 1y, +1d, 4h
    let rel = rest.trim_start_matches('+');
    let digits: String = rel.chars().take_while(|c| c.is_ascii_digit()).collect();
    if !digits.is_empty() {
        let n: i64 = digits.parse().ok()?;
        let unit = rel[digits.len()..].trim();
        let known = matches!(
            unit,
            "" | "d" | "day" | "days" | "w" | "week" | "weeks" | "m" | "mo" | "month" | "months" | "y" | "yr" | "year" | "years" | "h" | "hr" | "hour" | "hours" | "mi" | "min" | "mins" | "minute" | "minutes"
        );
        if known && !unit.is_empty() {
            let ms = match unit.chars().next()? {
                'd' => add_days(today, n),
                'w' => add_weeks(today, n),
                'm' if unit.starts_with("mi") => return Some(now + n * 60_000),
                'm' => add_months(today, n as i32),
                'y' => add_years(today, n as i32),
                'h' => return Some(now + n * 3_600_000),
                _ => return None,
            };
            return Some(ms);
        }
        // unrecognized suffix (e.g. "20 sep"): fall through to month-name parsing
    }
    // "sep 20", "20 sep", "sep 20 2027"
    let toks: Vec<&str> = rest.split(|c: char| c.is_whitespace() || c == ',').filter(|t| !t.is_empty()).collect();
    if toks.len() >= 2 {
        let (mtok, dtok) = if toks[0].chars().all(|c| c.is_alphabetic()) { (toks[0], toks[1]) } else { (toks[1], toks[0]) };
        if let Some(mi) = MONTHS.iter().position(|m| mtok.starts_with(&m.to_lowercase())) {
            let d: u32 = dtok.parse().ok()?;
            let year: Option<i32> = toks.get(2).and_then(|y| y.parse().ok());
            let mut ms = from_naive(NaiveDate::from_ymd_opt(year.unwrap_or(to_local(now).year()), mi as u32 + 1, d)?.and_hms_opt(0, 0, 0)?);
            if year.is_none() && ms < today {
                ms = add_years(ms, 1);
            }
            return Some(ms);
        }
    }
    // weekday names, optional "next"
    let next = rest.starts_with("next ");
    let name = rest.trim_start_matches("next ").trim();
    let long = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    let idx = long.iter().position(|w| *w == name).or_else(|| if name.len() >= 3 { WEEKDAYS.iter().position(|w| w.to_lowercase() == name[..3]) } else { None })?;
    let cur = weekday_index(today) as i64;
    let mut delta = (idx as i64 - cur + 7) % 7;
    if delta == 0 {
        delta = 7;
    }
    if next && delta < 7 {
        delta += 0;
    }
    Some(add_days(today, delta))
}

pub fn weekday_from_index(i: u32) -> Weekday {
    match i % 7 {
        0 => Weekday::Sun,
        1 => Weekday::Mon,
        2 => Weekday::Tue,
        3 => Weekday::Wed,
        4 => Weekday::Thu,
        5 => Weekday::Fri,
        _ => Weekday::Sat,
    }
}

/* ---------------- UniFFI-exported helpers for the app shell ---------------- */

pub fn hf_now() -> i64 {
    now_ms()
}

pub fn hf_start_of_day(ms: i64) -> i64 {
    start_of_day(ms)
}

pub fn hf_add_days(ms: i64, n: i64) -> i64 {
    add_days(ms, n)
}

/// Parse natural-language dates ("tomorrow 5pm", "fri", "2w", "sep 20").
pub fn hf_parse_date(input: String, default_hour: u32) -> Option<i64> {
    parse_natural_date(&input, default_hour, now_ms())
}

pub fn hf_parse_duration(s: String) -> Option<u32> {
    parse_duration(&s)
}

pub fn hf_format_duration(minutes: u32) -> String {
    format_duration(minutes)
}

pub fn hf_relative_date_label(ms: i64) -> String {
    relative_date_label(ms, now_ms())
}

pub fn hf_relative_date_time_label(ms: i64) -> String {
    relative_date_time_label(ms, now_ms())
}

pub fn hf_full_date_label(ms: i64) -> String {
    full_date_label(ms)
}

pub fn hf_time_label(ms: i64) -> String {
    time_label(ms)
}

pub fn hf_day_key(ms: i64) -> String {
    day_key(ms)
}

pub fn hf_long_date_label(ms: i64) -> String {
    long_date_label(ms)
}

pub fn hf_weekday_index(ms: i64) -> u32 {
    weekday_index(ms)
}

pub fn hf_day_of_month(ms: i64) -> u32 {
    day_of_month(ms)
}

pub fn hf_month_short(ms: i64) -> String {
    month_short(ms).to_string()
}

pub fn hf_weekday_short(ms: i64) -> String {
    weekday_short(ms).to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_common_phrases() {
        let now = from_naive(NaiveDate::from_ymd_opt(2026, 9, 15).unwrap().and_hms_opt(10, 0, 0).unwrap());
        let today = start_of_day(now);
        assert_eq!(parse_natural_date("today", 17, now), Some(at_hour(today, 17)));
        assert_eq!(parse_natural_date("tomorrow 5pm", 17, now), Some(at_hour(add_days(today, 1), 17)));
        assert_eq!(parse_natural_date("2w", 17, now), Some(at_hour(add_days(today, 14), 17)));
        assert_eq!(parse_natural_date("sep 20", 17, now), Some(at_hour(add_days(today, 5), 17)));
        assert_eq!(parse_natural_date("20 sep 9:30", 17, now).map(time_label), Some("9:30 AM".to_string()));
        // 15 Sep 2026 is a Tuesday: "fri" => 18 Sep
        assert_eq!(parse_natural_date("fri", 17, now), Some(at_hour(add_days(today, 3), 17)));
        assert_eq!(parse_natural_date("2026-10-01", 0, now), parse_day_key("2026-10-01"));
        assert_eq!(parse_natural_date("garbage", 17, now), None);
    }

    #[test]
    fn durations() {
        assert_eq!(parse_duration("1h 30m"), Some(90));
        assert_eq!(parse_duration("45"), Some(45));
        assert_eq!(parse_duration("2h"), Some(120));
        assert_eq!(format_duration(90), "1h 30m");
    }

    #[test]
    fn month_arithmetic_clamps() {
        let jan31 = from_naive(NaiveDate::from_ymd_opt(2026, 1, 31).unwrap().and_hms_opt(12, 0, 0).unwrap());
        assert_eq!(day_key(add_months(jan31, 1)), "2026-02-28");
    }
}
