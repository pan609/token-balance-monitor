import AppIntents

enum QuotaWidgetDisplay: String, AppEnum, Sendable {
    case primary
    case codex
    case claude

    static let typeDisplayRepresentation = TypeDisplayRepresentation(name: "Quota Service")

    static let caseDisplayRepresentations: [QuotaWidgetDisplay: DisplayRepresentation] = [
        .primary: "Focused",
        .codex: "Codex",
        .claude: "Claude"
    ]

    var serviceId: String? {
        switch self {
        case .primary:
            return nil
        case .codex:
            return "codex"
        case .claude:
            return "claude"
        }
    }

    var title: String {
        switch self {
        case .primary:
            return QuotaL10n.text("重点关注", "Focused")
        case .codex:
            return "Codex"
        case .claude:
            return "Claude"
        }
    }
}

struct QuotaWidgetConfigurationIntent: WidgetConfigurationIntent {
    static let title: LocalizedStringResource = "Choose Quota"
    static let description = IntentDescription("Choose which subscription quota the widget shows first.")

    @Parameter(title: "Display", default: .primary)
    var display: QuotaWidgetDisplay

    static var parameterSummary: some ParameterSummary {
        Summary("Display \(\.$display)")
    }
}
