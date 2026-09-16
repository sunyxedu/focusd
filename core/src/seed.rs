//! Factories, id generation and the first-run tutorial database.
use crate::dates::{add_days, add_weeks, now_ms};
use crate::model::*;
use rand::Rng;

pub fn new_id() -> String {
    const CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";
    let mut rng = rand::thread_rng();
    (0..11).map(|_| CHARS[rng.gen_range(0..CHARS.len())] as char).collect()
}

pub fn make_task(name: &str, now: i64) -> Task {
    Task {
        id: new_id(),
        name: name.to_string(),
        note: String::new(),
        parent_id: None,
        sequential: false,
        completed_by_children: false,
        flagged: false,
        tag_ids: Vec::new(),
        defer_date: None,
        planned_date: None,
        due_date: None,
        completed_at: None,
        dropped_at: None,
        estimated_minutes: None,
        repetition: None,
        rank: now as f64,
        created_at: now,
        modified_at: now,
    }
}

pub fn make_project(name: &str, now: i64) -> Project {
    Project {
        id: new_id(),
        name: name.to_string(),
        note: String::new(),
        folder_id: None,
        status: ProjectStatus::Active,
        project_type: ProjectType::Parallel,
        completed_by_children: false,
        flagged: false,
        tag_ids: Vec::new(),
        defer_date: None,
        planned_date: None,
        due_date: None,
        completed_at: None,
        dropped_at: None,
        estimated_minutes: None,
        repetition: None,
        review_interval: ReviewInterval { steps: 1, unit: ReviewUnit::Week },
        last_reviewed_at: Some(now),
        next_review_at: Some(add_weeks(now, 1)),
        rank: now as f64,
        created_at: now,
        modified_at: now,
    }
}

pub fn make_folder(name: &str, now: i64) -> Folder {
    Folder { id: new_id(), name: name.to_string(), note: String::new(), parent_id: None, status: FolderStatus::Active, rank: now as f64, created_at: now, modified_at: now }
}

pub fn make_tag(name: &str, now: i64) -> Tag {
    Tag { id: new_id(), name: name.to_string(), note: String::new(), parent_id: None, status: TagStatus::Active, allows_next_action: true, rank: now as f64, created_at: now, modified_at: now }
}

struct TutorialItem {
    key: &'static str,
    parent: Option<&'static str>,
    name: &'static str,
    note: &'static str,
    is_project: bool,
}

const TUTORIAL: &[TutorialItem] = &[
    TutorialItem { key: "jvV_3crQ9rc", parent: None, name: "Get to know Focusd", note: "Welcome! This tutorial project walks you through planning and managing your tasks in Focusd, so it can help you be more productive.", is_project: true },
    TutorialItem { key: "aEl1AXentPw", parent: Some("jvV_3crQ9rc"), name: "Begin with the basics", note: "", is_project: false },
    TutorialItem { key: "aI9kacciTs_", parent: Some("aEl1AXentPw"), name: "Click this action", note: "You have selected this action in the Outline. Press Tab to move focus between the editable fields, or simply click on a field you wish to edit. To complete the action, click the Status Circle next to the title.", is_project: false },
    TutorialItem { key: "pFiuqfbS-Tm", parent: Some("aEl1AXentPw"), name: "Create a new action", note: "Press Return or Command-N, and a new action will be added below your current selection in the outline. If there is no selection in the outline, new actions will be added to the end of the outline.", is_project: false },
    TutorialItem { key: "bC_8fHbhCnJ", parent: Some("aEl1AXentPw"), name: "Set a due date", note: "Tab into or click on the Due field. From here you can type in your desired date, including phrases like \"tomorrow 5pm\" or \"fri\". Alternatively, click on the calendar icon for the Due field to pick a date.", is_project: false },
    TutorialItem { key: "n1_QnA83m4s", parent: Some("aEl1AXentPw"), name: "Assign a tag", note: "Tab into or click on the Tags field and start typing to find an existing tag to assign, or to create a new tag. To see a full list of all tags to choose from, type just a space.", is_project: false },
    TutorialItem { key: "kqhJLiU_ulJ", parent: Some("aEl1AXentPw"), name: "Create a project", note: "Click the Add button at the bottom of the Sidebar to the left, then choose one of the options to add a new project. You'll see you can also add folders here, which can be used to group similar projects together.", is_project: false },
    TutorialItem { key: "g0ADMuyX2Wl", parent: Some("aEl1AXentPw"), name: "Check out the Inspector", note: "Click the Inspect button in the right corner of the upper toolbar to reveal the Inspector, where you can view and edit additional details for actions, projects, folders, and tags.", is_project: false },
    TutorialItem { key: "cisi1zWRUg_", parent: Some("aEl1AXentPw"), name: "Reorder your actions", note: "Simply click and drag on actions to reorder them. While dragging move your cursor further to the right to drop inside of another action, creating an action group. Alternatively, use Control-Command-Up Arrow / Control-Command-Down Arrow to move up and down, and Command-Right Bracket (]) / Command-Left Bracket ([) to indent and outdent.", is_project: false },
    TutorialItem { key: "fwsBcgwldVQ", parent: Some("jvV_3crQ9rc"), name: "Work more efficiently", note: "", is_project: false },
    TutorialItem { key: "a1ppmV8SxRm", parent: Some("fwsBcgwldVQ"), name: "Add to the Inbox from anywhere on your Mac", note: "Press Control-Option-Space bar to bring up the Quick Entry dialog. This lets you quickly add actions to the Inbox for later planning from anywhere on your Mac as long as Focusd is running.", is_project: false },
    TutorialItem { key: "fAFk3EBsjxD", parent: Some("fwsBcgwldVQ"), name: "Send tasks from other apps", note: "Any app can add to your Inbox through the focusd://add URL scheme, and Mail Drop turns e-mails sent to a mailbox you choose into Inbox items. Set both up in Settings > Mail Drop.", is_project: false },
    TutorialItem { key: "nHs_L4NcGL5", parent: Some("fwsBcgwldVQ"), name: "Try some keyboard shortcuts", note: "Keyboard shortcuts are a great way to speed up your workflow! A few you may find particularly useful: Mark Complete: Space bar. Delete: Delete. Flag: Shift-Command-L. Indent: Control-Command-Right Bracket (]). Outdent: Control-Command-Left Bracket ([). See Help > Keyboard Shortcuts for the full list.", is_project: false },
    TutorialItem { key: "otACM7FH29o", parent: Some("fwsBcgwldVQ"), name: "Batch edit", note: "Using Shift or Command you can select multiple actions and edit them all at once in the Inspector.", is_project: false },
    TutorialItem { key: "nn5Gi-KpPkU", parent: Some("fwsBcgwldVQ"), name: "Navigate with Quick Open", note: "Press Command-O to bring up Quick Open. Start typing in the dialog that appears to find any perspective, folder, project, or tag and jump right to that item.", is_project: false },
    TutorialItem { key: "m0lJmEQaZyq", parent: Some("jvV_3crQ9rc"), name: "Personalize your experience", note: "", is_project: false },
    TutorialItem { key: "mnmfy9UhPx2", parent: Some("m0lJmEQaZyq"), name: "Customize your outline Row Layout", note: "Row Layout options let you choose which details are displayed and editable for actions and projects in the outline. Open the View Options (the eye icon) to change the layout for the current perspective.", is_project: false },
    TutorialItem { key: "oDlGfUSeYbn", parent: Some("m0lJmEQaZyq"), name: "Customize your Inspector", note: "The Inspector shows status, project type, tags, defer / planned / due dates, repeats, estimates, review settings and notes. Hide it with Option-Command-I when you want the whole window for your outline.", is_project: false },
    TutorialItem { key: "gGxVR2TXzHO", parent: Some("m0lJmEQaZyq"), name: "Customize the Perspectives Bar", note: "The Perspectives Bar, located along the left side of the screen, gives you quick access to Inbox, Projects, Tags, Forecast, Flagged, Nearby and Review. Command-1 through Command-7 switch between them; badges can be turned off in Settings > General.", is_project: false },
    TutorialItem { key: "bLQ7l9Z-ai6", parent: Some("m0lJmEQaZyq"), name: "Adjust your View Options", note: "Click the eye icon in the upper toolbar to see and edit the current perspective's View Options, which provide controls over the display of items in that perspective. The options vary for each perspective, so be sure to check them out in all the perspectives you use.", is_project: false },
    TutorialItem { key: "exR2NlrQaS5", parent: Some("jvV_3crQ9rc"), name: "Other things to know", note: "", is_project: false },
    TutorialItem { key: "hFi0msc06Dj", parent: Some("exR2NlrQaS5"), name: "Use Focusd on all your devices", note: "Focusd runs on Mac, iPhone, iPad, Windows, Linux and in the browser from the same code, so your planning works the same way everywhere. Move your database between devices with Export and Import in Settings > Data.", is_project: false },
    TutorialItem { key: "inM-hGIQxol", parent: Some("exR2NlrQaS5"), name: "Plan with Forecast and Review", note: "Forecast lays out due and planned items day by day together with your subscribed calendars, so you can see what fits. Review walks you through each project on its own schedule so nothing goes stale.", is_project: false },
    TutorialItem { key: "kvqoU9VznMi", parent: Some("exR2NlrQaS5"), name: "Read the documentation", note: "The README in the project repository explains every feature, the keyboard shortcuts and how to build the app yourself.", is_project: false },
    TutorialItem { key: "lPo8Ek0Eowc", parent: Some("exR2NlrQaS5"), name: "Get support when you need it", note: "Found a problem or have an idea? Open an issue in the project repository. Focusd is open source under the MIT license.", is_project: false },
];

/// Builds the first-run tutorial database:
/// the default tag tree plus the tutorial project.
pub fn seed_database() -> Database {
    let mut db = Database::empty();
    let now = now_ms();
    let mut rank = 0.0;
    let add_tag = |name: &str, parent_id: Option<Id>, on_hold: bool, rank: &mut f64| -> Tag {
        let mut t = make_tag(name, now);
        t.parent_id = parent_id;
        t.rank = *rank;
        *rank += 1.0;
        if on_hold {
            t.status = TagStatus::OnHold;
            t.allows_next_action = false;
        }
        t
    };
    let home = add_tag("Home", None, false, &mut rank);
    let office = add_tag("Office", None, false, &mut rank);
    let phone = add_tag("Phone Calls", None, false, &mut rank);
    let errands = add_tag("Errands", None, false, &mut rank);
    let supermarket = add_tag("Supermarket", Some(errands.id.clone()), false, &mut rank);
    let hardware = add_tag("Hardware Store", Some(errands.id.clone()), false, &mut rank);
    let department = add_tag("Department Store", Some(errands.id.clone()), false, &mut rank);
    let people = add_tag("People", None, false, &mut rank);
    let parents = add_tag("Parents", Some(people.id.clone()), false, &mut rank);
    let boss = add_tag("Boss", Some(people.id.clone()), false, &mut rank);
    let doctor = add_tag("Doctor", Some(people.id.clone()), false, &mut rank);
    let waiting = add_tag("Waiting", None, true, &mut rank);
    for t in [home, office, phone, errands, supermarket, hardware, department, people, parents, boss, doctor, waiting] {
        db.tags.insert(t.id.clone(), t);
    }

    let mut id_map: std::collections::HashMap<&str, Id> = std::collections::HashMap::new();
    let mut trank = 0.0;
    // matches new Date(2023, 10, 20) in the original seed: 20 Nov 2023 local
    let reviewed = crate::dates::parse_day_key("2023-11-20").unwrap_or(now);
    for item in TUTORIAL {
        if item.is_project {
            let mut p = make_project(item.name, now);
            p.note = item.note.to_string();
            p.rank = trank;
            trank += 1.0;
            p.last_reviewed_at = Some(reviewed);
            p.next_review_at = Some(add_days(reviewed, 7));
            id_map.insert(item.key, p.id.clone());
            db.projects.insert(p.id.clone(), p);
        } else {
            let mut t = make_task(item.name, now);
            t.note = item.note.to_string();
            t.parent_id = item.parent.and_then(|k| id_map.get(k).cloned());
            t.rank = trank;
            trank += 1.0;
            id_map.insert(item.key, t.id.clone());
            db.tasks.insert(t.id.clone(), t);
        }
    }
    db
}
