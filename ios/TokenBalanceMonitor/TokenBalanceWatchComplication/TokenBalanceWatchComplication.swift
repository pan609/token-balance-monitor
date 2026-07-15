import AppIntents
import SwiftUI
import WidgetKit

struct QuotaComplicationConfigurationIntent: WidgetConfigurationIntent {
    static let title: LocalizedStringResource = "AI Quota"
    static let description = IntentDescription("Track AI subscription quota on your watch face.")
}

struct QuotaComplicationEntry: TimelineEntry {
    let date: Date
    let summary: QuotaSummary?
    let errorMessage: String?

    var service: QuotaService? {
        summary?.primary
    }

    var fiveHourWindow: QuotaWindow? {
        service?.window(id: "5h") ?? service?.windows.first
    }

    var weeklyWindow: QuotaWindow? {
        service?.window(id: "weekly")
    }

    var displayName: String {
        service?.serviceName.shortQuotaName ?? "AI"
    }

    var compactName: String {
        displayName.compactQuotaName
    }

    var isStale: Bool {
        if let service {
            return service.isStale
        }
        return summary == nil
    }

    var mainRemainingPercent: Double {
        fiveHourWindow?.remainingPercent ?? 0
    }

    var hasUsableData: Bool {
        summary != nil && fiveHourWindow != nil
    }

    var status: String {
        if errorMessage != nil { return "unknown" }
        return fiveHourWindow?.status ?? service?.status ?? "unknown"
    }
}

struct QuotaComplicationProvider: AppIntentTimelineProvider {
    private let aggressiveRefreshInterval: TimeInterval = 60

    func recommendations() -> [AppIntentRecommendation<QuotaComplicationConfigurationIntent>] {
        [
            AppIntentRecommendation(
                intent: QuotaComplicationConfigurationIntent(),
                description: "AI Quota"
            )
        ]
    }

    func placeholder(in context: Context) -> QuotaComplicationEntry {
        QuotaComplicationEntry(date: Date(), summary: .preview, errorMessage: nil)
    }

    func snapshot(for configuration: QuotaComplicationConfigurationIntent, in context: Context) async -> QuotaComplicationEntry {
        QuotaComplicationEntry(date: Date(), summary: .preview, errorMessage: nil)
    }

    func timeline(for configuration: QuotaComplicationConfigurationIntent, in context: Context) async -> Timeline<QuotaComplicationEntry> {
        let entry: QuotaComplicationEntry
        do {
            let summary = try await QuotaAPI.fetchSummary()
            entry = QuotaComplicationEntry(date: Date(), summary: summary, errorMessage: nil)
        } catch {
            entry = QuotaComplicationEntry(
                date: Date(),
                summary: nil,
                errorMessage: (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
            )
        }

        return Timeline(
            entries: [entry],
            policy: .after(Date().addingTimeInterval(aggressiveRefreshInterval))
        )
    }
}

struct TokenBalanceWatchComplicationEntryView: View {
    @Environment(\.widgetFamily) private var family

    let entry: QuotaComplicationEntry

    var body: some View {
        Group {
            switch family {
            case .accessoryCircular:
                QuotaCircularComplication(entry: entry)
            case .accessoryRectangular:
                QuotaRectangularComplication(entry: entry)
#if os(watchOS)
            case .accessoryCorner:
                QuotaCornerComplication(entry: entry)
#endif
            case .accessoryInline:
                QuotaInlineComplication(entry: entry)
            default:
                QuotaRectangularComplication(entry: entry)
            }
        }
        .widgetURL(URL(string: "token-balance-monitor://quota"))
    }
}

private struct QuotaCircularComplication: View {
    let entry: QuotaComplicationEntry

    var body: some View {
        ZStack {
            Gauge(value: entry.mainRemainingPercent, in: 0...100) {
                Text("5h")
            } currentValueLabel: {
                EmptyView()
            }
            .gaugeStyle(.accessoryCircularCapacity)
            .tint(QuotaComplicationVisuals.tint(for: entry.status))

            VStack(spacing: -1) {
                Text(entry.percentText)
                    .font(.system(size: 14, weight: .bold, design: .rounded))
                    .minimumScaleFactor(0.62)
                    .monospacedDigit()
                Text("5h")
                    .font(.system(size: 8, weight: .semibold, design: .rounded))
                    .foregroundStyle(.secondary)
            }
        }
        .containerBackground(for: .widget) {
            Color.clear
        }
    }
}

private struct QuotaRectangularComplication: View {
    let entry: QuotaComplicationEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .center, spacing: 5) {
                Text(entry.compactName)
                    .font(.system(size: 9, weight: .heavy, design: .rounded))
                    .foregroundStyle(.black.opacity(0.88))
                    .lineLimit(1)
                    .padding(.horizontal, 5)
                    .padding(.vertical, 2)
                    .background(QuotaComplicationVisuals.tint(for: entry.status), in: Capsule())

                Text(entry.displayName)
                    .font(.system(size: 12, weight: .bold, design: .rounded))
                    .lineLimit(1)
                    .minimumScaleFactor(0.72)

                Spacer(minLength: 4)

                Text(entry.compactFooterText)
                    .font(.system(size: 9, weight: .medium, design: .rounded))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }

            HStack(alignment: .bottom, spacing: 7) {
                HStack(alignment: .firstTextBaseline, spacing: 2) {
                    Text(entry.percentText)
                        .font(.system(size: 21, weight: .heavy, design: .rounded))
                        .monospacedDigit()
                        .lineLimit(1)
                        .minimumScaleFactor(0.72)
                    Text("5h")
                        .font(.system(size: 9, weight: .bold, design: .rounded))
                        .foregroundStyle(.secondary)
                }

                VStack(alignment: .leading, spacing: 3) {
                    QuotaRectangularMiniBar(
                        label: "5h",
                        value: entry.fiveHourWindow?.remainingPercent,
                        tint: QuotaComplicationVisuals.tint(for: entry.status)
                    )

                    QuotaRectangularMiniBar(
                        label: QuotaL10n.text("周", "W"),
                        value: entry.weeklyWindow?.remainingPercent,
                        tint: QuotaComplicationVisuals.tint(for: entry.weeklyWindow?.status ?? "unknown")
                    )
                }

                if let weeklyText = entry.weeklyWindow?.remainingPercent.complicationPercentText {
                    Text(weeklyText)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                        .monospacedDigit()
                        .lineLimit(1)
                }
            }
        }
        .padding(.vertical, 1)
        .containerBackground(for: .widget) {
            Color.clear
        }
    }
}

private struct QuotaRectangularMiniBar: View {
    let label: String
    let value: Double?
    let tint: Color

    var body: some View {
        HStack(spacing: 3) {
            Text(label)
                .font(.system(size: 7, weight: .bold, design: .rounded))
                .foregroundStyle(.secondary)
                .frame(width: 12, alignment: .leading)

            GeometryReader { proxy in
                let clamped = max(0, min(100, value ?? 0))
                ZStack(alignment: .leading) {
                    Capsule()
                        .fill(Color.secondary.opacity(0.22))
                    Capsule()
                        .fill(tint)
                        .frame(width: max(3, proxy.size.width * clamped / 100))
                }
            }
            .frame(height: 4)
        }
    }
}

private struct QuotaCornerComplication: View {
    let entry: QuotaComplicationEntry

    var body: some View {
        Gauge(value: entry.mainRemainingPercent, in: 0...100) {
            Text("5h")
        } currentValueLabel: {
            Text(entry.cornerText)
                .font(.system(size: 12, weight: .bold, design: .rounded))
                .minimumScaleFactor(0.72)
                .monospacedDigit()
        }
        .gaugeStyle(.accessoryCircularCapacity)
        .tint(QuotaComplicationVisuals.tint(for: entry.status))
    }
}

private struct QuotaInlineComplication: View {
    let entry: QuotaComplicationEntry

    var body: some View {
        Text("\(entry.compactName) \(entry.percentText)")
            .monospacedDigit()
    }
}

struct TokenBalanceWatchComplication: Widget {
    let kind = "TokenBalanceWatchComplication"

    var body: some WidgetConfiguration {
        AppIntentConfiguration(
            kind: kind,
            intent: QuotaComplicationConfigurationIntent.self,
            provider: QuotaComplicationProvider()
        ) { entry in
            TokenBalanceWatchComplicationEntryView(entry: entry)
        }
        .configurationDisplayName("AI Quota")
        .description(QuotaL10n.text("在表盘上查看 Codex / Claude 的 5 小时与每周剩余额度。", "Track Codex / Claude 5h and weekly quota on your watch face."))
        .supportedFamilies(Self.supportedFamilies)
    }

    private static var supportedFamilies: [WidgetFamily] {
        var families: [WidgetFamily] = [
            .accessoryCircular,
            .accessoryRectangular,
            .accessoryInline
        ]
#if os(watchOS)
        families.append(.accessoryCorner)
#endif
        return families
    }
}

@main
struct TokenBalanceWatchComplicationBundle: WidgetBundle {
    var body: some Widget {
        TokenBalanceWatchComplication()
    }
}

private enum QuotaComplicationVisuals {
    static func tint(for status: String) -> Color {
        switch status {
        case "ok":
            return .green
        case "warning":
            return .orange
        case "critical":
            return .red
        case "stale":
            return .yellow
        default:
            return .cyan
        }
    }
}

private extension QuotaService {
    func window(id: String) -> QuotaWindow? {
        windows.first { $0.id == id }
    }
}

private extension QuotaComplicationEntry {
    var percentText: String {
        guard hasUsableData else { return "--" }
        return fiveHourWindow?.remainingPercent.complicationPercentText ?? "--"
    }

    var cornerText: String {
        guard hasUsableData, let percent = fiveHourWindow?.remainingPercent else { return "--" }
        return "\(Int(percent.rounded()))"
    }

    var footerText: String {
        if errorMessage != nil {
            return QuotaL10n.text("打开 App 刷新", "Open app to refresh")
        }

        if isStale {
            return QuotaL10n.text("数据可能过期", "Data may be stale")
        }

        if let resetsAt = fiveHourWindow?.resetsAt {
            return QuotaL10n.resetText(resetsAt: resetsAt)
        }

        return service?.fetchedAt.complicationClockText ?? QuotaL10n.text("点击打开刷新", "Tap to refresh")
    }

    var compactFooterText: String {
        if errorMessage != nil {
            return QuotaL10n.text("待刷新", "Refresh")
        }

        if isStale {
            return QuotaL10n.text("可能过期", "Stale")
        }

        if let fetchedAt = service?.fetchedAt {
            return fetchedAt.complicationShortClockText
        }

        return QuotaL10n.text("实时", "Live")
    }
}

private extension Optional where Wrapped == Double {
    var complicationPercentText: String {
        guard let value = self else { return "--" }
        return "\(Int(value.rounded()))%"
    }
}

private extension String {
    var shortQuotaName: String {
        if localizedCaseInsensitiveContains("claude") {
            return "Claude"
        }
        if localizedCaseInsensitiveContains("codex") {
            return "Codex"
        }
        return self
    }

    var compactQuotaName: String {
        let name = shortQuotaName
        if name.localizedCaseInsensitiveContains("claude") {
            return "Claude"
        }
        if name.localizedCaseInsensitiveContains("codex") {
            return "Codex"
        }
        if name.count <= 6 {
            return name
        }
        return "AI"
    }
}

private extension Date {
    var complicationShortClockText: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm"
        return formatter.string(from: self)
    }

    var complicationClockText: String {
        QuotaL10n.complicationUpdatedAt(self)
    }

    var complicationRelativeResetText: String {
        QuotaL10n.relativeResetText(self)
    }
}

#Preview(as: .accessoryRectangular) {
    TokenBalanceWatchComplication()
} timeline: {
    QuotaComplicationEntry(date: Date(), summary: .preview, errorMessage: nil)
}
