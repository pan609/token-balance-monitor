import AppIntents

enum BalanceWidgetDisplay: String, AppEnum, Sendable {
    case primary
    case aliyun
    case moonshot
    case deepseek
    case siliconflow
    case volcengine
    case openrouter
    case total

    static let typeDisplayRepresentation = TypeDisplayRepresentation(name: "余额类型")

    static let caseDisplayRepresentations: [BalanceWidgetDisplay: DisplayRepresentation] = [
        .primary: "重点关注",
        .aliyun: "阿里云",
        .moonshot: "Kimi",
        .deepseek: "DeepSeek",
        .siliconflow: "硅基流动",
        .volcengine: "豆包",
        .openrouter: "OpenRouter",
        .total: "总余额"
    ]

    var providerId: String? {
        switch self {
        case .primary:
            return nil
        case .aliyun:
            return "aliyun"
        case .moonshot:
            return "moonshot"
        case .deepseek:
            return "deepseek"
        case .siliconflow:
            return "siliconflow"
        case .volcengine:
            return "volcengine"
        case .openrouter:
            return "openrouter"
        case .total:
            return nil
        }
    }

    var title: String {
        switch self {
        case .primary:
            return "重点关注"
        case .aliyun:
            return "阿里云"
        case .moonshot:
            return "Kimi"
        case .deepseek:
            return "DeepSeek"
        case .siliconflow:
            return "硅基流动"
        case .volcengine:
            return "豆包"
        case .openrouter:
            return "OpenRouter"
        case .total:
            return "总余额"
        }
    }
}

struct BalanceWidgetConfigurationIntent: WidgetConfigurationIntent {
    static let title: LocalizedStringResource = "选择余额"
    static let description = IntentDescription("选择小组件优先显示的账户余额。")

    @Parameter(title: "显示", default: .primary)
    var display: BalanceWidgetDisplay

    static var parameterSummary: some ParameterSummary {
        Summary("显示 \(\.$display)")
    }
}
