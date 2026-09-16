import SwiftUI
import HemlixFocusCore

// MARK: - Status circle (the check-off control)

struct StatusCircle: View {
    let completed: Bool
    let dropped: Bool
    let flagged: Bool
    let dueState: DueState
    let blocked: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            ZStack {
                Circle()
                    .stroke(borderColor, style: StrokeStyle(lineWidth: 1.5, dash: blocked && !completed ? [2, 2] : []))
                    .frame(width: 17, height: 17)
                if completed {
                    Circle().fill(fillColor).frame(width: 17, height: 17)
                    Image(systemName: "checkmark")
                        .font(.system(size: 9, weight: .bold))
                        .foregroundStyle(.white)
                } else if dropped {
                    Circle().stroke(Color.ofCompleted, lineWidth: 1.5).frame(width: 17, height: 17)
                    Image(systemName: "xmark")
                        .font(.system(size: 8, weight: .bold))
                        .foregroundStyle(Color.ofCompleted)
                        .offset(y: -0.5)
                }
            }
        }
        .buttonStyle(.plain)
        .frame(width: 24, height: 24)
        .contentShape(Rectangle())
    }

    var borderColor: Color {
        if dropped || completed { return flagged ? .ofFlag : .ofCompleted }
        switch dueState {
        case .overdue: return .ofOverdue
        case .dueSoon: return .ofDueSoon
        case .none: return flagged ? .ofFlag : Color.ofText3
        }
    }
    var fillColor: Color { flagged ? .ofFlag : .ofCompleted }
}

// MARK: - Outline

struct OutlineView: View {
    @EnvironmentObject var state: AppState
    @FocusState private var focused: Bool

    var body: some View {
        let model = state.content
        VStack(spacing: 0) {
            ScrollView {
                LazyVStack(spacing: 0, pinnedViews: []) {
                    ForEach(model.rows, id: \.rowKey) { row in
                        rowView(row)
                    }
                    if model.rows.isEmpty {
                        Text(model.emptyMessage)
                            .foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity)
                            .padding(.top, 80)
                    }
                }
                .padding(.vertical, 4)
            }
            .focusable(state.editingId == nil)
            .focused($focused)
            .focusEffectDisabled()
            .onAppear { focused = true }
            .onChange(of: state.editingId) { _, editing in
                // return key focus to the outline when inline editing ends
                if editing == nil { focused = true }
            }
            .onKeyPress(.space) {
                guard state.editingId == nil else { return .ignored }
                state.toggleComplete(); return .handled
            }
            .onKeyPress(.return) {
                guard state.editingId == nil else { return .ignored }
                state.newTaskInContext(); return .handled
            }
            .onKeyPress(.delete) {
                guard state.editingId == nil else { return .ignored }
                state.deleteSelection(); return .handled
            }
            .onKeyPress(keys: ["]", "["], phases: .down) { key in
                if key.modifiers.contains(.command) {
                    if key.key == "]" { state.indentSelection() } else { state.outdentSelection() }
                    return .handled
                }
                return .ignored
            }
            if state.perspective == .review, !state.sidebar.rows.isEmpty {
                reviewBar(model)
            }
        }
        .background(Color(nsColorOrSystem: .contentBackground))
        .onTapGesture { state.clearSelection() }
    }

    @ViewBuilder func rowView(_ row: RowData) -> some View {
        switch row {
        case .header(let h):
            HeaderRowView(h)
        case .folder(let f):
            FolderRowView(f)
        case .project(let p):
            ProjectRowView(p)
        case .task(let t):
            TaskRowView(t)
        }
    }

    func reviewBar(_ model: ContentModel) -> some View {
        let sel = state.sidebar.rows.filter { $0.selected }.compactMap { $0.id }
        let project = sel.first.flatMap { state.store.projectInfo(id: $0) }
        return VStack(spacing: 0) {
            Divider()
            HStack(spacing: 12) {
                if let p = project {
                    let iv = p.project.reviewInterval
                    Text("Review every \(iv.steps > 1 ? "\(iv.steps) " : "")\(ivUnit(iv.unit))\(iv.steps > 1 ? "s" : "")")
                        .font(.caption).foregroundStyle(.secondary)
                    if let last = p.project.lastReviewedAt {
                        Text("Last reviewed \(hfRelativeDateLabel(ms: last))").font(.caption).foregroundStyle(.secondary)
                    }
                    Spacer()
                    Button("Mark Reviewed") { state.store.markReviewed(ids: [p.project.id]) }
                        .buttonStyle(.bordered)
                        .controlSize(.small)
                } else {
                    Spacer()
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
        }
    }

    func ivUnit(_ u: ReviewUnit) -> String {
        switch u {
        case .day: return "day"
        case .week: return "week"
        case .month: return "month"
        case .year: return "year"
        }
    }
}

// MARK: - Rows

private struct HeaderRowView: View {
    @EnvironmentObject var state: AppState
    let row: HeaderRow
    init(_ row: HeaderRow) { self.row = row }

    var body: some View {
        HStack(spacing: 6) {
            Button { state.store.setCollapsed(key: row.key, collapsed: !row.collapsed) } label: {
                Image(systemName: "chevron.right")
                    .font(.system(size: 9, weight: .bold))
                    .foregroundStyle(.secondary)
                    .rotationEffect(.degrees(row.collapsed ? 0 : 90))
            }
            .buttonStyle(.plain)
            Text(row.title).font(.headline).foregroundStyle(headerColor)
            if let sub = row.sub {
                Text(sub).font(.subheadline).foregroundStyle(.secondary)
            }
            Spacer()
            if let n = row.count {
                Text("\(n)").font(.subheadline).foregroundStyle(.secondary)
            }
        }
        .padding(.leading, CGFloat(10 + row.depth * 20))
        .padding(.trailing, 12)
        .frame(height: 30)
        .background(Color.primary.opacity(0.04))
    }

    var headerColor: Color {
        if row.dayKey == "past" { return .ofOverdue }
        if let k = row.dayKey, k == hfDayKey(ms: hfNow()) { return .ofForecast }
        return .primary
    }
}

private struct FolderRowView: View {
    @EnvironmentObject var state: AppState
    let row: FolderRow
    init(_ row: FolderRow) { self.row = row }

    var body: some View {
        HStack(spacing: 6) {
            Button { state.store.setCollapsed(key: row.key, collapsed: !row.collapsed) } label: {
                Image(systemName: "chevron.right")
                    .font(.system(size: 9, weight: .bold))
                    .foregroundStyle(.secondary)
                    .rotationEffect(.degrees(row.collapsed ? 0 : 90))
            }
            .buttonStyle(.plain)
            Image(systemName: "folder").foregroundStyle(Color.ofText2)
            title
            Spacer()
        }
        .padding(.leading, CGFloat(10 + row.depth * 20))
        .padding(.trailing, 12)
        .frame(height: 30)
        .background(Color.primary.opacity(0.04))
    }

    @ViewBuilder var title: some View {
        if state.editingId == row.id {
            InlineRename(initial: row.folder.name, placeholder: "Untitled Folder") { v in
                state.editingId = nil
                if let v { state.store.rename(id: row.id, name: v) }
            }
        } else {
            Text(row.folder.name.isEmpty ? "Untitled Folder" : row.folder.name)
                .font(.headline)
                .foregroundStyle(row.folder.status == .dropped ? Color.ofText3 : .primary)
        }
    }
}

private struct ProjectRowView: View {
    @EnvironmentObject var state: AppState
    let row: ProjectRow
    init(_ row: ProjectRow) { self.row = row }
    @State private var dropTarget = false

    var body: some View {
        HStack(spacing: 4) {
            Button { state.store.setCollapsed(key: row.key, collapsed: !row.collapsed) } label: {
                Image(systemName: "chevron.right")
                    .font(.system(size: 9, weight: .bold))
                    .foregroundStyle(.secondary)
                    .rotationEffect(.degrees(row.collapsed ? 0 : 90))
                    .opacity(hasVisibleChildren ? 1 : 0)
            }
            .buttonStyle(.plain)
            StatusCircle(
                completed: row.info.effectiveStatus == .done,
                dropped: row.info.effectiveStatus == .dropped,
                flagged: row.project.flagged,
                dueState: row.info.dueState,
                blocked: row.info.blocked,
                action: { state.store.toggleComplete(ids: [row.id]) }
            )
            title
            Spacer(minLength: 4)
            details
        }
        .padding(.leading, CGFloat(4 + row.depth * 20))
        .padding(.trailing, 12)
        .padding(.vertical, 4)
        .background(background)
        .contentShape(Rectangle())
        .draggable(row.id)
        .dropDestination(for: String.self) { items, _ in
            state.store.moveTasks(ids: items, parent: row.id, after: nil)
            return true
        } isTargeted: { dropTarget = $0 }
        .onTapGesture(count: 2) {
            state.setPerspective(.projects)
            state.store.setSidebarSelection(ids: [row.id])
        }
        .onTapGesture { selectWithModifiers(state, row.id) }
        .contextMenu { ItemContextMenu(id: row.id) }
    }

    var hasVisibleChildren: Bool { row.info.remainingCount > 0 }

    @ViewBuilder var title: some View {
        if state.editingId == row.id {
            InlineRename(initial: row.project.name, placeholder: "Untitled Project") { v in
                state.editingId = nil
                if let v { state.store.rename(id: row.id, name: v) }
            }
            .font(.body.weight(.semibold))
        } else {
            Text(row.project.name.isEmpty ? "Untitled Project" : row.project.name)
                .font(.body.weight(.semibold))
                .foregroundStyle(titleColor)
                .lineLimit(1)
        }
    }

    var titleColor: Color {
        switch row.info.effectiveStatus {
        case .done, .dropped: return Color.ofText3
        case .onHold: return Color.ofText2
        default: return .primary
        }
    }

    @ViewBuilder var details: some View {
        if row.project.flagged, row.info.effectiveStatus != .done {
            Image(systemName: "flag.fill").font(.system(size: 9)).foregroundStyle(Color.ofFlag)
        }
        if let due = row.project.dueDate, row.info.effectiveStatus != .done {
            Text("Due \(hfRelativeDateLabel(ms: due))")
                .font(.caption)
                .foregroundStyle(row.info.dueState.color ?? Color.ofText2)
        }
        if row.info.remainingCount > 0, row.info.effectiveStatus != .done {
            Text("\(row.info.remainingCount)").font(.caption).foregroundStyle(.secondary)
        }
    }

    var background: Color {
        if dropTarget { return .ofAccent.opacity(0.15) }
        if state.selection.contains(row.id) { return .ofSelect }
        return .clear
    }
}

private struct TaskRowView: View {
    @EnvironmentObject var state: AppState
    let row: TaskRow
    init(_ row: TaskRow) { self.row = row }
    @State private var dropTarget = false

    var body: some View {
        HStack(alignment: .top, spacing: 4) {
            Button { state.store.setCollapsed(key: row.key, collapsed: !row.collapsed) } label: {
                Image(systemName: "chevron.right")
                    .font(.system(size: 9, weight: .bold))
                    .foregroundStyle(.secondary)
                    .rotationEffect(.degrees(row.collapsed ? 0 : 90))
                    .opacity(row.info.hasChildren && !row.flat ? 1 : 0)
            }
            .buttonStyle(.plain)
            .disabled(!row.info.hasChildren || row.flat)
            .padding(.top, 3)

            StatusCircle(
                completed: row.info.effectiveCompleted,
                dropped: row.info.effectiveDropped,
                flagged: row.info.effectiveFlagged,
                dueState: row.info.dueState,
                blocked: (row.info.blocked || row.info.deferred) && !row.info.effectiveCompleted,
                action: { state.store.toggleComplete(ids: [row.id]) }
            )
            .padding(.top, 1)

            VStack(alignment: .leading, spacing: 2) {
                titleLine
                if !detailItems.isEmpty {
                    HStack(spacing: 8) { ForEach(detailItems.indices, id: \.self) { detailItems[$0] } }
                        .font(.caption)
                }
            }
            Spacer(minLength: 4)
        }
        .padding(.leading, CGFloat(4 + row.depth * 20))
        .padding(.trailing, 12)
        .padding(.vertical, 4)
        .background(background)
        .contentShape(Rectangle())
        .draggable(row.id)
        .dropDestination(for: String.self) { items, _ in
            // drop onto a task row = place after it as sibling
            let parent = state.store.task(id: row.id)?.parentId
            state.store.moveTasks(ids: items, parent: parent, after: row.id)
            return true
        } isTargeted: { dropTarget = $0 }
        .onTapGesture { selectWithModifiers(state, row.id) }
        .contextMenu { ItemContextMenu(id: row.id) }
    }

    @ViewBuilder var titleLine: some View {
        HStack(spacing: 5) {
            if state.editingId == row.id {
                InlineRename(initial: row.task.name, placeholder: "New Action") { v in
                    state.editingId = nil
                    if let v { state.store.rename(id: row.id, name: v) }
                }
            } else {
                Text(row.task.name.isEmpty ? "New Action" : row.task.name)
                    .foregroundStyle(titleColor)
                    .lineLimit(2)
                if row.info.isGroup {
                    Image(systemName: "arrow.turn.down.right").font(.system(size: 8)).foregroundStyle(.secondary)
                }
            }
            Spacer(minLength: 2)
            if !row.task.note.isEmpty {
                Image(systemName: "note.text").font(.system(size: 9)).foregroundStyle(.secondary)
            }
            if row.task.repetition != nil {
                Image(systemName: "repeat").font(.system(size: 9)).foregroundStyle(.secondary)
            }
            if row.info.effectiveFlagged, !row.info.effectiveCompleted {
                Image(systemName: "flag.fill").font(.system(size: 9)).foregroundStyle(Color.ofFlag)
            }
        }
    }

    var detailItems: [Text] {
        var out: [Text] = []
        if row.showProject {
            let crumbs = state.store.breadcrumb(id: row.id)
            if let first = crumbs.first {
                out.append(Text(first).foregroundStyle(Color.ofText3))
            } else if row.info.project == nil, state.perspective != .inbox {
                out.append(Text("Inbox").foregroundStyle(Color.ofText3))
            }
        }
        for tid in row.task.tagIds {
            if let t = state.store.tag(id: tid) {
                out.append(Text(t.name).foregroundStyle(Color.ofTags))
            }
        }
        if let deferDate = row.info.effectiveDeferDate, deferDate > hfNow(), !row.info.effectiveCompleted {
            out.append(Text("Defer \(hfRelativeDateLabel(ms: deferDate))").foregroundStyle(Color.ofText2))
        }
        if let due = row.info.effectiveDueDate, !row.info.effectiveCompleted {
            out.append(Text("Due \(hfRelativeDateTimeLabel(ms: due))").foregroundStyle(row.info.dueState.color ?? Color.ofText2))
        } else if let planned = row.info.effectivePlannedDate, !row.info.effectiveCompleted, state.perspective == .forecast {
            out.append(Text("Planned \(hfRelativeDateLabel(ms: planned))").foregroundStyle(Color.ofText2))
        }
        if let est = row.task.estimatedMinutes {
            out.append(Text(hfFormatDuration(minutes: est)).foregroundStyle(Color.ofText3))
        }
        return out
    }

    var titleColor: Color {
        if row.info.effectiveCompleted || row.info.effectiveDropped { return Color.ofText3 }
        if row.info.deferred || row.info.onHold { return Color.ofText2 }
        return .primary
    }

    var background: Color {
        if dropTarget { return .ofAccent.opacity(0.15) }
        if state.selection.contains(row.id) { return .ofSelect }
        return .clear
    }
}

// MARK: - Context menu shared by task/project rows

/// Row tap with macOS multi-selection modifiers (⌘ additive, ⇧ range).
@MainActor
func selectWithModifiers(_ state: AppState, _ id: String) {
    #if os(macOS)
    let flags = NSApp.currentEvent?.modifierFlags ?? []
    if flags.contains(.command) {
        state.select(id, additive: true)
        return
    }
    if flags.contains(.shift) {
        state.select(id, range: true)
        return
    }
    #endif
    state.select(id)
}

struct ItemContextMenu: View {
    @EnvironmentObject var state: AppState
    let id: String

    var body: some View {
        Button("Edit Title") { state.editingId = id }
        Divider()
        Button("Mark Complete") { state.store.toggleComplete(ids: ids) }
        Button("Mark Dropped") { state.store.dropItems(ids: ids) }
        Button("Mark Flagged") { state.store.toggleFlag(ids: ids) }
        Divider()
        Button("Indent") { state.store.indent(ids: ids) }
        Button("Outdent") { state.store.outdent(ids: ids) }
        if state.store.task(id: id) != nil {
            Menu("Move to Project") {
                Button("Inbox") { state.store.assignProject(ids: ids, project: nil) }
                ForEach(state.store.projectList(), id: \.project.id) { entry in
                    Button(entry.project.name) { state.store.assignProject(ids: ids, project: entry.project.id) }
                }
            }
        }
        Divider()
        Button("Inspect") {
            #if os(iOS)
            state.inspectSheet = true
            #else
            state.inspectorVisible = true
            #endif
        }
        Button("Delete", role: .destructive) { state.store.deleteItems(ids: ids); state.selection = [] }
    }

    var ids: [String] { state.selection.contains(id) && !state.selection.isEmpty ? state.selection : [id] }
}

extension Color {
    init(nsColorOrSystem name: ContentBackground) {
        #if os(macOS)
        self.init(nsColor: NSColor.textBackgroundColor)
        #else
        self.init(uiColor: UIColor.systemBackground)
        #endif
    }
}

enum ContentBackground { case contentBackground }
