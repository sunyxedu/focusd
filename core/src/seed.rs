//! Factories, id generation and the tutorial database Focusd ships
//! with (the tutorial), used as first-run seed data.
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
    TutorialItem { key: "jvV_3crQ9rc", parent: None, name: "Get to know Focusd for Mac", note: "Welcome! This tutorial project will help you get acquainted with Focusd, so it can help you be more productive.", is_project: true },
    TutorialItem { key: "aEl1AXentPw", parent: Some("jvV_3crQ9rc"), name: "Begin with the basics", note: "", is_project: false },
    TutorialItem { key: "aI9kacciTs_", parent: Some("aEl1AXentPw"), name: "Click this action", note: "You have selected this action in the Outline. Press Tab to move focus between the editable fields, or simply click on a field you wish to edit.To complete the action, click the Status Circle next to the title.", is_project: false },
    TutorialItem { key: "pFiuqfbS-Tm", parent: Some("aEl1AXentPw"), name: "Create a new action", note: "Press Return or Command-N, and a new action will be added below your current selection in the outline. If there is no selection in the outline, new actions will be added to the end of the outline.", is_project: false },
    TutorialItem { key: "bC_8fHbhCnJ", parent: Some("aEl1AXentPw"), name: "Set a due date", note: "Tab into or click on the Due field. From here you can type in your desired date. Alternatively, click on the leading icon for the Due field to reveal a calendar picker that you can use to choose a date.", is_project: false },
    TutorialItem { key: "n1_QnA83m4s", parent: Some("aEl1AXentPw"), name: "Assign a tag", note: "Tab into or click on the Tags field and start typing to find an existing tag to assign, or to create a new tag. To see a full list of all tags to choose from, type just a space or click the disclosure triangle at the right edge of the Tags field.", is_project: false },
    TutorialItem { key: "kqhJLiU_ulJ", parent: Some("aEl1AXentPw"), name: "Create a project", note: "Click the Add button at the bottom of the Sidebar to the left, then choose one of the options to add a new project. You'll see you can also add folders here, which can be used to group similar projects together.", is_project: false },
    TutorialItem { key: "g0ADMuyX2Wl", parent: Some("aEl1AXentPw"), name: "Check out the Inspector", note: "Click the Inspect button in the right corner of the upper toolbar to reveal the Inspector, where you can view and edit additional details for actions, projects, folders, and tags.", is_project: false },
    TutorialItem { key: "cisi1zWRUg_", parent: Some("aEl1AXentPw"), name: "Reorder your actions", note: "Simply click and drag on actions to reorder them. While dragging move your cursor further to right to drop inside of another action, creating an action group. Alternatively, use the shortcuts Control-Command-Up Arrow / Controls-Command-Down Arrow to move up and down, and use Command-Right Bracket (]) / Command-Left Bracket ([) to indent and outdent.", is_project: false },
    TutorialItem { key: "fwsBcgwldVQ", parent: Some("jvV_3crQ9rc"), name: "Work more efficiently", note: "", is_project: false },
    TutorialItem { key: "a1ppmV8SxRm", parent: Some("fwsBcgwldVQ"), name: "Add to the Inbox from anywhere on your Mac", note: "Press Control-Option-Space bar to bring up the Quick Entry dialog. This lets you quickly add actions to the Inbox for future processing from anywhere on your Mac as long as Focusd is running. You can choose your own shortcut to use for Quick Entry in Settings > General.", is_project: false },
    TutorialItem { key: "fAFk3EBsjxD", parent: Some("fwsBcgwldVQ"), name: "Share from other apps", note: "Focusd' Share Extension lets you quickly add content from other apps to Focusd via the Quick Entry dialog. As an example, open a webpage in Safari and click the Share button in the toolbar. Choose Focusd in the list of apps, and the Quick Entry dialog will appear, pre-populated with a title and a URL in the note field based on the webpage you were viewing.", is_project: false },
    TutorialItem { key: "nHs_L4NcGL5", parent: Some("fwsBcgwldVQ"), name: "Try some keyboard shortcuts", note: "Keyboard shortcuts are a great way to speed up your workflow! Below are a few that we think you may find particularly useful: Mark Complete: Space bar. Mark Dropped: Option-Space bar. Delete: Command-Delete. Mark Flagged: F. Indent: Command-Right Bracket (]). Outdent: Command-Left Bracket ([).", is_project: false },
    TutorialItem { key: "otACM7FH29o", parent: Some("fwsBcgwldVQ"), name: "Batch edit", note: "Using Shift or Command you can select multiple actions and edit them all at once in the Inspector.", is_project: false },
    TutorialItem { key: "nn5Gi-KpPkU", parent: Some("fwsBcgwldVQ"), name: "Navigate with Quick Open", note: "Press Command-O to bring up Quick Open. Start typing in the dialog that appears to find any perspective, folder, project, or tag and jump right to that item.", is_project: false },
    TutorialItem { key: "m0lJmEQaZyq", parent: Some("jvV_3crQ9rc"), name: "Personalize your experience", note: "", is_project: false },
    TutorialItem { key: "mnmfy9UhPx2", parent: Some("m0lJmEQaZyq"), name: "Customize your outline Row Layout", note: "Focusd introduces Row Layout options, allowing you to customize what details are displayed and can be edited for actions and projects in the outline. To explore these options go to Settings > Layout. And with the Pro edition, you also have the option to customize the row layout separately for every perspective.", is_project: false },
    TutorialItem { key: "oDlGfUSeYbn", parent: Some("m0lJmEQaZyq"), name: "Customize your Inspector", note: "You can then also customize what details you see in the Inspector, choosing what to show by default and rearranging things in your preferred order. The fields you've choosen to hide in the Inspector can be temporarily revealed when needed.", is_project: false },
    TutorialItem { key: "gGxVR2TXzHO", parent: Some("m0lJmEQaZyq"), name: "Customize the Perspectives Bar", note: "The Perspectives Bar, located along the left side of the screen, gives you quick access to your favorite perspectives. To choose your favorites, choose Perspectives > Show Perspectives List in the menu bar, and click the star icons to mark your favorites. You can also drag to rearrange the order of your perspectives.", is_project: false },
    TutorialItem { key: "bLQ7l9Z-ai6", parent: Some("m0lJmEQaZyq"), name: "Adjust your View Options", note: "Click the eye icon in the upper toolbar to see and edit the current perspective's View Options, which provide controls over the display of items in that perspective. The options vary for each perspective, so be sure to check them out in all the perspectives you use.", is_project: false },
    TutorialItem { key: "exR2NlrQaS5", parent: Some("jvV_3crQ9rc"), name: "Other things to know", note: "", is_project: false },
    TutorialItem { key: "hFi0msc06Dj", parent: Some("exR2NlrQaS5"), name: "Access Focusd on all your Apple devices", note: "For the first time ever, Focusd is available as a universal cross-platform purchase: get full access to Focusd on your Mac, iPhone, iPad, Apple Watch, and Apple Vision Pro with a single license purchase.", is_project: false },
    TutorialItem { key: "inM-hGIQxol", parent: Some("exR2NlrQaS5"), name: "Go further with Pro", note: "Want to unleash the full potential of Focusd and take your productivity to the next level? Choose Focusd Pro to take advantage of custom perspectives, automation support, and more. During the free trial period you have full access to all Pro features.", is_project: false },
    TutorialItem { key: "kvqoU9VznMi", parent: Some("exR2NlrQaS5"), name: "Read the Reference Manual", note: "Want to know Focusd inside and out, or maybe just have a question not answered by this tutorial? The Reference Manual is the place to go. You can get to the Reference Manual in the app from the Help menu found under the More button in the upper toolbar.", is_project: false },
    TutorialItem { key: "lPo8Ek0Eowc", parent: Some("exR2NlrQaS5"), name: "Get support when you need it", note: "Whether it's an urgent problem, a quick how-to question, or a request for a new feature, our Support Humans are here to help. Tap the More button in the upper toolbar, and choose Contact us from the Help menu to email us from within Focusd. Additionally, visit our Support site where you can find support articles and additional contact options, including phone support.", is_project: false },
];

/// Recreates the tutorial database Focusd ships with (the tutorial):
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
