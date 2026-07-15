import SwiftUI
import WidgetKit

struct BalanceEntry: TimelineEntry {
    let date: Date
    let display: BalanceWidgetDisplay
    let summary: MobileSummary?
    let errorMessage: String?
}

struct BalanceTimelineProvider: AppIntentTimelineProvider {
    func placeholder(in context: Context) -> BalanceEntry {
        BalanceEntry(date: Date(), display: .primary, summary: .preview, errorMessage: nil)
    }

    func snapshot(for configuration: BalanceWidgetConfigurationIntent, in context: Context) async -> BalanceEntry {
        BalanceEntry(date: Date(), display: configuration.display, summary: .preview, errorMessage: nil)
    }

    func timeline(for configuration: BalanceWidgetConfigurationIntent, in context: Context) async -> Timeline<BalanceEntry> {
        let entry: BalanceEntry
        do {
            let summary = try await TokenMonitorAPI.fetchSummary()
            entry = BalanceEntry(date: Date(), display: configuration.display, summary: summary, errorMessage: nil)
        } catch {
            entry = BalanceEntry(date: Date(), display: configuration.display, summary: nil, errorMessage: error.localizedDescription)
        }

        return Timeline(
            entries: [entry],
            // WidgetKit owns the final schedule. Apple recommends keeping timeline
            // entries at least about 5 minutes apart, so the widget asks politely
            // instead of pretending it can run every minute in the background.
            policy: .after(Date().addingTimeInterval(15 * 60))
        )
    }
}

struct TokenBalanceWidgetView: View {
    @Environment(\.widgetFamily) private var family

    let entry: BalanceEntry

    var body: some View {
        if let summary = entry.summary {
            WidgetSummaryView(display: entry.display, summary: summary, family: family)
        } else {
            WidgetErrorView(message: entry.errorMessage ?? "读取失败")
        }
    }
}

private struct WidgetSummaryView: View {
    let display: BalanceWidgetDisplay
    let summary: MobileSummary
    let family: WidgetFamily

    var body: some View {
        let selected = selectedBalance
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Label(selected.title, systemImage: selected.isWarning ? "exclamationmark.triangle.fill" : selected.systemImage)
                    .font(.headline)
                    .foregroundStyle(selected.isWarning ? .red : selected.tint)
                Spacer()
                Text(summary.refreshedAt.compactTimeText)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Text(selected.amount?.moneyText(currency: selected.currency) ?? "--")
                .font(.system(size: family == .systemSmall ? 34 : 42, weight: .bold, design: .rounded))
                .monospacedDigit()
                .minimumScaleFactor(0.72)

            if selected.isWarning {
                Text("低于 \(summary.alertThresholdCny.yuanText)")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.red)
            } else if family != .systemSmall && display != .total {
                Text("总余额 \(summary.totalCny?.yuanText ?? "--")")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.secondary)
            } else if family != .systemSmall {
                Text("选择小组件可切换账户")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.secondary)
            }

            if family != .systemSmall {
                HStack(spacing: 8) {
                    ForEach(providerPills.prefix(3)) { provider in
                        ProviderPill(provider: provider)
                    }
                }
            }
        }
        .containerBackground(selected.isWarning ? Color.red.opacity(0.10) : Color(.systemBackground), for: .widget)
    }

    private var selectedBalance: SelectedBalance {
        if display == .primary, let provider = summary.primary {
            return SelectedBalance(
                title: provider.name,
                amount: provider.amount,
                currency: provider.currency,
                isWarning: provider.isBelowMobileAlert,
                tint: tint(for: provider.id),
                systemImage: "star.circle.fill"
            )
        }

        if display == .total {
            return SelectedBalance(
                title: "总余额",
                amount: summary.totalCny,
                currency: "CNY",
                isWarning: summary.primaryIsBelowAlert,
                tint: .teal,
                systemImage: "sum"
            )
        }

        guard let providerId = display.providerId, let provider = summary.providers[providerId] else {
            return SelectedBalance(
                title: display.title,
                amount: nil,
                currency: "CNY",
                isWarning: false,
                tint: .secondary,
                systemImage: "questionmark.circle.fill"
            )
        }

        return SelectedBalance(
            title: provider.name,
            amount: provider.amount,
            currency: provider.currency,
            isWarning: provider.isBelowMobileAlert,
            tint: tint(for: provider.id),
            systemImage: "cloud.fill"
        )
    }

    private var providerPills: [ProviderSummary] {
        let selectedProviderId = display == .primary ? summary.primaryProvider : display.providerId
        guard let providerId = selectedProviderId else {
            return summary.orderedProviders
        }

        guard let selectedIndex = summary.orderedProviders.firstIndex(where: { $0.id == providerId }) else {
            return summary.orderedProviders
        }

        var providers = [summary.orderedProviders[selectedIndex]]
        providers.append(contentsOf: summary.orderedProviders.enumerated().compactMap { index, provider in
            index == selectedIndex ? nil : provider
        })
        return providers
    }

    private func tint(for providerId: String) -> Color {
        switch providerId {
        case "aliyun":
            return .orange
        case "moonshot":
            return .purple
        case "deepseek":
            return .gray
        case "siliconflow":
            return .green
        case "volcengine":
            return .blue
        case "openrouter":
            return .teal
        default:
            return .indigo
        }
    }
}

private struct SelectedBalance {
    let title: String
    let amount: Double?
    let currency: String
    let isWarning: Bool
    let tint: Color
    let systemImage: String
}

private struct ProviderPill: View {
    let provider: ProviderSummary

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(provider.shortName)
                .font(.caption2.weight(.bold))
                .foregroundStyle(.secondary)
            Text(provider.amount?.moneyText(currency: provider.currency) ?? "--")
                .font(.caption.weight(.bold))
                .monospacedDigit()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct WidgetErrorView: View {
    let message: String

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Image(systemName: "wifi.exclamationmark")
                .foregroundStyle(.red)
            Text("余额读取失败")
                .font(.headline)
            Text(message)
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(3)
        }
        .containerBackground(Color(.systemBackground), for: .widget)
    }
}

struct TokenBalanceWidget: Widget {
    let kind = "TokenBalanceWidget"

    var body: some WidgetConfiguration {
        AppIntentConfiguration(
            kind: kind,
            intent: BalanceWidgetConfigurationIntent.self,
            provider: BalanceTimelineProvider()
        ) { entry in
            TokenBalanceWidgetView(entry: entry)
        }
        .configurationDisplayName("AI Balance")
        .description("查看模型平台账户余额。")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

@main
struct TokenBalanceWidgetBundle: WidgetBundle {
    var body: some Widget {
        TokenBalanceWidget()
        QuotaWidget()
    }
}

#Preview(as: .systemSmall) {
    TokenBalanceWidget()
} timeline: {
    BalanceEntry(date: Date(), display: .primary, summary: .preview, errorMessage: nil)
    BalanceEntry(date: Date(), display: .aliyun, summary: .preview, errorMessage: nil)
    BalanceEntry(date: Date(), display: .moonshot, summary: .preview, errorMessage: nil)
    BalanceEntry(date: Date(), display: .deepseek, summary: .preview, errorMessage: nil)
    BalanceEntry(date: Date(), display: .total, summary: .lowBalancePreview, errorMessage: nil)
}
