import SwiftUI
import HemlixFocusCore

struct ContentView: View {
    @EnvironmentObject var state: AppState
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass

    var body: some View {
        #if os(iOS)
        if horizontalSizeClass == .compact {
            iPhoneHome()
        } else {
            // iPad needs a NavigationStack context for the toolbar to render
            NavigationStack { desktopLayout }
        }
        #else
        desktopLayout
        #endif
    }

    // MARK: - Mac / iPad: Perspectives Bar + Sidebar + Outline + Inspector

    var desktopLayout: some View {
        HStack(spacing: 0) {
            if state.perspectivesBarVisible {
                PerspectivesBarView()
                Divider()
            }
            if state.sidebarVisible, state.perspective != .inbox, state.perspective != .flagged, state.perspective != .nearby {
                SidebarView()
                    .frame(width: 250)
                Divider()
            }
            OutlineView()
                .frame(maxWidth: .infinity)
            if state.inspectorVisible, !state.selection.isEmpty {
                Divider()
                InspectorView()
                    .frame(width: 290)
            }
        }
        .toolbar { toolbarItems }
        .searchable(text: $state.search, placement: .toolbar, prompt: "Search")
        .navigationTitle("")
        .sheet(isPresented: $state.inspectSheet) { InspectorView().environmentObject(state) }
        .popover(isPresented: $state.showViewOptions) { ViewOptionsView().environmentObject(state) }
    }

    @ToolbarContentBuilder var toolbarItems: some ToolbarContent {
        #if os(macOS)
        ToolbarItem(placement: .navigation) {
            HStack(spacing: 4) {
                Button { state.sidebarVisible.toggle() } label: { Image(systemName: "sidebar.left") }
                    .help("Show or hide the Sidebar")
                Button { state.showQuickEntry = true } label: { Image(systemName: "tray.and.arrow.down") }
                    .help("Quick Entry (Control-Option-Space)")
            }
        }
        #endif
        ToolbarItem(placement: .principal) {
            VStack(spacing: 0) {
                Text(state.content.title).font(.headline)
                if !state.content.subtitle.isEmpty {
                    Text(state.content.subtitle).font(.caption).foregroundStyle(.secondary)
                }
            }
        }
        ToolbarItemGroup(placement: .primaryAction) {
            Button { state.newTaskInContext() } label: { Image(systemName: "plus") }
                .help("New Action (Return)")
            if state.perspective == .review {
                Button { markReviewed() } label: { Image(systemName: "checkmark.arrow.trianglehead.counterclockwise") }
                    .help("Mark Reviewed")
            } else {
                Button { state.cleanUp() } label: { Image(systemName: "sparkles") }
                    .help("Clean Up (Command-K)")
            }
            Button { state.showViewOptions = true } label: { Image(systemName: "eye") }
                .help("View Options")
            Button { state.inspectorVisible.toggle() } label: { Image(systemName: "info.circle") }
                .help("Show or hide the Inspector (Command-Option-3)")
        }
    }

    func markReviewed() {
        let ids = state.sidebar.rows.filter { $0.selected }.compactMap { $0.id }
        state.store.markReviewed(ids: ids)
    }

    // MARK: - iPhone home screen

    func iPhoneHome() -> some View {
        NavigationStack {
            List {
                ForEach(Perspective.ordered, id: \.self) { p in
                    NavigationLink {
                        iPhonePerspective(p)
                    } label: {
                        HStack(spacing: 14) {
                            Image(systemName: p.systemImage)
                                .font(.title2)
                                .foregroundStyle(.white)
                                .frame(width: 40, height: 40)
                                .background(p.color, in: RoundedRectangle(cornerRadius: 9))
                            Text(p.title).font(.headline)
                            Spacer()
                            let n = badgeCount(p)
                            if n > 0 {
                                Text("\(n)")
                                    .font(.subheadline.weight(.semibold))
                                    .foregroundStyle(.white)
                                    .padding(.horizontal, 8).padding(.vertical, 2)
                                    .background(Color.ofOverdue, in: Capsule())
                            }
                        }
                        .padding(.vertical, 4)
                    }
                }
            }
            .navigationTitle("HemlixFocus")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button { state.showSettings = true } label: { Image(systemName: "gearshape") }
                }
            }
        }
    }

    func badgeCount(_ p: Perspective) -> UInt32 {
        let b = state.badges
        switch p {
        case .inbox: return b.inbox
        case .forecast: return b.forecast
        case .flagged: return b.flagged
        case .review: return b.review
        default: return 0
        }
    }

    func iPhonePerspective(_ p: Perspective) -> some View {
        OutlineView()
            .navigationTitle(state.content.title)
            .onAppear { state.setPerspective(p) }
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button { state.newTaskInContext() } label: { Image(systemName: "plus") }
                }
                ToolbarItem(placement: .secondaryAction) {
                    Button { state.showViewOptions = true } label: { Image(systemName: "eye") }
                }
                ToolbarItem(placement: .secondaryAction) {
                    Button { state.cleanUp() } label: { Image(systemName: "sparkles") }
                }
            }
            .searchable(text: $state.search, prompt: "Search")
            .sheet(isPresented: $state.inspectSheet) {
                NavigationStack {
                    InspectorView()
                        .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { state.inspectSheet = false } } }
                }
                .environmentObject(state)
            }
            .popover(isPresented: $state.showViewOptions) { ViewOptionsView().environmentObject(state) }
    }
}

// MARK: - Perspectives Bar (left rail, Mac/iPad)

struct PerspectivesBarView: View {
    @EnvironmentObject var state: AppState

    var body: some View {
        VStack(spacing: 4) {
            ForEach(Perspective.ordered, id: \.self) { p in
                Button { state.setPerspective(p) } label: {
                    VStack(spacing: 3) {
                        ZStack(alignment: .topTrailing) {
                            Image(systemName: p.systemImage)
                                .font(.system(size: 19))
                                .foregroundStyle(state.perspective == p ? .white : p.color)
                                .frame(width: 42, height: 34)
                                .background(state.perspective == p ? p.color : .clear, in: RoundedRectangle(cornerRadius: 8))
                            let n = badgeCount(p)
                            if n > 0 {
                                Text("\(n)")
                                    .font(.system(size: 9, weight: .bold))
                                    .foregroundStyle(.white)
                                    .padding(.horizontal, 4).padding(.vertical, 1)
                                    .background(p == .forecast ? Color.ofOverdue : Color.ofText3, in: Capsule())
                                    .offset(x: 6, y: -4)
                            }
                        }
                        Text(p.title)
                            .font(.system(size: 8.5))
                            .foregroundStyle(state.perspective == p ? p.color : .secondary)
                            .lineLimit(1)
                    }
                    .frame(width: 60)
                }
                .buttonStyle(.plain)
                .help("\(p.title) (Command-\((Perspective.ordered.firstIndex(of: p) ?? 0) + 1))")
            }
            Spacer()
            Button { state.showSettings = true } label: {
                Image(systemName: "gearshape").foregroundStyle(.secondary)
            }
            .buttonStyle(.plain)
            .padding(.bottom, 8)
            .help("Settings (Command-,)")
        }
        .padding(.top, 8)
        .frame(width: 64)
        .background(Color(nsColorOrSystem: .barBackground))
    }

    func badgeCount(_ p: Perspective) -> UInt32 {
        let b = state.badges
        switch p {
        case .inbox: return b.inbox
        case .forecast: return b.forecast
        case .flagged: return b.flagged
        case .review: return b.review
        default: return 0
        }
    }
}

// Cross-platform color helper
extension Color {
    init(nsColorOrSystem name: NSOrSystemColor) {
        #if os(macOS)
        switch name {
        case .barBackground: self.init(nsColor: NSColor.windowBackgroundColor)
        }
        #else
        switch name {
        case .barBackground: self.init(uiColor: UIColor.secondarySystemBackground)
        }
        #endif
    }
}

enum NSOrSystemColor { case barBackground }

#if os(macOS)
import AppKit
#else
import UIKit
#endif
