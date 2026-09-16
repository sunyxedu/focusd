//! Mail Drop: turn e-mails into Inbox items.
//!
//! Focusd' Mail Drop is a hosted address. Here the app itself watches an
//! IMAP folder you choose (e.g. a dedicated Gmail label or a "+focus"
//! sub-address filter). Each unread message becomes an Inbox action:
//! subject → name, plain-text body → note. Messages are then marked read
//! and optionally moved to an archive folder. The password lives in the OS
//! keychain (macOS Keychain / Windows Credential Manager / Secret Service).
use hemlixfocus_core::{dispatch, MailDropConfig, Store};
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

const KEYRING_SERVICE: &str = "dev.hemlix.focus.maildrop";

fn entry(username: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYRING_SERVICE, username).map_err(|e| e.to_string())
}

pub fn set_password(username: &str, password: &str) -> Result<(), String> {
    if password.is_empty() {
        return entry(username)?.delete_credential().or(Ok(()));
    }
    entry(username)?.set_password(password).map_err(|e| e.to_string())
}

pub fn has_password(username: &str) -> bool {
    entry(username).and_then(|e| e.get_password().map_err(|x| x.to_string())).map(|p| !p.is_empty()).unwrap_or(false)
}

fn password(username: &str) -> Result<String, String> {
    entry(username)?.get_password().map_err(|_| "No Mail Drop password saved for this account".to_string())
}

/// One message turned into task fields.
#[derive(Debug, Clone, PartialEq)]
pub struct Parsed {
    pub name: String,
    pub note: String,
    pub flagged: bool,
}

/// Extract subject and a plain-text body from a raw RFC 822 message.
pub fn parse_message(raw: &[u8]) -> Parsed {
    let Ok(mail) = mailparse::parse_mail(raw) else {
        return Parsed { name: "(unreadable message)".into(), note: String::new(), flagged: false };
    };
    let subject = mail.headers.iter().find(|h| h.get_key().eq_ignore_ascii_case("Subject")).map(|h| h.get_value()).unwrap_or_default();
    let mut subject = subject.trim().to_string();
    // "!" prefix or "[flag]" marker → flagged, like Focusd Mail Drop's "!" convention
    let mut flagged = false;
    if let Some(rest) = subject.strip_prefix('!') {
        flagged = true;
        subject = rest.trim().to_string();
    }
    if subject.is_empty() {
        subject = "(No subject)".into();
    }
    let body = text_body(&mail).unwrap_or_default().replace("\r\n", "\n");
    // Mail Drop convention: the first "-- " line ends the note (signature cut)
    let note = body.split("\n-- \n").next().unwrap_or("").trim().to_string();
    Parsed { name: subject, note, flagged }
}

fn text_body(part: &mailparse::ParsedMail) -> Option<String> {
    let ctype = part.ctype.mimetype.to_ascii_lowercase();
    if ctype == "text/plain" {
        return part.get_body().ok();
    }
    if ctype.starts_with("multipart/") {
        // prefer text/plain, then fall back to html stripped of tags
        for sub in &part.subparts {
            if let Some(t) = text_body(sub) {
                return Some(t);
            }
        }
        for sub in &part.subparts {
            if sub.ctype.mimetype.eq_ignore_ascii_case("text/html") {
                return sub.get_body().ok().map(|h| strip_html(&h));
            }
        }
        return None;
    }
    if ctype == "text/html" {
        return part.get_body().ok().map(|h| strip_html(&h));
    }
    None
}

fn strip_html(html: &str) -> String {
    let mut out = String::with_capacity(html.len());
    let mut in_tag = false;
    for c in html.chars() {
        match c {
            '<' => in_tag = true,
            '>' => in_tag = false,
            c if !in_tag => out.push(c),
            _ => {}
        }
    }
    out.replace("&nbsp;", " ").replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", "\"").lines().map(str::trim).filter(|l| !l.is_empty()).collect::<Vec<_>>().join("\n")
}

fn connect(cfg: &MailDropConfig) -> Result<imap::Session<imap::Connection>, String> {
    let pw = password(&cfg.username)?;
    let client = imap::ClientBuilder::new(cfg.host.trim(), cfg.port).connect().map_err(|e| format!("Connection failed: {}", e))?;
    client.login(cfg.username.trim(), &pw).map_err(|e| format!("Login failed: {}", e.0))
}

/// Verify host / credentials / folder. Returns a human-readable summary.
pub fn test(cfg: &MailDropConfig) -> Result<String, String> {
    let mut s = connect(cfg)?;
    let mb = s.select(&cfg.folder).map_err(|e| format!("Folder \"{}\" not found: {}", cfg.folder, e))?;
    let unseen = s.uid_search("UNSEEN").map(|u| u.len()).unwrap_or(0);
    let _ = s.logout();
    Ok(format!("Connected. {} messages in \"{}\", {} unread.", mb.exists, cfg.folder, unseen))
}

/// Fetch unread messages, create Inbox items, mark them read (and archive).
/// Returns the number of items created.
pub fn poll(store: &Store, cfg: &MailDropConfig) -> Result<usize, String> {
    let mut s = connect(cfg)?;
    s.select(&cfg.folder).map_err(|e| e.to_string())?;
    let uids = s.uid_search("UNSEEN").map_err(|e| e.to_string())?;
    if uids.is_empty() {
        let _ = s.logout();
        return Ok(0);
    }
    let mut list: Vec<u32> = uids.into_iter().collect();
    list.sort_unstable();
    let set = list.iter().map(|u| u.to_string()).collect::<Vec<_>>().join(",");
    let fetches = s.uid_fetch(&set, "(UID RFC822)").map_err(|e| e.to_string())?;
    let mut created = 0usize;
    let mut done: Vec<String> = Vec::new();
    for f in fetches.iter() {
        let Some(body) = f.body() else { continue };
        let p = parse_message(body);
        let spec = serde_json::json!({
            "name": p.name, "note": p.note, "parent": null, "after": null, "project": null, "tagIds": [],
            "flagged": p.flagged, "deferDate": null, "plannedDate": null, "dueDate": null,
            "estimatedMinutes": null, "repetition": null
        });
        if dispatch(store, "addTask", &serde_json::json!({ "spec": spec })).is_ok() {
            created += 1;
            if let Some(uid) = f.uid {
                done.push(uid.to_string());
            }
        }
    }
    if !done.is_empty() {
        let set = done.join(",");
        let _ = s.uid_store(&set, "+FLAGS (\\Seen)");
        if !cfg.archive_folder.trim().is_empty() {
            let _ = s.uid_mv(&set, cfg.archive_folder.trim());
        }
    }
    let _ = s.logout();
    Ok(created)
}

/// Poll once now (used by the "Check now" button).
pub fn poll_now(app: &AppHandle) -> Result<usize, String> {
    let store: Arc<Store> = app.state::<crate::CoreState>().0.clone();
    let cfg = store.settings().mail_drop;
    if !cfg.enabled {
        return Err("Mail Drop is disabled".into());
    }
    let n = poll(&store, &cfg)?;
    if n > 0 {
        let _ = app.emit("core-changed", ());
    }
    Ok(n)
}

/// Background poller honouring `settings.mail_drop.poll_minutes`.
pub fn start(app: AppHandle) {
    std::thread::Builder::new()
        .name("mail-drop".into())
        .spawn(move || loop {
            let store: Arc<Store> = app.state::<crate::CoreState>().0.clone();
            let cfg = store.settings().mail_drop;
            if cfg.enabled && !cfg.host.is_empty() && !cfg.username.is_empty() {
                match poll(&store, &cfg) {
                    Ok(n) if n > 0 => {
                        let _ = app.emit("core-changed", ());
                        let _ = app.emit("mail-drop", format!("{} item{} added from Mail Drop", n, if n == 1 { "" } else { "s" }));
                    }
                    Ok(_) => {}
                    Err(e) => log::warn!("mail drop: {}", e),
                }
            }
            std::thread::sleep(Duration::from_secs(60 * cfg.poll_minutes.clamp(1, 240) as u64));
        })
        .ok();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_plain_text_message() {
        let raw = b"From: a@b.c\r\nSubject: ! Buy milk\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nTwo litres\r\n-- \r\nSent from my phone\r\n";
        let p = parse_message(raw);
        assert_eq!(p, Parsed { name: "Buy milk".into(), note: "Two litres".into(), flagged: true });
    }

    #[test]
    fn prefers_plain_part_and_strips_html() {
        let raw = b"Subject: Report\r\nContent-Type: multipart/alternative; boundary=\"b\"\r\n\r\n--b\r\nContent-Type: text/html\r\n\r\n<p>Hello <b>world</b></p>\r\n--b--\r\n";
        let p = parse_message(raw);
        assert_eq!(p.name, "Report");
        assert_eq!(p.note, "Hello world");
        assert!(!p.flagged);
    }
}
