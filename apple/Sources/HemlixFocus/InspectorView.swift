import SwiftUI
import HemlixFocusCore

// MARK: - Inspector

struct InspectorView: View {
    @EnvironmentObject var state: AppState

    var body: some View {
        let ids = state.selection
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if ids.isEmpty {
                    Text("No Selection").foregroundStyle(.secondary).frame(maxWidth: .infinity, alignment: .center).padding(.top, 40)
                } else if ids.count > 1 {
                    multiInspector(ids)
                } else if let id = ids.first {
                    singleInspector(id)
                }
            }
            .padding(12)
        }
        .background(Color(nsColorOrSystem: .barBackground))
    }

    @ViewBuilder func singleInspector(_ id: String) -> some View {
        if let task = state.store.task(id: id) {
            TaskInspector(task: task)
        } else if let project = state.store.project(id: id) {
            ProjectInspector(project: project)
        } else if let tag = state.store.tag(id: id) {
            TagInspector(tag: tag)
        } else if let folder = state.store.folder(id: id) {
            FolderInspector(folder: folder)
        }
    }

    @ViewBuilder func multiInspector(_ ids: [String]) -> some View {
        Text("\(ids.count) items selected").font(.headline)
        Button("Mark Complete") { state.store.toggleComplete(ids: ids) }
        Button("Mark Dropped") { state.store.dropItems(ids: ids) }
        Button("Mark Flagged") { state.store.toggleFlag(ids: ids) }
        Button("Delete", role: .destructive) { state.store.deleteItems(ids: ids); state.selection = [] }
        DateInspectorField(label: "Due", date: nil) { newDate in
            for id in ids { applyDate(id: id, field: "due", value: newDate) }
        }
        DateInspectorField(label: "Defer", date: nil) { newDate in
            for id in ids { applyDate(id: id, field: "defer", value: newDate) }
        }
    }

    func applyDate(id: String, field: String, value: Int64?) {
        let t = state.store.task(id: id)
        let p = state.store.project(id: id)
        let deferD = field == "defer" ? value : (t?.deferDate ?? p?.deferDate)
        let planned = field == "planned" ? value : (t?.plannedDate ?? p?.plannedDate)
        let due = field == "due" ? value : (t?.dueDate ?? p?.dueDate)
        state.store.setItemDates(id: id, defer: deferD, planned: planned, due: due)
    }
}

// MARK: - Task inspector

private struct TaskInspector: View {
    @EnvironmentObject var state: AppState
    let task: Task

    var body: some View {
        let info = state.store.taskInfo(id: task.id)
        TitleNoteEditor(id: task.id, name: task.name, note: task.note, namePlaceholder: "New Action")

        FlagToggle(flagged: task.flagged) { state.store.toggleFlag(ids: [task.id]) }

        Group {
            sectionLabel("Status")
            if task.completedAt != nil {
                Label("Completed \(hfRelativeDateLabel(ms: task.completedAt!))", systemImage: "checkmark.circle.fill")
                    .foregroundStyle(.secondary)
                Button("Mark Incomplete") { state.store.toggleComplete(ids: [task.id]) }
            } else if task.droppedAt != nil {
                Label("Dropped", systemImage: "minus.circle").foregroundStyle(.secondary)
                Button("Mark Remaining") { state.store.dropItems(ids: [task.id]) }
            } else {
                HStack {
                    Button("Complete") { state.store.toggleComplete(ids: [task.id]) }
                    Button("Drop") { state.store.dropItems(ids: [task.id]) }
                }
                if let info, info.blocked { Text("Blocked").font(.caption).foregroundStyle(.secondary) }
                if let info, info.deferred { Text("Deferred until \(hfRelativeDateTimeLabel(ms: info.effectiveDeferDate ?? hfNow()))").font(.caption).foregroundStyle(.secondary) }
            }
        }

        Group {
            sectionLabel("Project")
            ProjectPicker(selected: info?.project?.id) { projectId in
                state.store.assignProject(ids: [task.id], project: projectId)
            }
        }

        Group {
            sectionLabel("Tags")
            TagPicker(selected: task.tagIds) { state.store.setItemTags(id: task.id, tagIds: $0) }
        }

        Group {
            sectionLabel("Dates")
            DateInspectorField(label: "Defer Until", date: task.deferDate) { v in
                state.store.setItemDates(id: task.id, defer: v, planned: task.plannedDate, due: task.dueDate)
            }
            DateInspectorField(label: "Planned", date: task.plannedDate) { v in
                state.store.setItemDates(id: task.id, defer: task.deferDate, planned: v, due: task.dueDate)
            }
            DateInspectorField(label: "Due", date: task.dueDate) { v in
                state.store.setItemDates(id: task.id, defer: task.deferDate, planned: task.plannedDate, due: v)
            }
        }

        Group {
            sectionLabel("Repeat")
            RepeatEditor(rule: task.repetition) { state.store.setRepetition(id: task.id, rule: $0) }
        }

        Group {
            sectionLabel("Estimated Duration")
            EstimateField(minutes: task.estimatedMinutes) { state.store.setEstimate(id: task.id, minutes: $0) }
        }

        if info?.isGroup == true {
            Group {
                sectionLabel("Action Group")
                Toggle("Sequential", isOn: Binding(get: { task.sequential }, set: { state.store.setSequential(id: task.id, sequential: $0) }))
                Toggle("Completed by children", isOn: Binding(get: { task.completedByChildren }, set: { state.store.setCompletedByChildren(id: task.id, v: $0) }))
            }
        }

        infoFooter(added: task.createdAt, changed: task.modifiedAt)
    }
}

// MARK: - Project inspector

private struct ProjectInspector: View {
    @EnvironmentObject var state: AppState
    let project: Project

    var body: some View {
        let info = state.store.projectInfo(id: project.id)
        TitleNoteEditor(id: project.id, name: project.name, note: project.note, namePlaceholder: "Untitled Project")

        FlagToggle(flagged: project.flagged) { state.store.toggleFlag(ids: [project.id]) }

        Group {
            sectionLabel("Status")
            Picker("", selection: Binding(get: { project.status }, set: { state.store.setProjectStatus(id: project.id, status: $0) })) {
                Text("Active").tag(ProjectStatus.active)
                Text("On Hold").tag(ProjectStatus.onHold)
                Text("Completed").tag(ProjectStatus.done)
                Text("Dropped").tag(ProjectStatus.dropped)
            }
            .pickerStyle(.segmented)
            .labelsHidden()
        }

        Group {
            sectionLabel("Type")
            Picker("", selection: Binding(get: { project.projectType }, set: { state.store.setProjectType(id: project.id, t: $0) })) {
                Text("Parallel").tag(ProjectType.parallel)
                Text("Sequential").tag(ProjectType.sequential)
                Text("Single Actions").tag(ProjectType.singleActions)
            }
            .pickerStyle(.segmented)
            .labelsHidden()
        }

        Group {
            sectionLabel("Tags")
            TagPicker(selected: project.tagIds) { state.store.setItemTags(id: project.id, tagIds: $0) }
        }

        Group {
            sectionLabel("Dates")
            DateInspectorField(label: "Defer Until", date: project.deferDate) { v in
                state.store.setItemDates(id: project.id, defer: v, planned: project.plannedDate, due: project.dueDate)
            }
            DateInspectorField(label: "Planned", date: project.plannedDate) { v in
                state.store.setItemDates(id: project.id, defer: project.deferDate, planned: v, due: project.dueDate)
            }
            DateInspectorField(label: "Due", date: project.dueDate) { v in
                state.store.setItemDates(id: project.id, defer: project.deferDate, planned: project.plannedDate, due: v)
            }
        }

        Group {
            sectionLabel("Repeat")
            RepeatEditor(rule: project.repetition) { state.store.setRepetition(id: project.id, rule: $0) }
        }

        Group {
            sectionLabel("Estimated Duration")
            EstimateField(minutes: project.estimatedMinutes) { state.store.setEstimate(id: project.id, minutes: $0) }
        }

        Group {
            sectionLabel("Review")
            let iv = project.reviewInterval
            Stepper("Every \(iv.steps) \(ivUnitLabel(iv.unit))\(iv.steps > 1 ? "s" : "")", value: Binding(get: { Int(iv.steps) }, set: { state.store.setReviewInterval(id: project.id, iv: ReviewInterval(steps: UInt32(max(1, $0)), unit: iv.unit)) }), in: 1 ... 999)
            Picker("Unit", selection: Binding(get: { iv.unit }, set: { state.store.setReviewInterval(id: project.id, iv: ReviewInterval(steps: iv.steps, unit: $0)) })) {
                Text("Day").tag(ReviewUnit.day)
                Text("Week").tag(ReviewUnit.week)
                Text("Month").tag(ReviewUnit.month)
                Text("Year").tag(ReviewUnit.year)
            }
            .labelsHidden()
            if let last = project.lastReviewedAt {
                Text("Last reviewed \(hfRelativeDateLabel(ms: last))").font(.caption).foregroundStyle(.secondary)
            }
            if let next = project.nextReviewAt {
                Text("Next review \(hfRelativeDateLabel(ms: next))").font(.caption).foregroundStyle(.secondary)
            }
            Button("Mark Reviewed") { state.store.markReviewed(ids: [project.id]) }
        }

        Toggle("Completed by children", isOn: Binding(get: { project.completedByChildren }, set: { state.store.setCompletedByChildren(id: project.id, v: $0) }))

        if let info {
            Text("\(info.remainingCount) remaining • \(info.availableCount) available").font(.caption).foregroundStyle(.secondary)
        }
        infoFooter(added: project.createdAt, changed: project.modifiedAt)
    }

    func ivUnitLabel(_ u: ReviewUnit) -> String {
        switch u {
        case .day: return "day"
        case .week: return "week"
        case .month: return "month"
        case .year: return "year"
        }
    }
}

// MARK: - Tag / Folder inspectors

private struct TagInspector: View {
    @EnvironmentObject var state: AppState
    let tag: Tag

    var body: some View {
        TitleNoteEditor(id: tag.id, name: tag.name, note: tag.note, namePlaceholder: "Untitled Tag")
        Group {
            sectionLabel("Status")
            Picker("", selection: Binding(get: { tag.status }, set: { state.store.setTagStatus(id: tag.id, status: $0) })) {
                Text("Active").tag(TagStatus.active)
                Text("On Hold").tag(TagStatus.onHold)
                Text("Dropped").tag(TagStatus.dropped)
            }
            .pickerStyle(.segmented)
            .labelsHidden()
        }
        Toggle("Allows next action", isOn: Binding(get: { tag.allowsNextAction }, set: { state.store.setTagAllowsNextAction(id: tag.id, v: $0) }))
        infoFooter(added: tag.createdAt, changed: tag.modifiedAt)
    }
}

private struct FolderInspector: View {
    @EnvironmentObject var state: AppState
    let folder: Folder

    var body: some View {
        TitleNoteEditor(id: folder.id, name: folder.name, note: folder.note, namePlaceholder: "Untitled Folder")
        Toggle("Dropped", isOn: Binding(get: { folder.status == .dropped }, set: { state.store.setFolderStatus(id: folder.id, status: $0 ? .dropped : .active) }))
        infoFooter(added: folder.createdAt, changed: folder.modifiedAt)
    }
}

// MARK: - Shared inspector pieces

func sectionLabel(_ s: String) -> some View {
    Text(s).font(.caption.weight(.semibold)).foregroundStyle(.secondary).textCase(.uppercase)
}

func infoFooter(added: Int64, changed: Int64) -> some View {
    VStack(alignment: .leading, spacing: 2) {
        Text("Added \(hfFullDateLabel(ms: added))")
        Text("Changed \(hfFullDateLabel(ms: changed))")
    }
    .font(.caption2)
    .foregroundStyle(Color.ofText3)
}

struct TitleNoteEditor: View {
    @EnvironmentObject var state: AppState
    let id: String
    let name: String
    let note: String
    let namePlaceholder: String

    var body: some View {
        TextField(namePlaceholder, text: Binding(get: { name }, set: { state.store.rename(id: id, name: $0) }))
            .font(.body.weight(.semibold))
            .textFieldStyle(.plain)
        ZStack(alignment: .topLeading) {
            if note.isEmpty {
                Text("Note").font(.caption).foregroundStyle(Color.ofText3).padding(.top, 1).allowsHitTesting(false)
            }
            TextEditor(text: Binding(get: { note }, set: { state.store.setNote(id: id, note: $0) }))
                .font(.caption)
                .frame(minHeight: 40, maxHeight: 120)
                .scrollContentBackground(.hidden)
        }
    }
}

struct FlagToggle: View {
    let flagged: Bool
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            Label(flagged ? "Flagged" : "Flag", systemImage: flagged ? "flag.fill" : "flag")
                .foregroundStyle(flagged ? Color.ofFlag : .primary)
        }
    }
}

// MARK: - Date field with natural-language entry + quick buttons

struct DateInspectorField: View {
    @EnvironmentObject var state: AppState
    let label: String
    let date: Int64?
    let onSet: (Int64?) -> Void

    @State private var text: String = ""
    @State private var editing = false
    @State private var showPicker = false

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(label).foregroundStyle(.secondary)
                Spacer()
                if let date, !editing {
                    Text(hfFullDateLabel(ms: date))
                }
                Menu {
                    Button("Today") { set(addDays(0)) }
                    Button("Tomorrow") { set(addDays(1)) }
                    Button("+1 Week") { set(addWeeks(1)) }
                    Button("+1 Month") { set(addMonths(1)) }
                    if date != nil {
                        Divider()
                        Button("Clear", role: .destructive) { onSet(nil) }
                    }
                    Divider()
                    Button("Pick Date…") { showPicker = true }
                } label: {
                    Image(systemName: "calendar")
                }
                .menuStyle(.borderlessButton)
                .frame(width: 24)
            }
            TextField("Type a date, e.g. “fri 5pm”", text: $text)
                .textFieldStyle(.roundedBorder)
                .font(.caption)
                .onSubmit { commitText() }
                .onTapGesture { editing = true }
                .onChange(of: text) { _, _ in editing = true }
        }
        .popover(isPresented: $showPicker) {
            VStack {
                DatePicker("", selection: Binding(get: { date.map { Date(timeIntervalSince1970: TimeInterval($0) / 1000) } ?? Date() }, set: { onSet(Int64($0.timeIntervalSince1970 * 1000)) }), displayedComponents: [.date, .hourAndMinute])
                    .labelsHidden()
                Button("Done") { showPicker = false }
            }
            .padding()
        }
    }

    func commitText() {
        let parsed = hfParseDate(input: text, defaultHour: state.settings.defaultDueHour)
        if let parsed { onSet(parsed) }
        text = ""
        editing = false
    }

    func set(_ ms: Int64) { onSet(ms) }

    func addDays(_ n: Int64) -> Int64 {
        let base = date ?? hfStartOfDay(ms: hfNow())
        return hfAddDays(ms: base, n: n)
    }
    func addWeeks(_ n: Int64) -> Int64 { addDays(7 * n) }
    func addMonths(_ n: Int32) -> Int64 {
        // month arithmetic via parse of target is overkill; use Calendar here (UI convenience)
        let d = Date(timeIntervalSince1970: TimeInterval(date ?? hfNow()) / 1000)
        let next = Calendar.current.date(byAdding: .month, value: Int(n), to: d) ?? d
        return Int64(next.timeIntervalSince1970 * 1000)
    }
}

// MARK: - Estimated duration field

struct EstimateField: View {
    let minutes: UInt32?
    let onSet: (UInt32?) -> Void
    @State private var text = ""

    var body: some View {
        HStack {
            TextField("e.g. 30m or 1h", text: $text)
                .textFieldStyle(.roundedBorder)
                .font(.caption)
                .onSubmit {
                    if text.trimmingCharacters(in: .whitespaces).isEmpty { onSet(nil) }
                    else if let m = hfParseDuration(s: text) { onSet(m) }
                    text = ""
                }
            if let minutes {
                Text(hfFormatDuration(minutes: minutes)).foregroundStyle(.secondary)
                Button { onSet(nil) } label: { Image(systemName: "xmark.circle.fill") }.buttonStyle(.plain)
            }
        }
    }
}

// MARK: - Repetition editor

struct RepeatEditor: View {
    let rule: RepetitionRule?
    let onSet: (RepetitionRule?) -> Void
    @State private var showEditor = false

    var body: some View {
        HStack {
            if let rule {
                Text(hfDescribeRepetition(rule: rule)).font(.callout)
                Spacer()
                Button { showEditor = true } label: { Image(systemName: "pencil") }.buttonStyle(.plain)
                Button { onSet(nil) } label: { Image(systemName: "xmark.circle.fill") }.buttonStyle(.plain)
            } else {
                Button("Add Repeat") { showEditor = true }
            }
        }
        .popover(isPresented: $showEditor) {
            RepeatEditorSheet(rule: rule ?? RepetitionRule(every: 1, unit: .week, method: .fixed, weekdays: Data()), onSet: { onSet($0); showEditor = false })
        }
    }
}

struct RepeatEditorSheet: View {
    @State var rule: RepetitionRule
    let onSet: (RepetitionRule) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Picker("Method", selection: $rule.method) {
                Text("Regularly").tag(RepeatMethod.fixed)
                Text("Defer Another").tag(RepeatMethod.startAfterCompletion)
                Text("Due Again").tag(RepeatMethod.dueAfterCompletion)
            }
            HStack {
                Text("Every")
                TextField("N", value: $rule.every, format: .number)
                    .textFieldStyle(.roundedBorder)
                    .frame(width: 60)
                Picker("", selection: $rule.unit) {
                    Text("Days").tag(RepeatUnit.day)
                    Text("Weeks").tag(RepeatUnit.week)
                    Text("Months").tag(RepeatUnit.month)
                    Text("Years").tag(RepeatUnit.year)
                }
                .labelsHidden()
            }
            if rule.unit == .week {
                HStack {
                    ForEach(0 ..< 7, id: \.self) { (d: Int) in
                        let on = rule.weekdays.contains(UInt8(d))
                        Text(["S", "M", "T", "W", "T", "F", "S"][d])
                            .font(.caption.weight(.semibold))
                            .frame(width: 24, height: 24)
                            .background(on ? Color.ofAccent : Color.primary.opacity(0.08), in: Circle())
                            .foregroundStyle(on ? .white : .primary)
                            .onTapGesture {
                                if on { rule.weekdays.removeAll { $0 == UInt8(d) } } else { rule.weekdays.append(UInt8(d)) }
                            }
                    }
                }
            }
            Button("Done") { onSet(rule) }
                .buttonStyle(.borderedProminent)
        }
        .padding()
        .frame(minWidth: 260)
    }
}

// MARK: - Tag picker

struct TagPicker: View {
    @EnvironmentObject var state: AppState
    let selected: [String]
    let onSet: ([String]) -> Void
    @State private var query = ""
    @State private var open = false

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if !selected.isEmpty {
                FlowLayout(spacing: 4) {
                    ForEach(selected, id: \.self) { tid in
                        if let t = state.store.tag(id: tid) {
                            HStack(spacing: 3) {
                                Text(t.name)
                                Button { onSet(selected.filter { $0 != tid }) } label: {
                                    Image(systemName: "xmark").font(.system(size: 8, weight: .bold))
                                }
                            }
                            .font(.caption)
                            .padding(.horizontal, 7).padding(.vertical, 3)
                            .background(Color.ofTags.opacity(0.15), in: Capsule())
                        }
                    }
                }
            }
            Button { open = true } label: { Label(selected.isEmpty ? "Add Tags" : "Edit Tags", systemImage: "tag") }
                .popover(isPresented: $open) { pickerPopover }
        }
    }

    var pickerPopover: some View {
        VStack(spacing: 0) {
            TextField("Search or create tag", text: $query)
                .textFieldStyle(.roundedBorder)
                .padding(8)
            ScrollView {
                LazyVStack(spacing: 0) {
                    ForEach(filtered, id: \.tag.id) { entry in
                        let t = entry.tag
                        let isOn = selected.contains(t.id)
                        Button { toggle(t.id) } label: {
                            HStack {
                                Image(systemName: isOn ? "checkmark.circle.fill" : "circle")
                                    .foregroundStyle(isOn ? Color.ofTags : Color.ofText3)
                                Text(t.name.isEmpty ? "Untitled Tag" : t.name)
                                    .foregroundStyle(entry.effectiveStatus == .active ? .primary : .secondary)
                                Spacer()
                            }
                            .padding(.leading, CGFloat(entry.depth) * 14)
                            .padding(.horizontal, 8).padding(.vertical, 5)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            if !query.isEmpty, !filtered.contains(where: { $0.tag.name.lowercased() == query.lowercased() }) {
                Button { create() } label: {
                    Label("Create “\(query)”", systemImage: "plus")
                        .padding(8)
                }
            }
        }
        .frame(width: 240, height: 280)
    }

    var filtered: [TagListEntry] {
        let all = state.store.tagList()
        if query.isEmpty { return all }
        return all.filter { $0.tag.name.lowercased().contains(query.lowercased()) }
    }

    func toggle(_ id: String) {
        if selected.contains(id) { onSet(selected.filter { $0 != id }) } else { onSet(selected + [id]) }
    }

    func create() {
        let id = state.store.addTag(name: query, parent: nil)
        onSet(selected + [id])
        query = ""
    }
}

// MARK: - Project picker

struct ProjectPicker: View {
    @EnvironmentObject var state: AppState
    let selected: String?
    let onSet: (String?) -> Void

    var body: some View {
        Menu {
            Button("Inbox") { onSet(nil) }
            Divider()
            ForEach(state.store.projectList(), id: \.project.id) { entry in
                Button(entry.project.name.isEmpty ? "Untitled Project" : (entry.folderPath.isEmpty ? entry.project.name : "\(entry.folderPath) : \(entry.project.name)")) {
                    onSet(entry.project.id)
                }
            }
        } label: {
            HStack {
                Text(selectedName)
                Spacer()
                Image(systemName: "chevron.up.chevron.down").font(.caption2).foregroundStyle(.secondary)
            }
            .padding(6)
            .background(Color.primary.opacity(0.05), in: RoundedRectangle(cornerRadius: 6))
        }
        .buttonStyle(.plain)
    }

    var selectedName: String {
        if let selected, let p = state.store.project(id: selected) { return p.name.isEmpty ? "Untitled Project" : p.name }
        return "Inbox"
    }
}

// MARK: - Simple flow layout for tag chips

struct FlowLayout: Layout {
    var spacing: CGFloat = 4

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, rowH: CGFloat = 0
        for v in subviews {
            let s = v.sizeThatFits(.unspecified)
            if x + s.width > width { x = 0; y += rowH + spacing; rowH = 0 }
            x += s.width + spacing
            rowH = max(rowH, s.height)
        }
        return CGSize(width: width, height: y + rowH)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, rowH: CGFloat = 0
        for v in subviews {
            let s = v.sizeThatFits(.unspecified)
            if x + s.width > bounds.maxX { x = bounds.minX; y += rowH + spacing; rowH = 0 }
            v.place(at: CGPoint(x: x, y: y), proposal: .unspecified)
            x += s.width + spacing
            rowH = max(rowH, s.height)
        }
    }
}
