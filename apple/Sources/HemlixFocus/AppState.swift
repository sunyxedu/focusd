import SwiftUI
import HemlixFocusCore

/// Bridge between the Rust store and SwiftUI. All model access goes through
/// here; views read `content`/`sidebar` after any `revision` bump.
@MainActor
final class AppState: ObservableObject {
    let store: HemlixFocusCore.Store

    /// Bumped on every store change so views re-query.
    @Published private(set) var revision: UInt64 = 0
    /// Row selection in the content outline (item ids; header keys excluded).
    @Published var selection: [String] = []
    @Published var search: String = ""
    @Published var inspectorVisible = true
    @Published var sidebarVisible = true
    @Published var perspectivesBarVisible = true
    @Published var showQuickEntry = false
    @Published var showQuickOpen = false
    @Published var showSettings = false
    @Published var showViewOptions = false
    /// id of the row whose title is being edited inline
    @Published var editingId: String? = nil
    /// Inspector sheet on iPhone
    @Published var inspectSheet = false

    final class Listener: StoreListener, @unchecked Sendable {
        weak var state: AppState?
        init(state: AppState) { self.state = state }
        func dataChanged() {
            DispatchQueue.main.async { [weak self] in
                self?.state?.objectWillChange.send()
                if let s = self?.state { s.revision &+= 1 }
            }
        }
    }
    private var listener: Listener?

    init(inMemory: Bool = false) {
        if inMemory {
            store = Store.inMemory(seed: true)
        } else {
            let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
            let dir = base.appendingPathComponent("HemlixFocus", isDirectory: true)
            try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
            do {
                store = try Store.open(path: dir.appendingPathComponent("database.json").path)
            } catch {
                store = Store.inMemory(seed: true)
            }
        }
        let l = Listener(state: self)
        store.addListener(listener: l)
        listener = l
    }

    // MARK: - Queries (re-run on every revision bump)

    var content: ContentModel { store.content(search: search) }
    var sidebar: SidebarModel { store.sidebar() }
    var badges: Badges { store.badges() }
    var perspective: Perspective { store.perspective() }
    var settings: HemlixFocusCore.Settings { store.settings() }
    var viewOptions: HemlixFocusCore.ViewOptions { store.viewOptions() }

    // MARK: - Selection

    func select(_ id: String, additive: Bool = false, range: Bool = false) {
        if additive {
            if selection.contains(id) { selection.removeAll { $0 == id } } else { selection.append(id) }
        } else if range, let anchor = selection.last {
            let rows = content.rows.compactMap { $0.itemId }
            if let a = rows.firstIndex(of: anchor), let b = rows.firstIndex(of: id) {
                let lo = min(a, b), hi = max(a, b)
                selection = Array(rows[lo ... hi])
                return
            }
            selection = [id]
        } else {
            selection = [id]
        }
    }

    func clearSelection() { selection = [] }

    // MARK: - Intents

    func setPerspective(_ p: Perspective) {
        selection = []
        search = ""
        store.setPerspective(p: p)
    }

    /// "New Action" in the current context (Return / Cmd-N / + button).
    @discardableResult
    func newTaskInContext() -> String {
        let spec = { (parent: String?, project: String?, after: String?, due: Int64?) in
            NewTaskSpec(name: "", note: "", parent: parent, after: after, project: project, tagIds: [], flagged: false, deferDate: nil, plannedDate: nil, dueDate: due, estimatedMinutes: nil, repetition: nil)
        }
        let id: String
        switch perspective {
        case .inbox:
            id = store.addTask(spec: spec(nil, nil, selection.last, nil))
        case .forecast:
            let day = store.forecastSelectedDay()
            let due: Int64? = {
                guard let day, day != "past", day != "future", let ms = dayToMs(day) else { return nil }
                return ms + Int64(settings.defaultDueHour) * 3_600_000
            }()
            id = store.addTask(spec: spec(nil, nil, nil, due ?? hfStartOfDay(ms: hfNow()) + Int64(settings.defaultDueHour) * 3_600_000))
        case .projects:
            let sel = selection.last
            if let sel, store.task(id: sel) != nil {
                let t = store.task(id: sel)!
                id = store.addTask(spec: spec(t.parentId, nil, sel, nil))
            } else if let sel, store.project(id: sel) != nil {
                id = store.addTask(spec: spec(nil, sel, nil, nil))
            } else {
                let projSel = sidebar.selection.first(where: { store.project(id: $0) != nil })
                id = store.addTask(spec: spec(nil, projSel, nil, nil))
            }
        case .review:
            let projSel = sidebar.selection.first(where: { store.project(id: $0) != nil }) ?? sidebar.rows.first?.id ?? nil
            id = store.addTask(spec: spec(nil, projSel, nil, nil))
        case .tags, .flagged, .nearby:
            id = store.addTask(spec: spec(nil, nil, nil, nil))
        }
        selection = [id]
        editingId = id
        return id
    }

    func newProject() {
        let folder = sidebar.selection.first(where: { store.folder(id: $0) != nil })
        let id = store.addProject(name: "", folder: folder)
        store.setSidebarSelection(ids: [id])
        selection = []
        editingId = id
    }

    func toggleComplete() { if !selection.isEmpty { store.toggleComplete(ids: selection) } }
    func toggleFlag() { if !selection.isEmpty { store.toggleFlag(ids: selection) } }
    func dropSelection() { if !selection.isEmpty { store.dropItems(ids: selection) } }
    func deleteSelection() { if !selection.isEmpty { store.deleteItems(ids: selection); selection = [] } }
    func indentSelection() { store.indent(ids: selection) }
    func outdentSelection() { store.outdent(ids: selection) }
    func cleanUp() { store.cleanUp(); selection = selection.filter { id in content.rows.contains { $0.itemId == id } } }

    func undo() { _ = store.undo() }
    func redo() { _ = store.redo() }

    func dayToMs(_ key: String) -> Int64? {
        // day keys are YYYY-MM-DD; reuse the date parser
        hfParseDate(input: key, defaultHour: 0)
    }
}

extension RowData {
    var itemId: String? {
        switch self {
        case .task(let r): return r.id
        case .project(let r): return r.id
        case .folder(let r): return r.id
        case .header: return nil
        }
    }
    var rowKey: String {
        switch self {
        case .task(let r): return r.key
        case .project(let r): return r.key
        case .folder(let r): return r.key
        case .header(let r): return r.key
        }
    }
    var depth: Int {
        switch self {
        case .task(let r): return Int(r.depth)
        case .project(let r): return Int(r.depth)
        case .folder(let r): return Int(r.depth)
        case .header(let r): return Int(r.depth)
        }
    }
}
