import SwiftUI
import WidgetKit

struct QuotaEntry: TimelineEntry {
    let date: Date
    let display: QuotaWidgetDisplay
    let summary: QuotaSummary?
    let errorMessage: String?
}

struct QuotaTimelineProvider: AppIntentTimelineProvider {
    func placeholder(in context: Context) -> QuotaEntry {
        QuotaEntry(date: Date(), display: .primary, summary: .preview, errorMessage: nil)
    }

    func snapshot(for configuration: QuotaWidgetConfigurationIntent, in context: Context) async -> QuotaEntry {
        QuotaEntry(date: Date(), display: configuration.display, summary: .preview, errorMessage: nil)
    }

    func timeline(for configuration: QuotaWidgetConfigurationIntent, in context: Context) async -> Timeline<QuotaEntry> {
        let entry: QuotaEntry
        do {
            let summary = try await QuotaAPI.fetchSummary()
            entry = QuotaEntry(date: Date(), display: configuration.display, summary: summary, errorMessage: nil)
        } catch {
            entry = QuotaEntry(date: Date(), display: configuration.display, summary: nil, errorMessage: error.localizedDescription)
        }

        return Timeline(entries: [entry], policy: .after(Date().addingTimeInterval(15 * 60)))
    }
}

struct QuotaWidgetView: View {
    @Environment(\.widgetFamily) private var family

    let entry: QuotaEntry

    var body: some View {
        if let summary = entry.summary {
            QuotaSummaryWidgetView(display: entry.display, summary: summary, family: family)
        } else {
            QuotaWidgetErrorView(message: entry.errorMessage ?? QuotaL10n.text("读取失败", "Read failed"))
        }
    }
}

private struct QuotaSummaryWidgetView: View {
    let display: QuotaWidgetDisplay
    let summary: QuotaSummary
    let family: WidgetFamily

    var body: some View {
        let service = selectedService
        let primary = primaryWindow(for: service)
        VStack(alignment: .leading, spacing: family == .systemSmall ? 7 : 10) {
            HStack(spacing: 8) {
                ServiceBadge(service: service, isStale: service?.isStale ?? false)
                VStack(alignment: .leading, spacing: 1) {
                    Text(service?.serviceName ?? display.title)
                        .font(.headline.weight(.semibold))
                        .lineLimit(1)
                        .minimumScaleFactor(0.75)
                    Text(statusText(for: service))
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(statusColor(for: service))
                        .lineLimit(1)
                }
                Spacer(minLength: 6)
                Text(service?.fetchedAt.compactTimeText ?? entryTime)
                    .font(.caption2.weight(.medium))
                    .foregroundStyle(.secondary)
            }

            if family == .systemSmall {
                SmallQuotaBody(service: service, window: primary)
            } else {
                MediumQuotaBody(service: service)
            }
        }
        .containerBackground(backgroundColor(for: service), for: .widget)
    }

    private var selectedService: QuotaService? {
        if let serviceId = display.serviceId {
            return summary.services.first { $0.serviceId == serviceId }
        }
        return summary.primary
    }

    private var entryTime: String {
        summary.refreshedAt.compactTimeText
    }

    private func primaryWindow(for service: QuotaService?) -> QuotaWindow? {
        if service?.quotaType == "spend_limit" {
            return service?.windows.first { $0.id == "monthly" } ?? service?.windows.first
        }
        return service?.windows.first { $0.id == "5h" } ?? service?.windows.first
    }

    private func statusText(for service: QuotaService?) -> String {
        guard let service else { return QuotaL10n.text("未配置", "Not configured") }
        if service.isStale { return QuotaL10n.text("可能过期", "Possibly stale") }
        return QuotaL10n.status(service.status, fallback: service.statusLabel)
    }

    private func statusColor(for service: QuotaService?) -> Color {
        guard let service else { return .secondary }
        if service.isStale { return .orange }
        return quotaColor(status: service.status)
    }

    private func backgroundColor(for service: QuotaService?) -> Color {
        guard let service else { return Color(.systemBackground) }
        if service.isStale || service.status == "warning" {
            return Color.orange.opacity(0.12)
        }
        if service.status == "critical" {
            return Color.red.opacity(0.12)
        }
        return Color(.systemBackground)
    }
}

private struct SmallQuotaBody: View {
    let service: QuotaService?
    let window: QuotaWindow?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(window.map { QuotaL10n.windowLabel(id: $0.id, fallback: $0.label) } ?? QuotaL10n.windowLabel(id: "5h"))
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
            HStack(alignment: .firstTextBaseline, spacing: 3) {
                Text(windowValueText(window))
                    .font(.system(size: 34, weight: .heavy, design: .rounded))
                    .monospacedDigit()
                    .minimumScaleFactor(0.72)
                Text(QuotaL10n.text("剩余", "left"))
                    .font(.caption.weight(.bold))
                    .foregroundStyle(.secondary)
            }
            QuotaBar(value: window?.remainingPercent, status: window?.status ?? service?.status ?? "unknown")
            Text(resetText(for: window))
                .font(.caption2.weight(.medium))
                .foregroundStyle(.secondary)
                .lineLimit(1)
        }
    }
}

private struct MediumQuotaBody: View {
    let service: QuotaService?

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                ForEach(windows.prefix(2)) { window in
                    QuotaWindowCard(window: window)
                }
            }
            if let service {
                HStack(spacing: 6) {
                    Image(systemName: service.isStale ? "clock.badge.exclamationmark" : "checkmark.seal.fill")
                        .font(.caption2.weight(.bold))
                    Text(QuotaL10n.localizedKnownText(service.accountLabel ?? service.planLabel ?? service.source))
                        .font(.caption2.weight(.semibold))
                        .lineLimit(1)
                    Spacer(minLength: 6)
                    Text(service.isStale ? QuotaL10n.text("打开 App 刷新", "Open app to refresh") : QuotaL10n.text("最近同步", "Recently synced"))
                        .font(.caption2.weight(.medium))
                        .foregroundStyle(.secondary)
                }
                .foregroundStyle(service.isStale ? .orange : .teal)
            }
        }
    }

    private var windows: [QuotaWindow] {
        guard let service else { return [] }
        let preferred = ["5h", "weekly"]
        let ordered = preferred.compactMap { id in service.windows.first { $0.id == id } }
        let rest = service.windows.filter { window in !preferred.contains(window.id) }
        return ordered + rest
    }
}

private struct QuotaWindowCard: View {
    let window: QuotaWindow

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            Text(QuotaL10n.windowLabel(id: window.id, fallback: window.label))
                .font(.caption.weight(.bold))
                .foregroundStyle(.secondary)
                .lineLimit(1)
            HStack(alignment: .firstTextBaseline, spacing: 2) {
                Text(windowValueText(window))
                    .font(.system(size: 24, weight: .heavy, design: .rounded))
                    .monospacedDigit()
                    .minimumScaleFactor(0.78)
                Text(QuotaL10n.text("剩余", "left"))
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(.secondary)
            }
            QuotaBar(value: window.remainingPercent, status: window.status)
            Text(resetText(for: window))
                .font(.caption2.weight(.medium))
                .foregroundStyle(.secondary)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct ServiceBadge: View {
    let service: QuotaService?
    let isStale: Bool

    var body: some View {
        ZStack(alignment: .bottomTrailing) {
            badgeContent
                .frame(width: 32, height: 32)
                .background(tint.opacity(0.16), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            if isStale {
                Circle()
                    .fill(.orange)
                    .frame(width: 9, height: 9)
                    .overlay(Circle().stroke(Color(.systemBackground), lineWidth: 1.5))
            }
        }
    }

    @ViewBuilder
    private var badgeContent: some View {
        if let assetName {
            Image(assetName)
                .resizable()
                .renderingMode(.original)
                .scaledToFit()
                .padding(7)
        } else {
            Image(systemName: "gauge.with.dots.needle.bottom.50percent")
                .font(.system(size: 16, weight: .heavy))
                .foregroundStyle(tint)
        }
    }

    private var assetName: String? {
        switch service?.serviceId {
        case "codex":
            return "BrandOpenAI"
        case "claude":
            return "BrandClaude"
        default:
            return nil
        }
    }

    private var tint: Color {
        switch service?.serviceId {
        case "codex":
            return .teal
        case "claude":
            return .orange
        default:
            return .indigo
        }
    }
}

private struct QuotaBar: View {
    let value: Double?
    let status: String

    var body: some View {
        GeometryReader { proxy in
            let ratio = max(0, min((value ?? 0) / 100, 1))
            ZStack(alignment: .leading) {
                Capsule().fill(Color.secondary.opacity(0.16))
                Capsule()
                    .fill(quotaColor(status: status))
                    .frame(width: max(8, proxy.size.width * ratio))
            }
        }
        .frame(height: 7)
    }
}

private struct QuotaWidgetErrorView: View {
    let message: String

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Image(systemName: "clock.badge.exclamationmark")
                .foregroundStyle(.orange)
            Text(QuotaL10n.text("额度读取失败", "Quota read failed"))
                .font(.headline)
            Text(message)
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(3)
        }
        .containerBackground(Color(.systemBackground), for: .widget)
    }
}

private func quotaColor(status: String) -> Color {
    switch status {
    case "critical":
        return .red
    case "warning":
        return .orange
    case "ok":
        return .teal
    default:
        return .secondary
    }
}

private func percentText(_ value: Double?) -> String {
    guard let value else { return "--" }
    return "\(Int(value.rounded()))%"
}

private func windowValueText(_ window: QuotaWindow?) -> String {
    QuotaL10n.quotaValueText(remainingText: window?.remainingText, remainingPercent: window?.remainingPercent)
}

private func resetText(for window: QuotaWindow?) -> String {
    QuotaL10n.resetText(resetsAt: window?.resetsAt, fallbackStatus: window?.statusLabel)
}

struct QuotaWidget: Widget {
    let kind = "QuotaWidget"

    var body: some WidgetConfiguration {
        AppIntentConfiguration(
            kind: kind,
            intent: QuotaWidgetConfigurationIntent.self,
            provider: QuotaTimelineProvider()
        ) { entry in
            QuotaWidgetView(entry: entry)
        }
        .configurationDisplayName("AI Quota")
        .description(QuotaL10n.text("查看 Codex / Claude 的 5 小时和每周订阅额度。", "Track Codex / Claude 5h and weekly subscription quota."))
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

#Preview("AI Quota Small", as: .systemSmall) {
    QuotaWidget()
} timeline: {
    QuotaEntry(date: Date(), display: .primary, summary: .preview, errorMessage: nil)
}

#Preview("AI Quota Medium", as: .systemMedium) {
    QuotaWidget()
} timeline: {
    QuotaEntry(date: Date(), display: .primary, summary: .preview, errorMessage: nil)
}
