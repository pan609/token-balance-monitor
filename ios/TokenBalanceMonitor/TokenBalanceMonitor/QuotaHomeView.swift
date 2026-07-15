import SwiftUI

struct QuotaHomeView: View {
    @StateObject private var store = QuotaStore()
    @AppStorage("quota.focusServiceId") private var focusedServiceId = "codex"

    var body: some View {
        NavigationStack {
            content
                .navigationTitle(QuotaL10n.text("AI Quota 配置", "AI Quota Setup"))
                .background(Color(.systemGroupedBackground))
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button {
                            Task { await store.refresh(forceLive: true) }
                        } label: {
                            Image(systemName: "arrow.clockwise")
                        }
                        .disabled(store.isRefreshing)
                        .accessibilityLabel(QuotaL10n.text("刷新额度", "Refresh quota"))
                    }
                }
                .task {
                    await store.runAutoRefresh()
                }
        }
    }

    @ViewBuilder
    private var content: some View {
        switch store.state {
        case .idle, .loading:
            QuotaIOSLoadingView()
        case .loaded(let summary):
            QuotaIOSSummaryView(
                summary: summary,
                isRefreshing: store.isRefreshing,
                transientMessage: store.transientMessage,
                focusedServiceId: $focusedServiceId
            ) { serviceId, forceLive in
                Task { await store.refresh(forceLive: forceLive, serviceId: serviceId) }
            }
            .refreshable {
                await store.refresh(forceLive: true)
            }
        case .failed(let message):
            QuotaIOSErrorView(message: message) {
                Task { await store.refresh(forceLive: true) }
            }
        }
    }
}

private struct QuotaIOSSummaryView: View {
    let summary: QuotaSummary
    let isRefreshing: Bool
    let transientMessage: String?
    @Binding var focusedServiceId: String
    let refresh: (_ serviceId: String?, _ forceLive: Bool) -> Void

    private var services: [QuotaService] {
        summary.quotaDisplayServices
    }

    private var focusedService: QuotaService? {
        services.first { $0.serviceId == focusedServiceId }
            ?? summary.primary
            ?? services.first
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                QuotaCompanionCard()

                QuotaHeroCard(service: focusedService, summary: summary, isRefreshing: isRefreshing)

                QuotaFocusPickerCard(
                    services: services,
                    focusedServiceId: $focusedServiceId
                ) { serviceId in
                    refresh(serviceId, true)
                }

                if let service = focusedService {
                    QuotaWindowSection(service: service)
                }

                QuotaRelayCard()

                QuotaServiceSection(
                    services: services,
                    focusedServiceId: $focusedServiceId
                ) { serviceId in
                    refresh(serviceId, true)
                }

                if let transientMessage {
                    Text(transientMessage)
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(.orange)
                        .padding(.horizontal, 4)
                }
            }
            .padding(20)
        }
        .background(Color(.systemGroupedBackground))
        .safeAreaInset(edge: .bottom) {
            Button {
                refresh(nil, true)
            } label: {
                Label(
                    isRefreshing ? QuotaL10n.text("正在刷新额度", "Refreshing quota") : QuotaL10n.text("刷新额度", "Refresh quota"),
                    systemImage: "arrow.clockwise"
                )
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .disabled(isRefreshing)
            .padding(.horizontal, 20)
            .padding(.vertical, 12)
            .background(.regularMaterial)
        }
    }
}

private struct QuotaHeroCard: View {
    let service: QuotaService?
    let summary: QuotaSummary
    let isRefreshing: Bool

    private var primaryWindow: QuotaWindow? {
        service?.window(id: "5h") ?? service?.windows.first
    }

    private var secondaryWindow: QuotaWindow? {
        guard let service else { return nil }
        return service.orderedWindows.first { $0.id != primaryWindow?.id }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 6) {
                    Text(QuotaL10n.text("当前快照", "Current snapshot"))
                        .font(.caption.weight(.semibold))
                        .textCase(.uppercase)
                        .foregroundStyle(.secondary)
                    Text(service?.serviceName ?? "AI Quota")
                        .font(.headline.weight(.semibold))
                        .lineLimit(1)
                    HStack(alignment: .firstTextBaseline, spacing: 6) {
                        Text(primaryWindow?.quotaValueText ?? "--")
                            .font(.system(size: 50, weight: .bold, design: .rounded))
                            .monospacedDigit()
                            .minimumScaleFactor(0.70)
                        Text(primaryWindow.map { QuotaL10n.windowLabel(id: $0.id, fallback: $0.label) } ?? QuotaL10n.text("额度", "Quota"))
                            .font(.title3.weight(.bold))
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                            .minimumScaleFactor(0.7)
                    }
                }

                Spacer()

                QuotaStatusIcon(status: primaryWindow?.status ?? service?.status ?? "unknown")
            }

            QuotaProgressLine(
                label: primaryWindow.map { QuotaL10n.windowLabel(id: $0.id, fallback: $0.label) } ?? QuotaL10n.text("额度", "Quota"),
                value: primaryWindow?.remainingPercent,
                status: primaryWindow?.status ?? "unknown"
            )

            if let weeklyWindow = secondaryWindow {
                QuotaProgressLine(
                    label: "\(QuotaL10n.windowLabel(id: weeklyWindow.id, fallback: weeklyWindow.label)) \(weeklyWindow.remainingPercent.quotaPercentText)",
                    value: weeklyWindow.remainingPercent,
                    status: weeklyWindow.status
                )
            }

            HStack(spacing: 8) {
                Label(isRefreshing ? QuotaL10n.text("正在获取最新额度", "Fetching latest quota") : freshnessText, systemImage: isRefreshing ? "arrow.triangle.2.circlepath" : "checkmark.seal.fill")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(isRefreshing || (service?.isStale ?? false) ? .orange : .green)

                Spacer()

                Text(QuotaL10n.updatedAt(service?.fetchedAt ?? summary.refreshedAt))
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(22)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .fill(QuotaVisuals.tint(for: service).opacity(0.12))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .stroke(QuotaVisuals.tint(for: service).opacity(0.24), lineWidth: 1)
        )
    }

    private var freshnessText: String {
        if service?.isStale ?? false {
            return QuotaL10n.text("数据可能过期", "Data may be stale")
        }
        return service.map { QuotaL10n.status($0.status, fallback: $0.statusLabel) } ?? QuotaL10n.text("额度已同步", "Quota synced")
    }
}

private struct QuotaFocusPickerCard: View {
    let services: [QuotaService]
    @Binding var focusedServiceId: String
    let refresh: (String) -> Void

    private var focusedService: QuotaService? {
        services.first { $0.serviceId == focusedServiceId } ?? services.first
    }

    var body: some View {
        HStack(spacing: 14) {
            QuotaBadge(service: focusedService, size: 44)

            VStack(alignment: .leading, spacing: 4) {
                Text(QuotaL10n.text("Watch 默认服务", "Default Watch service"))
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.secondary)
                Text(focusedService?.serviceName ?? QuotaL10n.text("选择服务", "Choose service"))
                    .font(.headline.weight(.semibold))
                    .lineLimit(1)
                    .minimumScaleFactor(0.78)
            }

            Spacer(minLength: 12)

            Menu {
                ForEach(services) { service in
                    Button {
                        focusedServiceId = service.serviceId
                        refresh(service.serviceId)
                    } label: {
                        Label(
                            service.serviceName,
                            systemImage: service.serviceId == focusedServiceId ? "checkmark.circle.fill" : "circle"
                        )
                    }
                }
            } label: {
                Image(systemName: "chevron.up.chevron.down")
                    .font(.footnote.weight(.bold))
                    .frame(width: 44, height: 36)
                    .background(Color(.tertiarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            }
            .accessibilityLabel(QuotaL10n.text("切换 Watch 默认服务", "Change default Watch service"))
        }
        .padding(16)
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
}

private struct QuotaWindowSection: View {
    let service: QuotaService

    private var windows: [QuotaWindow] {
        let ordered = service.orderedWindows
        if ordered.isEmpty {
            return [
                    .placeholder(id: "5h", label: QuotaL10n.windowLabel(id: "5h")),
                    .placeholder(id: "weekly", label: QuotaL10n.windowLabel(id: "weekly"))
            ]
        }
        return Array(ordered.prefix(2))
    }

    var body: some View {
        HStack(spacing: 12) {
            ForEach(windows) { window in
                QuotaWindowCard(window: window, tint: QuotaVisuals.tint(for: service))
            }
        }
    }
}

private struct QuotaWindowCard: View {
    let window: QuotaWindow
    let tint: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(QuotaL10n.windowLabel(id: window.id, fallback: window.label))
                    .font(.headline.weight(.semibold))
                Spacer()
                Circle()
                    .fill(QuotaVisuals.statusTint(for: window.status))
                    .frame(width: 8, height: 8)
            }

            Text(window.quotaValueText)
                .font(.system(size: 34, weight: .bold, design: .rounded))
                .monospacedDigit()
                .minimumScaleFactor(0.72)

            QuotaProgressLine(label: QuotaL10n.text("剩余", "Remaining"), value: window.remainingPercent, status: window.status)

            Text(resetText)
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(1)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }

    private var resetText: String {
        if let resetsAt = window.resetsAt {
            return QuotaL10n.resetText(resetsAt: resetsAt)
        }
        return QuotaL10n.status(window.status, fallback: window.statusLabel)
    }
}

private struct QuotaRelayCard: View {
    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: "applewatch.radiowaves.left.and.right")
                .font(.headline)
                .frame(width: 34, height: 34)
                .background(Color.cyan.opacity(0.12), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                .foregroundStyle(.cyan)

            VStack(alignment: .leading, spacing: 3) {
                Text(QuotaL10n.text("Watch 中继已内置", "Watch relay is built in"))
                    .font(.subheadline.weight(.semibold))
                Text(QuotaL10n.text("iPhone 负责配置和中继；日常快速查看用 Watch 或 macOS 菜单栏", "iPhone handles setup and relay. Use Apple Watch or the macOS menu bar for quick checks."))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Spacer(minLength: 12)
        }
        .padding(16)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
}

private struct QuotaCompanionCard: View {
    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            Image(systemName: "applewatch.side.right")
                .font(.headline.weight(.semibold))
                .frame(width: 36, height: 36)
                .background(Color.indigo.opacity(0.12), in: RoundedRectangle(cornerRadius: 11, style: .continuous))
                .foregroundStyle(.indigo)

            VStack(alignment: .leading, spacing: 4) {
                Text(QuotaL10n.text("Quota Companion", "Quota Companion"))
                    .font(.subheadline.weight(.semibold))
                Text(QuotaL10n.text("这里用于配置 Watch 默认服务、查看最近快照和数据新鲜度；高频查看请用 Apple Watch 或 macOS 菜单栏。", "Use this companion to choose the Watch default service and inspect snapshot freshness. For frequent checks, use Apple Watch or the macOS menu bar."))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Spacer(minLength: 0)
        }
        .padding(16)
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
}

private struct QuotaServiceSection: View {
    let services: [QuotaService]
    @Binding var focusedServiceId: String
    let refresh: (String) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(QuotaL10n.text("最近快照", "Recent snapshots"))
                    .font(.headline.weight(.semibold))
                Spacer()
                Text(QuotaL10n.itemCount(services.count))
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
            }

            VStack(spacing: 10) {
                ForEach(services) { service in
                    QuotaServiceRow(
                        service: service,
                        isFocused: service.serviceId == focusedServiceId
                    ) {
                        focusedServiceId = service.serviceId
                        refresh(service.serviceId)
                    }
                }
            }
        }
    }
}

private struct QuotaServiceRow: View {
    let service: QuotaService
    let isFocused: Bool
    let setFocused: () -> Void

    private var primaryWindow: QuotaWindow? {
        service.window(id: "5h") ?? service.windows.first
    }

    private var secondaryWindow: QuotaWindow? {
        service.orderedWindows.first { $0.id != primaryWindow?.id }
    }

    var body: some View {
        HStack(spacing: 12) {
            QuotaBadge(service: service, size: 46)

            VStack(alignment: .leading, spacing: 4) {
                Text(service.serviceName)
                    .font(.headline.weight(.semibold))
                    .lineLimit(1)
                Text(QuotaL10n.status(service.status, fallback: service.statusLabel))
                    .font(.subheadline)
                    .foregroundStyle(QuotaVisuals.statusTint(for: service.status))
            }

            Spacer(minLength: 12)

            VStack(alignment: .trailing, spacing: 4) {
                Text(primaryWindow?.quotaValueText ?? "--")
                    .font(.title3.weight(.bold))
                    .monospacedDigit()
                if let secondaryWindow {
                    Text("\(QuotaL10n.windowLabel(id: secondaryWindow.id, fallback: secondaryWindow.label)) \(secondaryWindow.remainingPercent.quotaPercentText)")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(.secondary)
                        .monospacedDigit()
                        .lineLimit(1)
                }
            }

            Button(action: setFocused) {
                Image(systemName: isFocused ? "star.fill" : "star")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(isFocused ? QuotaVisuals.tint(for: service) : .secondary)
                    .frame(width: 34, height: 34)
                    .background((isFocused ? QuotaVisuals.tint(for: service) : Color.secondary).opacity(0.10), in: Circle())
            }
            .buttonStyle(.plain)
            .disabled(isFocused)
            .accessibilityLabel(isFocused ? QuotaL10n.text("当前 Watch 默认服务", "Current default Watch service") : QuotaL10n.text("设为 Watch 默认服务", "Set as default Watch service"))
        }
        .padding(14)
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(alignment: .leading) {
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(QuotaVisuals.statusTint(for: service.status))
                .frame(width: 4)
                .opacity(0.55)
        }
    }
}

private struct QuotaBadge: View {
    let service: QuotaService?
    let size: CGFloat

    var body: some View {
        Text(QuotaVisuals.badgeText(for: service))
            .font(.system(size: size > 44 ? 17 : 15, weight: .heavy, design: .rounded))
            .foregroundStyle(QuotaVisuals.tint(for: service))
            .lineLimit(1)
            .minimumScaleFactor(0.62)
            .frame(width: size, height: size)
            .background(QuotaVisuals.tint(for: service).opacity(0.12), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}

private struct QuotaProgressLine: View {
    let label: String
    let value: Double?
    let status: String

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(label)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                Spacer()
                Text(value.quotaPercentText)
                    .font(.caption.weight(.bold))
                    .monospacedDigit()
            }

            GeometryReader { proxy in
                let clamped = max(0, min(100, value ?? 0))
                ZStack(alignment: .leading) {
                    Capsule()
                        .fill(Color(.tertiarySystemGroupedBackground))
                    Capsule()
                        .fill(QuotaVisuals.statusTint(for: status))
                        .frame(width: max(8, proxy.size.width * clamped / 100))
                }
            }
            .frame(height: 8)
        }
    }
}

private struct QuotaStatusIcon: View {
    let status: String

    var body: some View {
        Image(systemName: iconName)
            .font(.system(size: 30, weight: .semibold))
            .foregroundStyle(QuotaVisuals.statusTint(for: status))
            .frame(width: 46, height: 46)
            .background(QuotaVisuals.statusTint(for: status).opacity(0.12), in: Circle())
    }

    private var iconName: String {
        switch status {
        case "critical":
            return "exclamationmark.triangle.fill"
        case "warning", "stale":
            return "clock.badge.exclamationmark"
        case "ok":
            return "checkmark.circle.fill"
        default:
            return "gauge.with.dots.needle.bottom.50percent"
        }
    }
}

private struct QuotaIOSLoadingView: View {
    var body: some View {
        VStack(spacing: 16) {
            ProgressView()
            Text(QuotaL10n.text("正在读取额度", "Reading quota"))
                .font(.headline)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(.systemGroupedBackground))
    }
}

private struct QuotaIOSErrorView: View {
    let message: String
    let retry: () -> Void

    var body: some View {
        ContentUnavailableView {
            Label(QuotaL10n.text("读取失败", "Read failed"), systemImage: "wifi.exclamationmark")
        } description: {
            Text(message)
        } actions: {
            Button(QuotaL10n.text("重试", "Retry"), action: retry)
                .buttonStyle(.borderedProminent)
        }
    }
}

private enum QuotaVisuals {
    static func badgeText(for service: QuotaService?) -> String {
        guard let service else { return "AI" }
        let key = "\(service.serviceId) \(service.serviceName)".lowercased()
        if key.contains("claude") || key.contains("anthropic") {
            return "Cl"
        }
        if key.contains("codex") || key.contains("openai") {
            return "Cx"
        }
        return String(service.serviceName.prefix(2))
    }

    static func tint(for service: QuotaService?) -> Color {
        guard let service else { return .cyan }
        return tint(forKey: "\(service.serviceId) \(service.serviceName)")
    }

    static func tint(forKey key: String) -> Color {
        let normalized = key.lowercased()
        if normalized.contains("claude") || normalized.contains("anthropic") {
            return .orange
        }
        if normalized.contains("codex") || normalized.contains("openai") {
            return .cyan
        }
        return .indigo
    }

    static func statusTint(for status: String) -> Color {
        switch status {
        case "ok":
            return .green
        case "warning", "stale":
            return .orange
        case "critical":
            return .red
        default:
            return .cyan
        }
    }
}

private extension QuotaService {
    func window(id: String) -> QuotaWindow? {
        windows.first { $0.id == id }
    }

    var orderedWindows: [QuotaWindow] {
        let preferred = ["5h", "weekly"].compactMap { window(id: $0) }
        let rest = windows.filter { window in
            !preferred.contains { $0.id == window.id }
        }
        return preferred + rest
    }
}

private extension QuotaWindow {
    static func placeholder(id: String, label: String) -> QuotaWindow {
        QuotaWindow(
            id: id,
            label: label,
            usedPercent: nil,
            remainingPercent: nil,
            resetsAt: nil,
            usedText: nil,
            remainingText: nil,
            limitText: nil,
            status: "unknown",
            statusLabel: QuotaL10n.text("待同步", "Waiting to sync")
        )
    }

    var quotaValueText: String {
        QuotaL10n.quotaValueText(remainingText: remainingText, remainingPercent: remainingPercent)
    }
}

private extension Optional where Wrapped == Double {
    var quotaPercentText: String {
        guard let value = self else { return "--" }
        return "\(Int(value.rounded()))%"
    }
}

private extension Date {
    var quotaRelativeResetText: String {
        QuotaL10n.relativeResetText(self)
    }
}

#Preview("AI Quota") {
    QuotaHomeView()
}
