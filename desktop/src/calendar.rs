//! Calendar feeds (ICS subscriptions) for the Forecast perspective.
//!
//! The host downloads every enabled feed, expands recurring events inside a
//! rolling window and hands the resulting `CalendarEvent`s to the core,
//! which merges them into the Forecast buckets.
use chrono::{DateTime, Local, NaiveDate, NaiveDateTime, TimeZone, Utc};
use hemlixfocus_core::{CalendarEvent, CalendarFeed, Store};
use ical::parser::ical::component::IcalEvent;
use ical::property::Property;
use rrule::{RRuleSet, Tz};
use std::io::BufReader;
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

const WINDOW_PAST_DAYS: i64 = 7;
const WINDOW_FUTURE_DAYS: i64 = 60;
const REFRESH_EVERY: Duration = Duration::from_secs(30 * 60);

fn prop<'a>(ev: &'a IcalEvent, name: &str) -> Option<&'a Property> {
    ev.properties.iter().find(|p| p.name.eq_ignore_ascii_case(name))
}

fn param<'a>(p: &'a Property, name: &str) -> Option<&'a str> {
    p.params.as_ref()?.iter().find(|(k, _)| k.eq_ignore_ascii_case(name)).and_then(|(_, v)| v.first()).map(|s| s.as_str())
}

/// A parsed DTSTART/DTEND value.
#[derive(Clone, Copy)]
struct IcsTime {
    ms: i64,
    all_day: bool,
}

fn parse_time(p: &Property) -> Option<IcsTime> {
    let v = p.value.as_deref()?.trim();
    let is_date = param(p, "VALUE").map(|x| x.eq_ignore_ascii_case("DATE")).unwrap_or(false) || (v.len() == 8 && !v.contains('T'));
    if is_date {
        let d = NaiveDate::parse_from_str(v, "%Y%m%d").ok()?;
        let dt = Local.from_local_datetime(&d.and_hms_opt(0, 0, 0)?).single()?;
        return Some(IcsTime { ms: dt.timestamp_millis(), all_day: true });
    }
    if let Some(stripped) = v.strip_suffix('Z') {
        let n = NaiveDateTime::parse_from_str(stripped, "%Y%m%dT%H%M%S").ok()?;
        return Some(IcsTime { ms: Utc.from_utc_datetime(&n).timestamp_millis(), all_day: false });
    }
    let n = NaiveDateTime::parse_from_str(v, "%Y%m%dT%H%M%S").ok()?;
    if let Some(tzid) = param(p, "TZID") {
        if let Ok(tz) = tzid.parse::<chrono_tz::Tz>() {
            let dt = tz.from_local_datetime(&n).single()?;
            return Some(IcsTime { ms: dt.timestamp_millis(), all_day: false });
        }
    }
    let dt = Local.from_local_datetime(&n).single()?;
    Some(IcsTime { ms: dt.timestamp_millis(), all_day: false })
}

/// Expand one VEVENT (with optional RRULE) into concrete events inside the
/// window. Non-recurring events are returned as-is when they overlap it.
fn expand(ev: &IcalEvent, feed: &CalendarFeed, win_start: i64, win_end: i64) -> Vec<CalendarEvent> {
    let Some(start_p) = prop(ev, "DTSTART") else { return vec![] };
    let Some(start) = parse_time(start_p) else { return vec![] };
    let end = prop(ev, "DTEND").and_then(parse_time).map(|t| t.ms).or_else(|| {
        prop(ev, "DURATION").and_then(|d| d.value.as_deref()).and_then(parse_duration_ms).map(|d| start.ms + d)
    });
    let duration = end.map(|e| (e - start.ms).max(0)).unwrap_or(if start.all_day { 86_400_000 } else { 0 });
    let title = prop(ev, "SUMMARY").and_then(|p| p.value.clone()).unwrap_or_else(|| "(No title)".into());
    let location = prop(ev, "LOCATION").and_then(|p| p.value.clone()).unwrap_or_default();
    let uid = prop(ev, "UID").and_then(|p| p.value.clone()).unwrap_or_else(|| format!("{}-{}", title, start.ms));
    let make = |s: i64| CalendarEvent {
        id: format!("{}:{}:{}", feed.id, uid, s),
        feed_id: feed.id.clone(),
        title: title.clone(),
        location: location.clone(),
        start: s,
        end: s + duration,
        all_day: start.all_day,
        color: feed.color.clone(),
    };

    let rrule = prop(ev, "RRULE").and_then(|p| p.value.clone());
    let Some(rule) = rrule else {
        return if start.ms + duration >= win_start && start.ms <= win_end { vec![make(start.ms)] } else { vec![] };
    };

    // Build an iCalendar snippet the rrule crate understands.
    let tz: Tz = if start.all_day || param(start_p, "TZID").is_none() { Tz::LOCAL } else { param(start_p, "TZID").and_then(|t| t.parse::<chrono_tz::Tz>().ok()).map(Tz::Tz).unwrap_or(Tz::LOCAL) };
    let Some(dt_start): Option<DateTime<Tz>> = tz.timestamp_millis_opt(start.ms).single() else { return vec![] };
    let mut set = RRuleSet::new(dt_start);
    let mut text = format!("RRULE:{}\n", rule);
    for ex in ev.properties.iter().filter(|p| p.name.eq_ignore_ascii_case("EXDATE")) {
        if let Some(v) = &ex.value {
            let tzid = param(ex, "TZID").map(|t| format!(";TZID={}", t)).unwrap_or_default();
            text.push_str(&format!("EXDATE{}:{}\n", tzid, v));
        }
    }
    set = match set.set_from_string(&text) {
        Ok(s) => s,
        Err(_) => return if start.ms + duration >= win_start && start.ms <= win_end { vec![make(start.ms)] } else { vec![] },
    };
    let after = Tz::LOCAL.timestamp_millis_opt(win_start - duration).single().unwrap_or(dt_start);
    let before = Tz::LOCAL.timestamp_millis_opt(win_end).single().unwrap_or(dt_start);
    let result = set.after(after).before(before).all(500);
    result.dates.into_iter().map(|d| make(d.timestamp_millis())).collect()
}

/// Parse an RFC 5545 DURATION such as `PT1H30M` or `P1D`.
fn parse_duration_ms(s: &str) -> Option<i64> {
    let s = s.trim();
    let (neg, s) = match s.strip_prefix('-') {
        Some(r) => (true, r),
        None => (false, s.strip_prefix('+').unwrap_or(s)),
    };
    let s = s.strip_prefix('P')?;
    let mut total: i64 = 0;
    let mut num = String::new();
    let mut in_time = false;
    for c in s.chars() {
        match c {
            'T' => in_time = true,
            d if d.is_ascii_digit() => num.push(d),
            unit => {
                let n: i64 = num.parse().ok()?;
                num.clear();
                total += match (unit, in_time) {
                    ('W', _) => n * 7 * 86_400_000,
                    ('D', _) => n * 86_400_000,
                    ('H', true) => n * 3_600_000,
                    ('M', true) => n * 60_000,
                    ('S', true) => n * 1000,
                    _ => return None,
                };
            }
        }
    }
    Some(if neg { -total } else { total })
}

fn parse_feed(text: &str, feed: &CalendarFeed, win_start: i64, win_end: i64) -> Vec<CalendarEvent> {
    let reader = BufReader::new(text.as_bytes());
    let mut out = Vec::new();
    for cal in ical::IcalParser::new(reader).flatten() {
        for ev in &cal.events {
            out.extend(expand(ev, feed, win_start, win_end));
        }
    }
    out
}

fn window() -> (i64, i64) {
    let today = Local::now().date_naive();
    let start = Local.from_local_datetime(&today.and_hms_opt(0, 0, 0).unwrap()).single().map(|d| d.timestamp_millis()).unwrap_or(0);
    (start - WINDOW_PAST_DAYS * 86_400_000, start + WINDOW_FUTURE_DAYS * 86_400_000)
}

/// Download and parse every enabled feed. Errors per feed are logged and
/// skipped so one broken subscription never hides the others.
pub fn fetch_all(feeds: &[CalendarFeed]) -> Vec<CalendarEvent> {
    let (ws, we) = window();
    let client = reqwest::blocking::Client::builder().timeout(Duration::from_secs(20)).user_agent("Focus/0.1").build();
    let Ok(client) = client else { return vec![] };
    let mut out = Vec::new();
    for feed in feeds.iter().filter(|f| f.enabled && !f.url.trim().is_empty()) {
        let url = feed.url.trim().replacen("webcal://", "https://", 1);
        match client.get(&url).send().and_then(|r| r.error_for_status()).and_then(|r| r.text()) {
            Ok(text) => out.extend(parse_feed(&text, feed, ws, we)),
            Err(e) => log::warn!("calendar feed {} failed: {}", feed.name, e),
        }
    }
    out
}

/// Refresh once, on the current thread (call from a blocking task).
pub fn refresh(app: &AppHandle) -> usize {
    let store: Arc<Store> = app.state::<crate::CoreState>().0.clone();
    let feeds = store.settings().calendar_feeds;
    let events = fetch_all(&feeds);
    let n = events.len();
    store.set_calendar_events(events);
    let _ = app.emit("core-changed", ());
    n
}

/// Background refresher: at launch and every 30 minutes.
pub fn start(app: AppHandle) {
    std::thread::Builder::new()
        .name("calendar-feeds".into())
        .spawn(move || loop {
            refresh(&app);
            std::thread::sleep(REFRESH_EVERY);
        })
        .ok();
}

#[cfg(test)]
mod tests {
    use super::*;

    fn feed() -> CalendarFeed {
        CalendarFeed { id: "f".into(), name: "Test".into(), url: String::new(), enabled: true, color: "#f00".into() }
    }

    #[test]
    fn parses_single_and_recurring_events() {
        let today = Local::now().date_naive();
        let ymd = today.format("%Y%m%d").to_string();
        let ics = format!(
            "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:a\r\nSUMMARY:Dentist\r\nDTSTART:{ymd}T090000\r\nDTEND:{ymd}T100000\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:b\r\nSUMMARY:Standup\r\nDTSTART:{ymd}T170000\r\nDURATION:PT15M\r\nRRULE:FREQ=DAILY;COUNT=5\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:c\r\nSUMMARY:Holiday\r\nDTSTART;VALUE=DATE:{ymd}\r\nDTEND;VALUE=DATE:{ymd}\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n"
        );
        let (ws, we) = window();
        let evs = parse_feed(&ics, &feed(), ws, we);
        let dentist: Vec<_> = evs.iter().filter(|e| e.title == "Dentist").collect();
        assert_eq!(dentist.len(), 1);
        assert_eq!(dentist[0].end - dentist[0].start, 3_600_000);
        let standups: Vec<_> = evs.iter().filter(|e| e.title == "Standup").collect();
        assert_eq!(standups.len(), 5);
        assert_eq!(standups[0].end - standups[0].start, 15 * 60_000);
        let holiday = evs.iter().find(|e| e.title == "Holiday").unwrap();
        assert!(holiday.all_day);
    }

    #[test]
    fn duration_parsing() {
        assert_eq!(parse_duration_ms("PT1H30M"), Some(5_400_000));
        assert_eq!(parse_duration_ms("P1D"), Some(86_400_000));
        assert_eq!(parse_duration_ms("-PT5M"), Some(-300_000));
        assert_eq!(parse_duration_ms("nonsense"), None);
    }
}
