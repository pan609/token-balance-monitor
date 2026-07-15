import SwiftUI

struct WatchContentView: View {
    @Environment(\.scenePhase) private var scenePhase
    @StateObject private var store = WatchBalanceStore()
    private let foregroundRefreshNanoseconds: UInt64 = 15_000_000_000

    var body: some View {
        content
        .task(id: scenePhase) {
            guard scenePhase == .active else { return }
            await store.refresh(forceLive: true)
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: foregroundRefreshNanoseconds)
                guard !Task.isCancelled else { return }
                await store.refresh(forceLive: false)
            }
        }
    }

    @ViewBuilder
    private var content: some View {
        switch store.state {
        case .idle, .loading:
            QuotaLoadingView()
        case .loaded(let summary):
            QuotaSummaryView(
                summary: summary,
                isRefreshing: store.isRefreshing,
                transientMessage: store.transientMessage
            ) { serviceId, forceLive in
                Task { await store.refresh(forceLive: forceLive, serviceId: serviceId) }
            }
        case .failed(let message):
            QuotaErrorView(message: message) {
                Task { await store.refresh(forceLive: true) }
            }
        }
    }
}

private struct QuotaSummaryView: View {
    let summary: QuotaSummary
    let isRefreshing: Bool
    let transientMessage: String?
    let refresh: (_ serviceId: String?, _ forceLive: Bool) -> Void

    @AppStorage("watch.focusServiceId") private var focusedServiceId = "codex"
    @State private var presentedSheet: WatchSheet?

    private var displayServices: [QuotaService] {
        summary.quotaDisplayServices
    }

    private var focusedService: QuotaService? {
        displayServices.first { $0.serviceId == focusedServiceId }
            ?? displayServices.first { $0.serviceId == summary.primaryServiceId }
            ?? displayServices.first
    }

    var body: some View {
        GeometryReader { proxy in
            let compact = proxy.size.height < 220

            VStack(alignment: .leading, spacing: compact ? 5 : 7) {
                QuotaHeader(
                    isRefreshing: isRefreshing,
                    serviceName: focusedService?.serviceName ?? QuotaL10n.text("额度", "Quota"),
                    showSettings: { presentedSheet = .servicePicker },
                    refresh: { refresh(focusedService?.serviceId, true) }
                )

                if let service = focusedService {
                    QuotaFreshnessLine(service: service, summary: summary, isRefreshing: isRefreshing)
                    QuotaServiceStrip(service: service)
                    QuotaWindowGrid(service: service, compact: compact)
                } else {
                    EmptyQuotaCard()
                }

                if let transientMessage {
                    Text(transientMessage)
                        .font(.system(size: 9, weight: .semibold))
                        .foregroundStyle(.red)
                        .lineLimit(2)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            .padding(.horizontal, 4)
            .padding(.vertical, 0)
            .frame(width: proxy.size.width, height: proxy.size.height, alignment: .topLeading)
        }
        .sheet(item: $presentedSheet) { sheet in
            switch sheet {
            case .servicePicker:
                FocusServiceSheet(services: displayServices, selectedServiceId: $focusedServiceId)
            }
        }
    }
}

private struct QuotaHeader: View {
    let isRefreshing: Bool
    let serviceName: String
    let showSettings: () -> Void
    let refresh: () -> Void

    var body: some View {
        HStack(spacing: 8) {
            VStack(alignment: .leading, spacing: 1) {
                Text(headerTitle)
                    .font(.system(size: 19, weight: .bold, design: .rounded))
                    .lineLimit(1)
            }

            Spacer(minLength: 4)

            Button(action: showSettings) {
                Image(systemName: "gearshape.fill")
                    .font(.system(size: 14, weight: .bold))
                    .frame(width: 28, height: 28)
                    .background(Color.white.opacity(0.13), in: Circle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(QuotaL10n.text("选择关注服务", "Choose focused service"))

            Button(action: refresh) {
                Image(systemName: "arrow.clockwise")
                    .font(.system(size: 15, weight: .bold))
                    .frame(width: 28, height: 28)
                    .background(Color.white.opacity(isRefreshing ? 0.08 : 0.16), in: Circle())
            }
            .buttonStyle(.plain)
            .disabled(isRefreshing)
            .accessibilityLabel(QuotaL10n.text("刷新额度", "Refresh quota"))
        }
        .padding(.horizontal, 2)
    }

    private var headerTitle: String {
        if serviceName.localizedCaseInsensitiveContains("claude") {
            return QuotaL10n.text("Claude 额度", "Claude Quota")
        }
        if serviceName.localizedCaseInsensitiveContains("codex") {
            return QuotaL10n.text("Codex 额度", "Codex Quota")
        }
        return "AI Quota"
    }
}

private struct QuotaServiceStrip: View {
    let service: QuotaService

    var body: some View {
        let tint = QuotaVisuals.tint(for: service)
        HStack(spacing: 8) {
            QuotaBrandMark(service: service)

            VStack(alignment: .leading, spacing: 1) {
                Text(service.serviceName)
                    .font(.system(size: 16, weight: .bold, design: .rounded))
                    .lineLimit(1)
                    .minimumScaleFactor(0.64)
                Text(QuotaL10n.localizedKnownText(service.accountLabel ?? QuotaL10n.text("订阅额度", "Subscription quota")))
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }

            Spacer(minLength: 4)

            Text(QuotaL10n.status(service.status, fallback: service.statusLabel))
                .font(.system(size: 10, weight: .bold))
                .foregroundStyle(QuotaVisuals.statusTint(for: service.status))
                .lineLimit(1)
                .padding(.horizontal, 6)
                .padding(.vertical, 4)
                .background(
                    QuotaVisuals.statusTint(for: service.status).opacity(0.14),
                    in: Capsule()
                )
        }
        .padding(.horizontal, 9)
        .padding(.vertical, 6)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            LinearGradient(
                colors: [tint.opacity(0.18), Color.white.opacity(0.08)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            ),
            in: RoundedRectangle(cornerRadius: 16, style: .continuous)
        )
    }
}

private struct QuotaBrandMark: View {
    let service: QuotaService

    var body: some View {
        let tint = QuotaVisuals.tint(for: service)

        ZStack {
            RoundedRectangle(cornerRadius: 9, style: .continuous)
                .fill(tint.opacity(0.18))
            officialLogo
                .frame(width: 19, height: 19)
        }
        .frame(width: 30, height: 30)
    }

    @ViewBuilder
    private var officialLogo: some View {
        if let assetName = QuotaVisuals.officialLogoAssetName(for: service) {
            Image(assetName)
                .resizable()
                .renderingMode(.template)
                .scaledToFit()
                .foregroundStyle(.white)
                .accessibilityHidden(true)
        } else {
            Text(QuotaVisuals.badgeText(for: service))
                .font(.system(size: 17, weight: .heavy, design: .rounded))
                .foregroundStyle(QuotaVisuals.tint(for: service))
        }
    }
}

private struct QuotaWindowGrid: View {
    let service: QuotaService
    let compact: Bool

    var body: some View {
        let windows = visibleWindows

        HStack(spacing: 6) {
            ForEach(windows) { window in
                QuotaWindowTile(window: window, tint: QuotaVisuals.tint(for: service), compact: compact)
            }
        }
    }

    private var visibleWindows: [QuotaWindow] {
        let ordered = service.orderedWindows
        if ordered.isEmpty {
            return [
                .placeholder(id: "5h", label: QuotaL10n.windowLabel(id: "5h")),
                .placeholder(id: "weekly", label: QuotaL10n.windowLabel(id: "weekly"))
            ]
        }
        return Array(ordered.prefix(2))
    }
}

private struct QuotaWindowTile: View {
    let window: QuotaWindow
    let tint: Color
    let compact: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: compact ? 3 : 4) {
            HStack(spacing: 4) {
                Text(QuotaL10n.windowLabel(id: window.id, fallback: window.label))
                    .font(.system(size: 12, weight: .bold))
                    .lineLimit(1)
                Spacer(minLength: 2)
                Circle()
                    .fill(QuotaVisuals.statusTint(for: window.status))
                    .frame(width: 6, height: 6)
            }

            HStack(alignment: .firstTextBaseline, spacing: 2) {
                Text(window.remainingPercentText)
                    .font(.system(size: compact ? 24 : 28, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .lineLimit(1)
                    .minimumScaleFactor(0.68)
                Text(QuotaL10n.text("剩余", "left"))
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }

            QuotaProgressBar(window: window, tint: tint)

            Text(resetText)
                .font(.system(size: 9, weight: .medium))
                .foregroundStyle(.secondary)
                .lineLimit(1)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, compact ? 5 : 7)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.white.opacity(0.09), in: RoundedRectangle(cornerRadius: 15, style: .continuous))
    }

    private var resetText: String {
        if let resetsAt = window.resetsAt {
            return QuotaL10n.resetText(resetsAt: resetsAt)
        }
        return QuotaL10n.status(window.status, fallback: window.statusLabel)
    }
}

private struct QuotaProgressBar: View {
    let window: QuotaWindow
    let tint: Color

    var body: some View {
        GeometryReader { proxy in
            let remaining = max(0, min(100, window.remainingPercent ?? 0))
            let width = proxy.size.width * remaining / 100
            ZStack(alignment: .leading) {
                Capsule().fill(Color.white.opacity(0.16))
                Capsule()
                    .fill(QuotaVisuals.statusTint(for: window.status))
                    .frame(width: max(6, width))
            }
        }
        .frame(height: 6)
    }
}

private struct QuotaFreshnessLine: View {
    let service: QuotaService?
    let summary: QuotaSummary
    let isRefreshing: Bool

    var body: some View {
        let primary = service ?? summary.primary
        HStack(spacing: 6) {
            Circle()
                .fill((primary?.isStale ?? true) ? Color.orange : Color.green)
                .frame(width: 7, height: 7)
            Text(isRefreshing ? QuotaL10n.text("正在获取最新额度", "Fetching latest quota") : ((primary?.isStale ?? true) ? QuotaL10n.text("数据可能过期", "Data may be stale") : QuotaL10n.text("刚刚同步", "Just synced")))
                .font(.caption2.weight(.semibold))
                .foregroundStyle((primary?.isStale ?? true) ? .orange : .green)
                .lineLimit(1)
            Spacer(minLength: 4)
            Text(timeText(primary: primary))
                .font(.caption2)
                .foregroundStyle(.secondary)
                .monospacedDigit()
        }
        .padding(.horizontal, 2)
    }

    private func timeText(primary: QuotaService?) -> String {
        if isRefreshing { return QuotaL10n.text("请求中", "Requesting") }
        if primary?.isStale ?? true {
            return QuotaL10n.watchUpdatedAt(summary.refreshedAt)
        }
        return primary?.fetchedAt.quotaWatchTimeText ?? summary.refreshedAt.quotaWatchTimeText
    }
}

private enum WatchSheet: Identifiable {
    case servicePicker

    var id: String {
        switch self {
        case .servicePicker:
            return "servicePicker"
        }
    }
}

private struct FocusServiceSheet: View {
    @Environment(\.dismiss) private var dismiss

    let services: [QuotaService]
    @Binding var selectedServiceId: String

    var body: some View {
        NavigationStack {
            List {
                ForEach(services) { service in
                    Button {
                        selectedServiceId = service.serviceId
                        dismiss()
                    } label: {
                        HStack(spacing: 8) {
                            QuotaBrandMark(service: service)

                            VStack(alignment: .leading, spacing: 1) {
                                Text(service.serviceName)
                                    .font(.headline.weight(.bold))
                                    .lineLimit(1)
                                Text(QuotaL10n.status(service.status, fallback: service.statusLabel))
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                            }

                            Spacer(minLength: 2)

                            if service.serviceId == selectedServiceId {
                                Image(systemName: "checkmark.circle.fill")
                                    .foregroundStyle(.green)
                            }
                        }
                    }
                }
            }
            .navigationTitle(QuotaL10n.text("关注", "Focus"))
        }
    }
}

private struct EmptyQuotaCard: View {
    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: "timer")
                .font(.title2.weight(.bold))
                .foregroundStyle(.orange)
            Text(QuotaL10n.text("等待额度数据", "Waiting for quota data"))
                .font(.headline)
            Text(QuotaL10n.text("请先让本机 bridge 上报 Codex 或 Claude 的最新窗口", "Let the local bridge report the latest Codex or Claude quota window first."))
                .font(.caption2)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding(14)
        .frame(maxWidth: .infinity)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
}

private struct QuotaLoadingView: View {
    var body: some View {
        GeometryReader { proxy in
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Text("AI Quota")
                        .font(.system(size: 19, weight: .bold, design: .rounded))
                    Spacer()
                    Circle()
                        .fill(Color.cyan)
                        .frame(width: 8, height: 8)
                }

                VStack(alignment: .leading, spacing: 5) {
                    Text(QuotaL10n.text("正在获取最新额度", "Fetching latest quota"))
                        .font(.system(size: 15, weight: .bold, design: .rounded))
                        .lineLimit(1)
                    Text(QuotaL10n.text("打开 App 后会立即请求最新 Codex / Claude 额度", "Opening the app requests the latest Codex / Claude quota immediately."))
                        .font(.system(size: 10, weight: .medium))
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 10)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.white.opacity(0.09), in: RoundedRectangle(cornerRadius: 16, style: .continuous))

                HStack(spacing: 6) {
                    QuotaLoadingPill(title: QuotaL10n.windowLabel(id: "5h"))
                    QuotaLoadingPill(title: QuotaL10n.windowLabel(id: "weekly"))
                }
            }
            .padding(.horizontal, 4)
            .frame(width: proxy.size.width, height: proxy.size.height, alignment: .topLeading)
        }
    }
}

private struct QuotaLoadingPill: View {
    let title: String

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.system(size: 11, weight: .bold))
            Capsule()
                .fill(Color.white.opacity(0.16))
                .frame(height: 6)
            Text("--")
                .font(.system(size: 18, weight: .bold, design: .rounded))
                .monospacedDigit()
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 15, style: .continuous))
    }
}

private struct QuotaErrorView: View {
    let message: String
    let refresh: () -> Void

    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: "wifi.exclamationmark")
                .font(.title2.weight(.bold))
                .foregroundStyle(.orange)
            Text(QuotaL10n.text("读取失败", "Read failed"))
                .font(.headline)
            Text(message)
                .font(.caption2)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .lineLimit(8)
            Button(QuotaL10n.text("重试", "Retry"), action: refresh)
                .buttonStyle(.borderedProminent)
        }
        .padding(.horizontal, 4)
    }
}

private enum QuotaVisuals {
    static func officialLogoAssetName(for service: QuotaService) -> String? {
        let key = "\(service.serviceId) \(service.serviceName)".lowercased()
        if key.contains("codex") || key.contains("openai") {
            return "BrandOpenAI"
        }
        if key.contains("claude") || key.contains("anthropic") {
            return "BrandClaude"
        }
        return nil
    }

    static func tint(for service: QuotaService) -> Color {
        let key = "\(service.serviceId) \(service.serviceName)".lowercased()
        if key.contains("codex") || key.contains("openai") {
            return .mint
        }
        if key.contains("claude") || key.contains("anthropic") {
            return .orange
        }
        return .cyan
    }

    static func badgeText(for service: QuotaService) -> String {
        let key = "\(service.serviceId) \(service.serviceName)".lowercased()
        if key.contains("codex") || key.contains("openai") {
            return "Cx"
        }
        if key.contains("claude") || key.contains("anthropic") {
            return "Cl"
        }
        return String(service.serviceName.prefix(2))
    }

    static func statusIcon(for status: String) -> String {
        switch status {
        case "ok":
            return "checkmark.circle.fill"
        case "warning":
            return "exclamationmark.circle.fill"
        case "critical":
            return "bell.badge.fill"
        case "stale":
            return "clock.badge.exclamationmark.fill"
        default:
            return "questionmark.circle.fill"
        }
    }

    static func statusTint(for status: String) -> Color {
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
            return .secondary
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
    var remainingPercentText: String {
        QuotaL10n.quotaValueText(remainingText: remainingText, remainingPercent: remainingPercent)
    }

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
}

private extension Date {
    var watchTimeText: String {
        quotaWatchTimeText
    }

    var relativeResetText: String {
        QuotaL10n.relativeResetText(self)
    }
}

#Preview {
    WatchContentView()
}
