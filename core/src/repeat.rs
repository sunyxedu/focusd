//! Repetition rules: "Regularly" (fixed), "Defer another", "Due again".
use crate::dates::*;
use crate::model::{RepeatMethod, RepeatUnit, RepetitionRule, ReviewInterval, ReviewUnit};

pub fn advance(t: i64, rule: &RepetitionRule) -> i64 {
    let n = rule.every.max(1) as i64;
    match rule.unit {
        RepeatUnit::Minute => t + n * 60_000,
        RepeatUnit::Hour => t + n * 3_600_000,
        RepeatUnit::Day => add_days(t, n),
        RepeatUnit::Week => {
            if !rule.weekdays.is_empty() {
                let start_week = |x: i64| add_days(start_of_day(x), -(weekday_index(x) as i64));
                for i in 1..=(7 * n + 7) {
                    let c = add_days(t, i);
                    let weeks_apart = (start_week(c) - start_week(t)) / (7 * MS_DAY);
                    if rule.weekdays.contains(&(weekday_index(c) as u8)) && weeks_apart % n == 0 {
                        return c;
                    }
                }
            }
            add_weeks(t, n)
        }
        RepeatUnit::Month => add_months(t, n as i32),
        RepeatUnit::Year => add_years(t, n as i32),
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Dates {
    pub defer: Option<i64>,
    pub planned: Option<i64>,
    pub due: Option<i64>,
}

/// Dates for the next occurrence after completing at `completed_at`.
pub fn next_occurrence(rule: &RepetitionRule, d: Dates, completed_at: i64) -> Dates {
    match rule.method {
        RepeatMethod::Fixed => {
            let mut cur = d;
            if cur.due.is_none() && cur.planned.is_none() && cur.defer.is_none() {
                cur.due = Some(completed_at);
            }
            let anchor = |x: &Dates| x.due.or(x.planned).or(x.defer).unwrap_or(completed_at);
            let mut guard = 0;
            loop {
                cur = Dates { defer: cur.defer.map(|x| advance(x, rule)), planned: cur.planned.map(|x| advance(x, rule)), due: cur.due.map(|x| advance(x, rule)) };
                guard += 1;
                if anchor(&cur) > completed_at || guard > 1000 {
                    break;
                }
            }
            cur
        }
        RepeatMethod::StartAfterCompletion => {
            let new_defer = advance(completed_at, rule);
            let gap_due = match (d.due, d.defer) {
                (Some(a), Some(b)) => Some(a - b),
                _ => None,
            };
            let gap_planned = match (d.planned, d.defer) {
                (Some(a), Some(b)) => Some(a - b),
                _ => None,
            };
            Dates {
                defer: Some(new_defer),
                planned: gap_planned.map(|g| new_defer + g).or_else(|| d.planned.map(|_| advance(completed_at, rule))),
                due: gap_due.map(|g| new_defer + g).or_else(|| d.due.map(|_| advance(completed_at, rule))),
            }
        }
        RepeatMethod::DueAfterCompletion => {
            let new_due = advance(completed_at, rule);
            let gap_defer = match (d.due, d.defer) {
                (Some(a), Some(b)) => Some(a - b),
                _ => None,
            };
            let gap_planned = match (d.due, d.planned) {
                (Some(a), Some(b)) => Some(a - b),
                _ => None,
            };
            Dates {
                defer: gap_defer.map(|g| new_due - g).or_else(|| d.defer.map(|_| advance(completed_at, rule))),
                planned: gap_planned.map(|g| new_due - g).or_else(|| d.planned.map(|_| advance(completed_at, rule))),
                due: Some(new_due),
            }
        }
    }
}

/// Next review date after `from` for the given review interval.
pub fn advance_review(from: i64, iv: &ReviewInterval) -> i64 {
    let n = iv.steps.max(1);
    match iv.unit {
        ReviewUnit::Day => add_days(from, n as i64),
        ReviewUnit::Week => add_weeks(from, n as i64),
        ReviewUnit::Month => add_months(from, n as i32),
        ReviewUnit::Year => add_years(from, n as i32),
    }
}

/// Human-readable description, e.g. "Every 2 weeks on Mon, Fri (defer another)".
pub fn hf_describe_repetition(rule: RepetitionRule) -> String {
    describe_rule(&rule)
}

pub fn describe_rule(rule: &RepetitionRule) -> String {    let unit = match rule.unit {
        RepeatUnit::Minute => "minute",
        RepeatUnit::Hour => "hour",
        RepeatUnit::Day => "day",
        RepeatUnit::Week => "week",
        RepeatUnit::Month => "month",
        RepeatUnit::Year => "year",
    };
    let every = if rule.every <= 1 { format!("Every {}", unit) } else { format!("Every {} {}s", rule.every, unit) };
    let days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    let wd = if rule.unit == RepeatUnit::Week && !rule.weekdays.is_empty() {
        format!(" on {}", rule.weekdays.iter().map(|d| days[(*d as usize) % 7]).collect::<Vec<_>>().join(", "))
    } else {
        String::new()
    };
    let suffix = match rule.method {
        RepeatMethod::Fixed => "",
        RepeatMethod::StartAfterCompletion => " (defer another)",
        RepeatMethod::DueAfterCompletion => " (due again)",
    };
    format!("{}{}{}", every, wd, suffix)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fixed_weekly_moves_past_completion() {
        let rule = RepetitionRule { every: 1, unit: RepeatUnit::Week, method: RepeatMethod::Fixed, weekdays: vec![] };
        let due = parse_day_key("2026-09-01").unwrap();
        let completed = parse_day_key("2026-09-16").unwrap();
        let next = next_occurrence(&rule, Dates { defer: None, planned: None, due: Some(due) }, completed);
        assert_eq!(day_key(next.due.unwrap()), "2026-09-22");
    }

    #[test]
    fn due_again_keeps_gap() {
        let rule = RepetitionRule { every: 3, unit: RepeatUnit::Day, method: RepeatMethod::DueAfterCompletion, weekdays: vec![] };
        let defer = parse_day_key("2026-09-10").unwrap();
        let due = parse_day_key("2026-09-12").unwrap();
        let completed = parse_day_key("2026-09-15").unwrap();
        let next = next_occurrence(&rule, Dates { defer: Some(defer), planned: None, due: Some(due) }, completed);
        assert_eq!(day_key(next.due.unwrap()), "2026-09-18");
        assert_eq!(day_key(next.defer.unwrap()), "2026-09-16");
    }
}
