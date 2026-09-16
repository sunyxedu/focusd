import SwiftUI
import HemlixFocusCore
import UniformTypeIdentifiers

// MARK: - Quick Entry

struct QuickEntryView: View {
    @EnvironmentObject var state: AppState
    @Environment(\.dismiss) private var dismiss

    @State private var name = ""
    @State private var note = ""
    @State private var project: String? = nil
    @State private var tagIds: [String] = []
    @State private var flagged = false
    @State private var deferDate: Int64? = nil
    @State private var plannedDate: Int64? = nil
    @State private var dueDate: Int64? = nil
    @State private var estimate: UInt32? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Quick Entry").font(.headline)
            TextField("New Action", text: $name)
                .textFieldStyle(.plain)
                .font(.title3.weight(.semibold))
            TextEditor(text: $note)
                .font(.caption)
                .frame(height: 44)
                .scrollContentBackground(.hidden)
                .overlay(alignment: .topLeading) {
                    if note.isEmpty { Text("Note").font(.caption).foregroundStyle(Color.ofText3).allowsHitTesting(false) }
                }
            Divider()
            Group {
                LabeledContent("Project") { ProjectPicker(selected: project) { project = $0 } }
                LabeledContent("Tags") { TagPicker(selected: tagIds) { tagIds = $0 } }
                LabeledContent("Flag") { Toggle("", isOn: $flagged).labelsHidden() }
                LabeledContent("Defer Until") { DateInspectorField(label: "", date: deferDate) { deferDate = $0 } }
                LabeledContent("Planned") { DateInspectorField(label: "", date: plannedDate) { plannedDate = $0 } }
                LabeledContent("Due") { DateInspectorField(label: "", date: dueDate) { dueDate = $0 } }
                LabeledContent("Estimate") { EstimateField(minutes: estimate) { estimate = $0 } }
            }
            .labelsHidden()
            Divider()
            HStack {
                Button("Cancel") { dismiss() }
                    .keyboardShortcut(.cancelAction)
                Spacer()
                Button("Save") { save() }
                    .keyboardShortcut(.defaultAction)
                    .buttonStyle(.borderedProminent)
                    .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty)
            }
        }
        .padding(16)
        .frame(width: 420)
        #if os(iOS)
        .presentationDetents([.medium, .large])
        #endif
    }

    func save() {
        _ = state.store.addTask(spec: NewTaskSpec(
            name: name, note: note, parent: nil, after: nil, project: project,
            tagIds: tagIds, flagged: flagged, deferDate: deferDate, plannedDate: plannedDate,
            dueDate: dueDate, estimatedMinutes: estimate, repetition: nil))
        dismiss()
    }
}

// MARK: - Quick Open

struct QuickOpenView: View {
    @EnvironmentObject var state: AppState
    @Environment(\.dismiss) private var dismiss
    @State private var query = ""

    var body: some View {
        VStack(spacing: 0) {
            TextField("Go to perspective, folder, project, or tag…", text: $query)
                .textFieldStyle(.plain)
                .font(.title3)
                .padding(12)
            Divider()
            ScrollView {
                LazyVStack(spacing: 0) {
                    ForEach(filteredPerspectives, id: \.self) { p in
                        resultRow(icon: p.systemImage, color: p.color, title: p.title, sub: "Perspective") {
                            state.setPerspective(p)
                        }
                    }
                    ForEach(results, id: \.id) { r in
                        resultRow(icon: iconFor(r), color: colorFor(r), title: r.name.isEmpty ? "Untitled" : r.name, sub: r.sub) {
                            navigate(r)
                        }
                    }
                }
            }
        }
        .frame(width: 440, height: 380)
        #if os(iOS)
        .presentationDetents([.medium, .large])
        #endif
    }

    var filteredPerspectives: [Perspective] {
        let q = query.lowercased()
        return Perspective.ordered.filter { q.isEmpty || $0.title.lowercased().contains(q) }
    }

    var results: [SearchResult] { state.store.searchItems(q: query) }

    func iconFor(_ r: SearchResult) -> String {
        switch r.kind {
        case .folder: return "folder"
        case .project: return "list.bullet"
        case .tag: return "tag"
        }
    }
    func colorFor(_ r: SearchResult) -> Color {
        switch r.kind {
        case .folder: return .ofText2
        case .project: return .ofProjects
        case .tag: return .ofTags
        }
    }

    func resultRow(icon: String, color: Color, title: String, sub: String, action: @escaping () -> Void) -> some View {
        Button {
            action()
            dismiss()
        } label: {
            HStack(spacing: 10) {
                Image(systemName: icon).foregroundStyle(color).frame(width: 20)
                Text(title).foregroundStyle(.primary)
                Spacer()
                Text(sub).font(.caption).foregroundStyle(.secondary)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 7)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    func navigate(_ r: SearchResult) {
        switch r.kind {
        case .folder, .project:
            state.setPerspective(.projects)
            state.store.setSidebarSelection(ids: [r.id])
        case .tag:
            state.setPerspective(.tags)
            state.store.setSidebarSelection(ids: [r.id])
        }
    }
}

// MARK: - View Options (the "eye" popover)

struct ViewOptionsView: View {
    @EnvironmentObject var state: AppState

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("View Options").font(.headline)
            Picker("Availability", selection: binding(\.availability)) {
                Text("First Available").tag(Availability.firstAvailable)
                Text("Available").tag(Availability.available)
                Text("Remaining").tag(Availability.remaining)
                Text("Everything").tag(Availability.everything)
            }
            switch state.perspective {
            case .projects:
                Toggle("Show Inbox", isOn: binding(\.showInbox))
                Toggle("Show Folders in Outline", isOn: binding(\.showFoldersInOutline))
            case .tags:
                Toggle("Sort by Due and Flagged", isOn: binding(\.sortByDueAndFlagged))
            case .forecast:
                Toggle("Include Planned Items", isOn: binding(\.forecastIncludePlanned))
                Toggle("Include Deferred Items", isOn: binding(\.forecastIncludeDeferred))
                Toggle("Today Shows Flagged", isOn: binding(\.forecastTodayFlagged))
            case .review:
                Toggle("Hide Blocked Projects", isOn: binding(\.reviewHideBlocked))
                Toggle("Sort by Next Review", isOn: binding(\.reviewSortByNextReview))
            case .flagged:
                Picker("Group By", selection: binding(\.flaggedGroupBy)) {
                    Text("Ungrouped").tag(FlaggedGrouping.ungrouped)
                    Text("Project").tag(FlaggedGrouping.project)
                    Text("Tag").tag(FlaggedGrouping.tag)
                    Text("Due Date").tag(FlaggedGrouping.due)
                    Text("Defer Date").tag(FlaggedGrouping.defer)
                }
            default:
                EmptyView()
            }
        }
        .padding(14)
        .frame(width: 280)
        .presentationCompactAdaptation(.popover)
    }

    func binding<T: Equatable>(_ kp: WritableKeyPath<HemlixFocusCore.ViewOptions, T>) -> Binding<T> {
        Binding(
            get: { state.store.viewOptions()[keyPath: kp] },
            set: { v in
                var vo = state.store.viewOptions()
                vo[keyPath: kp] = v
                state.store.setViewOptions(vo: vo)
            })
    }
}

// MARK: - Settings

struct SettingsView: View {
    @EnvironmentObject var state: AppState
    @Environment(\.dismiss) private var dismiss
    @State private var importing = false
    @State private var exporting = false

    var body: some View {
        let s = state.settings
        Form {
            Section("Dates") {
                Stepper("“Due Soon” means within \(s.dueSoonHours) hours", value: settingsBinding(\.dueSoonHours, range: 1 ... 168))
                Stepper("Default due time: \(s.defaultDueHour):00", value: settingsBinding(\.defaultDueHour, range: 0 ... 23))
                Stepper("Default defer time: \(s.defaultDeferHour):00", value: settingsBinding(\.defaultDeferHour, range: 0 ... 23))
                Picker("Week starts on", selection: Binding(get: { s.weekStartsOn }, set: { var n = s; n.weekStartsOn = $0; state.store.updateSettings(s: n) })) {
                    Text("Sunday").tag(UInt32(0))
                    Text("Monday").tag(UInt32(1))
                }
            }
            Section("Badges") {
                Toggle("Show badges on perspectives", isOn: Binding(get: { s.showBadges }, set: { var n = s; n.showBadges = $0; state.store.updateSettings(s: n) }))
            }
            Section("Database") {
                Button("Export as JSON…") { exporting = true }
                Button("Import JSON…") { importing = true }
                Divider()
                Button("Reset to Tutorial Database") { state.store.resetToTutorial() }
                Button("Delete All Data", role: .destructive) { state.store.resetEmpty() }
            }
        }
        .formStyle(.grouped)
        .padding()
        #if os(macOS)
        .frame(width: 460, height: 420)
        .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        #else
        .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        #endif
        .fileExporter(isPresented: $exporting, document: JSONDocument(text: state.store.exportJson()), contentType: .json, defaultFilename: "HemlixFocus.json") { _ in }
        .fileImporter(isPresented: $importing, allowedContentTypes: [.json]) { result in
            if case .success(let url) = result, url.startAccessingSecurityScopedResource() {
                defer { url.stopAccessingSecurityScopedResource() }
                if let text = try? String(contentsOf: url, encoding: .utf8) {
                    try? state.store.importJson(text: text)
                }
            }
        }
    }

    func settingsBinding(_ kp: WritableKeyPath<HemlixFocusCore.Settings, UInt32>, range: ClosedRange<Int>) -> Binding<Int> {
        Binding(
            get: { Int(state.settings[keyPath: kp]) },
            set: { v in
                var s = state.settings
                s[keyPath: kp] = UInt32(clamping: v)
                state.store.updateSettings(s: s)
            })
    }
}

struct JSONDocument: FileDocument {
    static var readableContentTypes: [UTType] { [.json] }
    var text: String
    init(text: String) { self.text = text }
    init(configuration: ReadConfiguration) throws {
        text = String(data: configuration.file.regularFileContents ?? Data(), encoding: .utf8) ?? ""
    }
    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
        FileWrapper(regularFileWithContents: Data(text.utf8))
    }
}
