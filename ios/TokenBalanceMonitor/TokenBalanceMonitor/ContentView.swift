import SwiftUI

struct ContentView: View {
    @StateObject private var store = BalanceStore()
    @State private var isShowingSettings = false

    var body: some View {
        NavigationStack {
            Group {
                switch store.state {
                case .idle, .loading:
                    LoadingView()
                case .loaded(let summary):
                    SummaryView(
                        summary: summary,
                        isUpdatingPrimaryProvider: store.isUpdatingPrimaryProvider
                    ) {
                        Task { await store.refresh() }
                    } setPrimaryProvider: { providerId in
                        Task { await store.setPrimaryProvider(providerId) }
                    }
                    .refreshable {
                        await store.refresh()
                    }
                case .failed(let message):
                    ErrorView(message: message) {
                        Task { await store.refresh() }
                    }
                }
            }
            .navigationTitle("余额监控")
            .background(Color(.systemGroupedBackground))
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        isShowingSettings = true
                    } label: {
                        Image(systemName: "gearshape")
                    }
                    .accessibilityLabel("设置重点关注")
                    .disabled(store.state == .loading)
                }

                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        Task { await store.refresh() }
                    } label: {
                        Image(systemName: "arrow.clockwise")
                    }
                    .accessibilityLabel("刷新")
                    .disabled(store.state == .loading)
                }
            }
            .task {
                await store.runAutoRefresh()
            }
            .sheet(isPresented: $isShowingSettings) {
                if case .loaded(let summary) = store.state {
                    PrimaryProviderSettingsView(
                        summary: summary,
                        isUpdating: store.isUpdatingPrimaryProvider
                    ) { providerId in
                        Task { await store.setPrimaryProvider(providerId) }
                    }
                    .presentationDetents([.medium, .large])
                } else {
                    SettingsUnavailableView()
                        .presentationDetents([.medium])
                }
            }
            .alert("设置失败", isPresented: updateErrorBinding) {
                Button("好", role: .cancel) {
                    store.primaryUpdateErrorMessage = nil
                }
            } message: {
                Text(store.primaryUpdateErrorMessage ?? "")
            }
        }
    }

    private var updateErrorBinding: Binding<Bool> {
        Binding {
            store.primaryUpdateErrorMessage != nil
        } set: { isPresented in
            if !isPresented {
                store.primaryUpdateErrorMessage = nil
            }
        }
    }
}

private struct SummaryView: View {
    @Environment(\.openURL) private var openURL

    let summary: MobileSummary
    let isUpdatingPrimaryProvider: Bool
    let refresh: () -> Void
    let setPrimaryProvider: (String) -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                PrimaryBalanceCard(summary: summary)
                FocusPickerCard(
                    summary: summary,
                    isUpdating: isUpdatingPrimaryProvider,
                    setPrimaryProvider: setPrimaryProvider
                )
                TotalStrip(summary: summary)
                HourlyUsageStrip(summary: summary)
                DashboardLinkCard {
                    if let url = TokenMonitorAPI.dashboardURL {
                        openURL(url)
                    }
                }
                ProviderSection(
                    summary: summary,
                    isUpdatingPrimaryProvider: isUpdatingPrimaryProvider,
                    setPrimaryProvider: setPrimaryProvider
                )
            }
            .padding(20)
        }
        .background(Color(.systemGroupedBackground))
        .safeAreaInset(edge: .bottom) {
            Button(action: refresh) {
                Label("刷新余额", systemImage: "arrow.clockwise")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .padding(.horizontal, 20)
            .padding(.vertical, 12)
            .background(.regularMaterial)
        }
    }
}

private struct DashboardLinkCard: View {
    let openDashboard: () -> Void

    var body: some View {
        Button(action: openDashboard) {
            HStack(spacing: 14) {
                Image(systemName: "chart.xyaxis.line")
                    .font(.headline)
                    .frame(width: 34, height: 34)
                    .background(Color.indigo.opacity(0.12), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                    .foregroundStyle(.indigo)
                VStack(alignment: .leading, spacing: 3) {
                    Text("查看请求明细")
                        .font(.subheadline.weight(.semibold))
                    Text("项目、模型、功能和单次请求 token")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer(minLength: 12)
                Image(systemName: "arrow.up.right")
                    .font(.headline.weight(.semibold))
                    .foregroundStyle(.secondary)
            }
            .padding(16)
            .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("打开请求明细看板")
    }
}

private struct FocusPickerCard: View {
    let summary: MobileSummary
    let isUpdating: Bool
    let setPrimaryProvider: (String) -> Void

    var body: some View {
        HStack(spacing: 14) {
            Text(ProviderVisuals.badgeText(for: currentProvider))
                .font(.headline.weight(.heavy))
                .foregroundStyle(tint)
                .lineLimit(1)
                .minimumScaleFactor(0.62)
                .frame(width: 44, height: 44)
                .background(tint.opacity(0.12), in: RoundedRectangle(cornerRadius: 14, style: .continuous))

            VStack(alignment: .leading, spacing: 4) {
                Text("重点关注平台")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.secondary)
                Text(currentProvider?.name ?? "选择平台")
                    .font(.headline.weight(.semibold))
                    .lineLimit(1)
                    .minimumScaleFactor(0.78)
            }

            Spacer(minLength: 12)

            Menu {
                ForEach(summary.orderedProviders) { provider in
                    Button {
                        setPrimaryProvider(provider.id)
                    } label: {
                        Label(
                            provider.name,
                            systemImage: provider.id == summary.primaryProvider ? "checkmark.circle.fill" : "circle"
                        )
                    }
                    .disabled(provider.id == summary.primaryProvider || isUpdating)
                }
            } label: {
                HStack(spacing: 8) {
                    if isUpdating {
                        ProgressView()
                            .controlSize(.small)
                    } else {
                        Image(systemName: "chevron.up.chevron.down")
                            .font(.footnote.weight(.bold))
                    }
                }
                .frame(width: 44, height: 36)
                .background(Color(.tertiarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            }
            .disabled(isUpdating)
            .accessibilityLabel("切换重点关注平台")
        }
        .padding(16)
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }

    private var currentProvider: ProviderSummary? {
        summary.primary
    }

    private var tint: Color {
        ProviderVisuals.tint(for: currentProvider?.id ?? summary.primaryProvider)
    }
}

private struct PrimaryBalanceCard: View {
    let summary: MobileSummary

    var body: some View {
        let primary = summary.primary
        let currency = primary?.currency ?? summary.primaryCurrency
        let amount = primary?.amount?.moneyText(currency: currency)
            ?? summary.primaryAmount?.moneyText(currency: currency)
            ?? "--"
        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("重点关注")
                        .font(.caption.weight(.semibold))
                        .textCase(.uppercase)
                        .foregroundStyle(.secondary)
                    Text("\(primary?.name ?? "重点账户") 可用余额")
                        .font(.headline.weight(.semibold))
                        .lineLimit(1)
                        .minimumScaleFactor(0.78)
                    Text(amount)
                        .font(.system(size: 48, weight: .bold, design: .rounded))
                        .monospacedDigit()
                        .minimumScaleFactor(0.72)
                }
                Spacer()
                StatusIcon(isWarning: summary.primaryIsBelowAlert)
            }

            HStack(spacing: 8) {
                Label(
                    summary.primaryIsBelowAlert
                        ? "低于 \(summary.alertThresholdCny.yuanText)"
                        : "余额正常",
                    systemImage: summary.primaryIsBelowAlert ? "bell.badge.fill" : "checkmark.seal.fill"
                )
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(summary.primaryIsBelowAlert ? .red : .green)

                Spacer()

                Text("更新于 \(summary.refreshedAt.compactTimeText)")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(22)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .fill(summary.primaryIsBelowAlert ? Color.red.opacity(0.10) : primaryTint.opacity(0.12))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .stroke(summary.primaryIsBelowAlert ? Color.red.opacity(0.35) : primaryTint.opacity(0.24), lineWidth: 1)
        )
    }

    private var primaryTint: Color {
        ProviderVisuals.tint(for: summary.primaryProvider)
    }
}

private struct TotalStrip: View {
    let summary: MobileSummary

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: "sum")
                .font(.headline)
                .frame(width: 34, height: 34)
                .background(Color.teal.opacity(0.12), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                .foregroundStyle(.teal)
            VStack(alignment: .leading, spacing: 3) {
                Text("CNY 总余额")
                    .font(.subheadline.weight(.semibold))
                Text("外币账户单独显示")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer(minLength: 12)
            Text(summary.totalCny?.yuanText ?? "--")
                .font(.title2.weight(.bold))
                .monospacedDigit()
                .minimumScaleFactor(0.78)
        }
        .padding(16)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
}

private struct HourlyUsageStrip: View {
    let summary: MobileSummary

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: "chart.bar.xaxis")
                .font(.headline)
                .frame(width: 34, height: 34)
                .background(Color.blue.opacity(0.12), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                .foregroundStyle(.blue)
            VStack(alignment: .leading, spacing: 3) {
                Text("近 24h 消耗")
                    .font(.subheadline.weight(.semibold))
                Text(usageSubtitle)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer(minLength: 12)
            Text(usageValue)
                .font(.title2.weight(.bold))
                .monospacedDigit()
                .minimumScaleFactor(0.78)
        }
        .padding(16)
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }

    private var usageSubtitle: String {
        let snapshotCount = summary.usageSnapshotCount ?? 0
        let coverage = summary.usageCoverageMinutes ?? 0
        if snapshotCount < 2 {
            return "等待第二次快照"
        }
        if coverage < 60 {
            return "已采样 \(max(1, coverage)) 分钟"
        }
        return "按余额快照估算"
    }

    private var usageValue: String {
        guard (summary.usageSnapshotCount ?? 0) >= 2 else {
            return "采样中"
        }
        return summary.usage24hCny?.yuanText ?? "采样中"
    }
}

private struct ProviderSection: View {
    let summary: MobileSummary
    let isUpdatingPrimaryProvider: Bool
    let setPrimaryProvider: (String) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("平台余额")
                    .font(.headline.weight(.semibold))
                Spacer()
                Text("\(configuredCount)/\(summary.orderedProviders.count) 已配置")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
            }

            VStack(spacing: 10) {
                ForEach(summary.orderedProviders) { provider in
                    ProviderRow(
                        provider: provider,
                        isPrimary: provider.id == summary.primaryProvider,
                        isUpdatingPrimaryProvider: isUpdatingPrimaryProvider,
                        setPrimaryProvider: setPrimaryProvider
                    )
                }
            }
        }
    }

    private var configuredCount: Int {
        summary.orderedProviders.filter { $0.status != "not_configured" }.count
    }
}

private struct ProviderRow: View {
    let provider: ProviderSummary
    let isPrimary: Bool
    let isUpdatingPrimaryProvider: Bool
    let setPrimaryProvider: (String) -> Void

    var body: some View {
        HStack(spacing: 12) {
            Text(ProviderVisuals.badgeText(for: provider))
                .font(.subheadline.weight(.heavy))
                .foregroundStyle(accentColor)
                .lineLimit(1)
                .minimumScaleFactor(0.62)
                .frame(width: 46, height: 46)
                .background(accentColor.opacity(0.12), in: RoundedRectangle(cornerRadius: 14, style: .continuous))

            VStack(alignment: .leading, spacing: 4) {
                Text(provider.name)
                    .font(.headline.weight(.semibold))
                    .lineLimit(1)
                Text(provider.statusLabel)
                    .font(.subheadline)
                    .foregroundStyle(provider.isBelowMobileAlert ? .red : .secondary)
            }

            Spacer(minLength: 12)

            VStack(alignment: .trailing, spacing: 4) {
                    Text(provider.amount?.moneyText(currency: provider.currency) ?? "--")
                        .font(.title3.weight(.bold))
                        .monospacedDigit()
                        .minimumScaleFactor(0.76)
                if provider.currency.uppercased() != "CNY" {
                    Text(provider.currency.uppercased())
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(.secondary)
                }
            }

            Button {
                setPrimaryProvider(provider.id)
            } label: {
                Image(systemName: isPrimary ? "star.fill" : "star")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(isPrimary ? accentColor : .secondary)
                    .frame(width: 34, height: 34)
                    .background(
                        (isPrimary ? accentColor : Color.secondary).opacity(0.10),
                        in: Circle()
                    )
            }
            .buttonStyle(.plain)
            .disabled(isPrimary || isUpdatingPrimaryProvider)
            .accessibilityLabel(isPrimary ? "当前重点关注平台" : "设为重点关注")
        }
        .padding(14)
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(alignment: .leading) {
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(accentColor)
                .frame(width: 4)
                .opacity(provider.isBelowMobileAlert ? 0.9 : 0.35)
            }
    }

    private var accentColor: Color {
        ProviderVisuals.tint(for: provider.id)
    }
}

private struct PrimaryProviderSettingsView: View {
    @Environment(\.dismiss) private var dismiss

    let summary: MobileSummary
    let isUpdating: Bool
    let setPrimaryProvider: (String) -> Void

    var body: some View {
        NavigationStack {
            List {
                Section {
                    ForEach(summary.orderedProviders) { provider in
                        Button {
                            setPrimaryProvider(provider.id)
                        } label: {
                            HStack(spacing: 12) {
                                Text(ProviderVisuals.badgeText(for: provider))
                                    .font(.subheadline.weight(.heavy))
                                    .foregroundStyle(ProviderVisuals.tint(for: provider.id))
                                    .lineLimit(1)
                                    .minimumScaleFactor(0.62)
                                    .frame(width: 38, height: 38)
                                    .background(
                                        ProviderVisuals.tint(for: provider.id).opacity(0.12),
                                        in: RoundedRectangle(cornerRadius: 12, style: .continuous)
                                    )

                                VStack(alignment: .leading, spacing: 3) {
                                    Text(provider.name)
                                        .font(.headline.weight(.semibold))
                                        .foregroundStyle(.primary)
                                    Text(provider.statusLabel)
                                        .font(.subheadline)
                                        .foregroundStyle(provider.isBelowMobileAlert ? .red : .secondary)
                                }

                                Spacer()

                                if provider.id == summary.primaryProvider {
                                    Image(systemName: "checkmark.circle.fill")
                                        .foregroundStyle(ProviderVisuals.tint(for: provider.id))
                                }
                            }
                        }
                        .disabled(provider.id == summary.primaryProvider || isUpdating)
                    }
                } header: {
                    Text("重点关注平台")
                } footer: {
                    Text("保存后会刷新余额，小组件选择“重点关注”时会同步。")
                }
            }
            .navigationTitle("设置")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("完成") {
                        dismiss()
                    }
                }
            }
            .overlay {
                if isUpdating {
                    ProgressView()
                        .controlSize(.large)
                        .padding(24)
                        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                }
            }
        }
    }
}

private struct SettingsUnavailableView: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ContentUnavailableView {
                Label("先刷新余额", systemImage: "arrow.clockwise")
            } description: {
                Text("读取到平台列表后就能设置重点关注。")
            }
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("完成") {
                        dismiss()
                    }
                }
            }
        }
    }
}

private enum ProviderVisuals {
    static func badgeText(for provider: ProviderSummary?) -> String {
        guard let provider else {
            return "?"
        }

        switch provider.id {
        case "aliyun":
            return "阿"
        case "moonshot":
            return "K"
        case "deepseek":
            return "D"
        case "siliconflow":
            return "硅"
        case "volcengine":
            return "豆"
        case "openrouter":
            return "OR"
        default:
            return String(provider.shortName.prefix(2))
        }
    }

    static func tint(for providerId: String) -> Color {
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

private struct StatusIcon: View {
    let isWarning: Bool

    var body: some View {
        Image(systemName: isWarning ? "exclamationmark.triangle.fill" : "checkmark.circle.fill")
            .font(.system(size: 30, weight: .semibold))
            .foregroundStyle(isWarning ? .red : .green)
            .frame(width: 46, height: 46)
            .background((isWarning ? Color.red : Color.green).opacity(0.12), in: Circle())
    }
}

private struct LoadingView: View {
    var body: some View {
        VStack(spacing: 16) {
            ProgressView()
            Text("正在读取余额")
                .font(.headline)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(.systemGroupedBackground))
    }
}

private struct ErrorView: View {
    let message: String
    let retry: () -> Void

    var body: some View {
        ContentUnavailableView {
            Label("读取失败", systemImage: "wifi.exclamationmark")
        } description: {
            Text(message)
        } actions: {
            Button("重试", action: retry)
                .buttonStyle(.borderedProminent)
        }
    }
}

#Preview("正常") {
    NavigationStack {
        SummaryView(summary: .preview, isUpdatingPrimaryProvider: false) {} setPrimaryProvider: { _ in }
            .navigationTitle("余额监控")
    }
}

#Preview("低余额") {
    NavigationStack {
        SummaryView(summary: .lowBalancePreview, isUpdatingPrimaryProvider: false) {} setPrimaryProvider: { _ in }
            .navigationTitle("余额监控")
    }
}
