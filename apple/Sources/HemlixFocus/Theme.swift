import SwiftUI
import HemlixFocusCore

// Palette measured from Focusd.
extension Color {
    static let ofInbox = Color(red: 0x5b / 255, green: 0x62 / 255, blue: 0xc4 / 255)
    static let ofProjects = Color(red: 0x1a / 255, green: 0x86 / 255, blue: 1.0)
    static let ofTags = Color(red: 0x7c / 255, green: 0x3f / 255, blue: 0xc9 / 255)
    static let ofForecast = Color(red: 0xf0 / 255, green: 0x40 / 255, blue: 0x3e / 255)
    static let ofFlagged = Color(red: 0xf5 / 255, green: 0xa1 / 255, blue: 0x1d / 255)
    static let ofNearby = Color(red: 0x34 / 255, green: 0xc7 / 255, blue: 0x59 / 255)
    static let ofReview = Color(red: 0x58 / 255, green: 0x56 / 255, blue: 0xd6 / 255)
    static let ofAccent = Color(red: 0x1a / 255, green: 0x7c / 255, blue: 0xf5 / 255)

    static let ofOverdue = Color(red: 0xe9 / 255, green: 0x44 / 255, blue: 0x3c / 255)
    static let ofDueSoon = Color(red: 0xe8 / 255, green: 0x8e / 255, blue: 0x12 / 255)
    static let ofFlag = Color(red: 1.0, green: 0x95 / 255, blue: 0.0)
    static let ofCompleted = Color(red: 0xb5 / 255, green: 0xb5 / 255, blue: 0xb8 / 255)
    static let ofText2 = Color(red: 0x6e / 255, green: 0x6e / 255, blue: 0x73 / 255)
    static let ofText3 = Color(red: 0xa1 / 255, green: 0xa1 / 255, blue: 0xa6 / 255)
}

extension Perspective {
    var color: Color {
        switch self {
        case .inbox: return .ofInbox
        case .projects: return .ofProjects
        case .tags: return .ofTags
        case .forecast: return .ofForecast
        case .flagged: return .ofFlagged
        case .nearby: return .ofNearby
        case .review: return .ofReview
        }
    }
    var title: String {
        switch self {
        case .inbox: return "Inbox"
        case .projects: return "Projects"
        case .tags: return "Tags"
        case .forecast: return "Forecast"
        case .flagged: return "Flagged"
        case .nearby: return "Nearby"
        case .review: return "Review"
        }
    }
    var systemImage: String {
        switch self {
        case .inbox: return "tray.fill"
        case .projects: return "list.bullet.rectangle.fill"
        case .tags: return "tag.fill"
        case .forecast: return "calendar"
        case .flagged: return "flag.fill"
        case .nearby: return "location.fill"
        case .review: return "arrow.counterclockwise.circle.fill"
        }
    }
    static let ordered: [Perspective] = [.inbox, .projects, .tags, .forecast, .flagged, .nearby, .review]
}

extension DueState {
    var color: Color? {
        switch self {
        case .none: return nil
        case .dueSoon: return .ofDueSoon
        case .overdue: return .ofOverdue
        }
    }
}
