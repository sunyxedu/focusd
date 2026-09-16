import SwiftUI
import HemlixFocusCore

struct SidebarView: View {
    @EnvironmentObject var state: AppState

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                LazyVStack(spacing: 0) {
                    switch state.sidebar.perspective {
                    case .forecast:
                        ForecastSidebar()
                    default:
                        ForEach(state.sidebar.rows, id: \.key) { row in
                            SidebarRowView(row: row)
                        }
                    }
                }
                .padding(.vertical, 4)
            }
            Divider()
            footer
        }
        .background(Color(nsColorOrSystem: .barBackground))
    }

    var footer: some View {
        HStack {
            Menu {
                switch state.perspective {
                case .projects:
                    Button("New Project") { state.newProject() }
                    Button("New Folder") {
                        let parent = state.sidebar.selection.first(where: { state.store.folder(id: $0) != nil })
                        let id = state.store.addFolder(name: "", parent: parent)
                        state.store.setSidebarSelection(ids: [id])
                        state.editingId = id
                    }
                case .tags:
                    Button("New Tag") {
                        let parent = state.sidebar.selection.first(where: { state.store.tag(id: $0) != nil })
                        let id = state.store.addTag(name: "", parent: parent)
                        if let parent { state.store.setSidebarExpanded(key: parent, expanded: true) }
                        state.store.setSidebarSelection(ids: [id])
                        state.editingId = id
                    }
                case .review:
                    Button("New Project") {
                        let id = state.store.addProject(name: "Untitled Project", folder: nil)
                        state.store.setSidebarSelection(ids: [id])
                    }
                default:
                    Button("New Action") { state.newTaskInContext() }
                }
            } label: { Image(systemName: "plus") }
            .menuStyle(.borderlessButton)
            .frame(width: 30)

            Menu {
                Button("Expand All") { state.store.expandAllSidebar(expanded: true) }
                Button("Collapse All") { state.store.expandAllSidebar(expanded: false) }
                if state.sidebar.focused {
                    Divider()
                    Button("Unfocus") { state.store.setFocus(ids: []) }
                }
            } label: { Image(systemName: "gearshape") }
            .menuStyle(.borderlessButton)
            .frame(width: 30)
            Spacer()
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
    }
}

struct SidebarRowView: View {
    @EnvironmentObject var state: AppState
    let row: SidebarRow

    var body: some View {
        HStack(spacing: 4) {
            if row.hasChildren {
                Button {
                    state.store.setSidebarExpanded(key: row.key, expanded: !row.expanded)
                } label: {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 9, weight: .bold))
                        .foregroundStyle(.secondary)
                        .rotationEffect(.degrees(row.expanded ? 90 : 0))
                        .frame(width: 12)
                }
                .buttonStyle(.plain)
            } else {
                Spacer().frame(width: 12)
            }
            icon
            if state.editingId == row.id {
                InlineRename(initial: row.name, placeholder: placeholder) { newName in
                    state.editingId = nil
                    if let newName, let id = row.id { state.store.rename(id: id, name: newName) }
                }
            } else {
                Text(row.name.isEmpty ? placeholder : row.name)
                    .foregroundStyle(row.name.isEmpty ? Color.ofText3 : (row.dim ? Color.ofText3 : .primary))
                    .lineLimit(1)
            }
            Spacer(minLength: 2)
            auxIcons
            if row.kind == .tag || row.kind == .untagged, row.remainingCount > 0 {
                Text("\(row.remainingCount)").font(.caption).foregroundStyle(.secondary)
            }
            if row.needsReview {
                Circle().fill(Color.ofReview).frame(width: 6, height: 6)
            }
        }
        .padding(.leading, CGFloat(6 + row.depth * 16))
        .padding(.trailing, 8)
        .frame(height: 26)
        .background(row.selected ? Color.ofSelect : .clear)
        .contentShape(Rectangle())
        .onTapGesture {
            if let id = row.id { state.store.setSidebarSelection(ids: row.selected ? [] : [id]) }
        }
        .contextMenu { contextMenu }
    }

    var placeholder: String {
        switch row.kind {
        case .folder: return "Untitled Folder"
        case .project, .reviewProject: return "Untitled Project"
        case .tag, .untagged: return "Untitled Tag"
        }
    }

    @ViewBuilder var icon: some View {
        switch row.kind {
        case .folder:
            Image(systemName: "folder").foregroundStyle(Color.ofText2)
        case .project, .reviewProject:
            let c: Color = row.status == .active ? .ofProjects : Color.ofText3
            switch row.status {
            case .done: Image(systemName: "checkmark.circle").foregroundStyle(c)
            case .dropped: Image(systemName: "minus.circle").foregroundStyle(c)
            default:
                switch row.projectType {
                case .sequential: Image(systemName: "list.number").foregroundStyle(c)
                case .singleActions: Image(systemName: "circle.grid.cross").foregroundStyle(c)
                default: Image(systemName: "list.bullet").foregroundStyle(c)
                }
            }
        case .tag, .untagged:
            Image(systemName: "tag").foregroundStyle(row.dim ? Color.ofText3 : .ofTags)
        }
    }

    @ViewBuilder var auxIcons: some View {
        if row.status == .onHold || row.tagStatus == .onHold {
            Image(systemName: "pause.fill").font(.system(size: 8)).foregroundStyle(.secondary)
        }
        if row.tagStatus == .dropped {
            Image(systemName: "minus.circle").font(.system(size: 10)).foregroundStyle(.secondary)
        }
        if let c = row.dueState.color {
            Circle().fill(c).frame(width: 7, height: 7)
        }
        if row.flagged {
            Image(systemName: "flag.fill").font(.system(size: 8)).foregroundStyle(Color.ofFlag)
        }
    }

    @ViewBuilder var contextMenu: some View {
        if let id = row.id {
            Button("Rename") { state.editingId = id }
            if row.kind == .project || row.kind == .reviewProject {
                Button("Focus") { state.store.setFocus(ids: [id]) }
                Divider()
                Button("Active") { state.store.setProjectStatus(id: id, status: .active) }
                Button("On Hold") { state.store.setProjectStatus(id: id, status: .onHold) }
                Button("Completed") { state.store.setProjectStatus(id: id, status: .done) }
                Button("Dropped") { state.store.setProjectStatus(id: id, status: .dropped) }
                Divider()
                Button("Parallel") { state.store.setProjectType(id: id, t: .parallel) }
                Button("Sequential") { state.store.setProjectType(id: id, t: .sequential) }
                Button("Single Actions") { state.store.setProjectType(id: id, t: .singleActions) }
                Divider()
                Button("Mark Reviewed") { state.store.markReviewed(ids: [id]) }
                Button("Delete Project", role: .destructive) { state.store.deleteItems(ids: [id]) }
            }
            if row.kind == .folder {
                Button("Focus") { state.store.setFocus(ids: [id]) }
                Button("New Project in Folder") {
                    let pid = state.store.addProject(name: "", folder: id)
                    state.store.setSidebarSelection(ids: [pid])
                    state.editingId = pid
                }
                Button("New Folder in Folder") {
                    let fid = state.store.addFolder(name: "", parent: id)
                    state.editingId = fid
                }
                Divider()
                if row.dim {
                    Button("Mark Active") { state.store.setFolderStatus(id: id, status: .active) }
                } else {
                    Button("Drop Folder") { state.store.setFolderStatus(id: id, status: .dropped) }
                }
                Button("Delete Folder", role: .destructive) { state.store.deleteItems(ids: [id]) }
            }
            if row.kind == .tag {
                Button("New Child Tag") {
                    let tid = state.store.addTag(name: "", parent: id)
                    state.store.setSidebarExpanded(key: id, expanded: true)
                    state.editingId = tid
                }
                Divider()
                Button("Active") { state.store.setTagStatus(id: id, status: .active) }
                Button("On Hold") { state.store.setTagStatus(id: id, status: .onHold) }
                Button("Dropped") { state.store.setTagStatus(id: id, status: .dropped) }
                Divider()
                let tag = state.store.tag(id: id)
                Button(tag?.allowsNextAction == true ? "Disallow Next Action" : "Allow Next Action") {
                    state.store.setTagAllowsNextAction(id: id, v: !(tag?.allowsNextAction ?? false))
                }
                Divider()
                Button("Delete Tag", role: .destructive) { state.store.deleteItems(ids: [id]) }
            }
        }
    }
}

// MARK: - Forecast sidebar: Past / calendar grid / Future

struct ForecastSidebar: View {
    @EnvironmentObject var state: AppState

    var body: some View {
        if let fm = state.sidebar.forecast {
            let selected = state.sidebar.forecastSelectedDay
            let past = fm.days.first!
            let future = fm.days.last!
            VStack(spacing: 8) {
                blockButton(day: past, selected: selected == "past", overdue: past.count > 0)
                calendarGrid(fm: fm, selected: selected)
                blockButton(day: future, selected: selected == "future", overdue: false)
            }
            .padding(8)
        }
    }

    func blockButton(day: ForecastDay, selected: Bool, overdue: Bool) -> some View {
        Button { select(day.key) } label: {
            HStack {
                Text(day.label).font(.headline)
                Spacer()
                Text("\(day.count)")
                    .font(.headline)
                    .foregroundStyle(overdue ? Color.ofOverdue : .primary)
            }
            .padding(10)
            .background(selected ? Color.ofSelect : Color.clear, in: RoundedRectangle(cornerRadius: 8))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    func select(_ key: String) {
        state.store.setForecastSelectedDay(day: state.sidebar.forecastSelectedDay == key ? nil : key)
    }

    func calendarGrid(fm: ForecastModel, selected: String?) -> some View {
        let settings = state.settings
        let today = hfStartOfDay(ms: hfNow())
        let weekStart = Int(settings.weekStartsOn) // 0 = Sunday
        let dow = (Int(hfWeekdayIndex(ms: today)) - weekStart + 7) % 7
        let gridStart = hfAddDays(ms: today, n: Int64(-dow))
        let cells = (0 ..< 35).map { hfAddDays(ms: gridStart, n: Int64($0)) }
        let wd = weekStart == 1 ? ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] : ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"]

        return VStack(spacing: 4) {
            HStack(spacing: 0) {
                ForEach(wd, id: \.self) { w in
                    Text(w).font(.system(size: 8, weight: .semibold)).foregroundStyle(.secondary).frame(maxWidth: .infinity)
                }
            }
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 0), count: 7), spacing: 4) {
                ForEach(cells, id: \.self) { t in
                    let k = hfDayKey(ms: t)
                    let isToday = t == today
                    let isPast = t < today
                    let n = countFor(t, fm: fm, today: today)
                    VStack(spacing: 1) {
                        Text(labelFor(t, isToday: isToday))
                            .font(.system(size: 10, weight: isToday ? .bold : .regular))
                        if n > 0 {
                            Text("\(n)")
                                .font(.system(size: 8, weight: .semibold))
                                .foregroundStyle(.white)
                                .padding(.horizontal, 4)
                                .background(isToday && fm.days.first!.count > 0 ? Color.ofOverdue : Color.ofText3, in: Capsule())
                        } else {
                            Text(" ").font(.system(size: 8))
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 3)
                    .background(selected == k ? Color.ofSelect : Color.clear, in: RoundedRectangle(cornerRadius: 6))
                    .foregroundStyle(isPast ? Color.ofText3 : .primary)
                    .contentShape(Rectangle())
                    .onTapGesture { if !isPast { select(k) } }
                }
            }
        }
        .padding(6)
        .background(Color.primary.opacity(0.03), in: RoundedRectangle(cornerRadius: 8))
    }

    func labelFor(_ t: Int64, isToday: Bool) -> String {
        if hfDayOfMonth(ms: t) == 1 { return hfMonthShort(ms: t) }
        if isToday { return "Today" }
        return "\(hfDayOfMonth(ms: t))"
    }

    func countFor(_ t: Int64, fm: ForecastModel, today: Int64) -> Int {
        if t < today { return 0 }
        let k = hfDayKey(ms: t)
        if let day = fm.days.first(where: { $0.key == k }) { return Int(day.count) }
        // beyond 14 days: count items in the future bucket dated exactly that day
        return fm.items["future"]?.filter { item in
            guard let d = itemDate(item) else { return false }
            return hfDayKey(ms: d) == k
        }.count ?? 0
    }

    func itemDate(_ item: ForecastItem) -> Int64? {
        switch item {
        case .task(let i): return i.effectiveDueDate ?? i.effectivePlannedDate
        case .project(let i): return i.project.dueDate ?? i.project.plannedDate
        }
    }
}

// MARK: - Inline rename field

struct InlineRename: View {
    let initial: String
    let placeholder: String
    let onCommit: (String?) -> Void
    @State private var text: String = ""
    @FocusState private var focused: Bool

    var body: some View {
        TextField(placeholder, text: $text)
            .textFieldStyle(.plain)
            .focused($focused)
            .onAppear {
                text = initial
                // Defer so the field is in the settled view hierarchy before
                // claiming focus (direct assignment in onAppear gets dropped
                // when the row is created in the same update).
                DispatchQueue.main.async { focused = true }
            }
            .onSubmit { onCommit(text) }
            #if os(macOS)
            .onExitCommand { onCommit(nil) }
            #endif
            .onChange(of: focused) { _, f in if !f { onCommit(text) } }
    }
}

extension Color {
    static let ofSelect = Color(red: 0xdc / 255, green: 0xdc / 255, blue: 0xdf / 255).opacity(0.6)
}
