import SwiftUI
import HemlixFocusCore

@main
struct HemlixFocusApp: App {
    @StateObject private var state = AppState()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(state)
                #if os(macOS)
                .frame(minWidth: 700, minHeight: 420)
                #endif
                .sheet(isPresented: $state.showQuickEntry) { QuickEntryView().environmentObject(state) }
                .sheet(isPresented: $state.showQuickOpen) { QuickOpenView().environmentObject(state) }
                .sheet(isPresented: $state.showSettings) { SettingsView().environmentObject(state) }
                .onReceive(Timer.publish(every: 60, on: .main, in: .common).autoconnect()) { _ in
                    state.store.tick()
                }
                .onChange(of: scenePhase) { _, phase in
                    if phase == .active { state.store.tick() }
                }
        }
        #if os(macOS)
        .windowStyle(.hiddenTitleBar)
        .commands { appCommands }
        #endif
        #if os(macOS)
        Settings {
            SettingsView().environmentObject(state)
        }
        #endif
    }

    #if os(macOS)
    @CommandsBuilder var appCommands: some Commands {
        CommandGroup(replacing: .undoRedo) {
            Button("Undo") { state.undo() }.keyboardShortcut("z")
                .disabled(!state.store.canUndo())
            Button("Redo") { state.redo() }.keyboardShortcut("z", modifiers: [.command, .shift])
                .disabled(!state.store.canRedo())
        }
        CommandGroup(replacing: .newItem) {
            Button("New Action") { state.newTaskInContext() }.keyboardShortcut("n")
            Button("New Project") { state.newProject() }.keyboardShortcut("n", modifiers: [.command, .shift])
            Divider()
            Button("Quick Entry") { state.showQuickEntry = true }.keyboardShortcut(.space, modifiers: [.control, .option])
            Button("Quick Open") { state.showQuickOpen = true }.keyboardShortcut("o")
        }
        CommandMenu("Perspectives") {
            ForEach(Array(Perspective.ordered.enumerated()), id: \.element) { i, p in
                Button(p.title) { state.setPerspective(p) }.keyboardShortcut(KeyEquivalent(Character("\(i + 1)")), modifiers: [.command])
            }
        }
        CommandMenu("Item") {
            // Space / Return / Backspace are handled locally in OutlineView
            // (onKeyPress) so they don't get intercepted while editing text.
            Button("Mark Complete") { state.toggleComplete() }
            Button("Mark Dropped") { state.dropSelection() }.keyboardShortcut(.space, modifiers: [.option])
            Button("Mark Flagged") { state.toggleFlag() }.keyboardShortcut("l", modifiers: [.command, .shift])
            Divider()
            Button("Indent") { state.indentSelection() }.keyboardShortcut("]")
            Button("Outdent") { state.outdentSelection() }.keyboardShortcut("[")
            Divider()
            Button("Delete") { state.deleteSelection() }.keyboardShortcut(.delete, modifiers: [.command])
        }
        CommandGroup(after: .toolbar) {
            Button("Clean Up") { state.cleanUp() }.keyboardShortcut("k")
            Divider()
            Button("Inspector") { state.inspectorVisible.toggle() }.keyboardShortcut("3", modifiers: [.command, .option])
            Button("View Options") { state.showViewOptions = true }
        }
    }
    #endif
}
