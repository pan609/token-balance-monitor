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

    private var focusedService: QuotaService? {
        summary.services.first { $0.serviceId == focusedServiceId }
            ?? summary.primary
            ?? summary.services.first
    }

    var body: some View {
        GeometryReader { proxy in
            let compact = proxy.size.height < 220

            VStack(alignment: .leading, spacing: compact ? 4 : 6) {
                QuotaHeader(
                    isRefreshing: isRefreshing,
                    serviceName: focusedService?.serviceName ?? "额度",
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
                FocusServiceSheet(services: summary.services, selectedServiceId: $focusedServiceId)
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
            VStack(alignment: .leading, spacing: 2) {
                Text(headerTitle)
                    .font(.system(size: 19, weight: .bold, design: .rounded))
                    .lineLimit(1)
                Text("订阅窗口 · 前台 15s")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(.secondary)
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
            .accessibilityLabel("选择关注服务")

            Button(action: refresh) {
                Image(systemName: "arrow.clockwise")
                    .font(.system(size: 15, weight: .bold))
                    .frame(width: 28, height: 28)
                    .background(Color.white.opacity(isRefreshing ? 0.08 : 0.16), in: Circle())
            }
            .buttonStyle(.plain)
            .disabled(isRefreshing)
            .accessibilityLabel("刷新额度")
        }
        .padding(.horizontal, 2)
    }

    private var headerTitle: String {
        if serviceName.localizedCaseInsensitiveContains("claude") {
            return "Claude 额度"
        }
        if serviceName.localizedCaseInsensitiveContains("codex") {
            return "Codex 额度"
        }
        return "额度监控"
    }
}

private struct QuotaServiceStrip: View {
    let service: QuotaService

    var body: some View {
        let tint = QuotaVisuals.tint(for: service)
        HStack(spacing: 8) {
            Text(QuotaVisuals.badgeText(for: service))
                .font(.system(size: 17, weight: .heavy, design: .rounded))
                .foregroundStyle(tint)
                .frame(width: 30, height: 30)
                .background(tint.opacity(0.18), in: RoundedRectangle(cornerRadius: 9, style: .continuous))

            VStack(alignment: .leading, spacing: 1) {
                Text(service.serviceName)
                    .font(.system(size: 16, weight: .bold, design: .rounded))
                    .lineLimit(1)
                    .minimumScaleFactor(0.64)
                Text(service.planLabel ?? service.accountLabel ?? "订阅额度")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }

            Spacer(minLength: 4)

            Image(systemName: QuotaVisuals.statusIcon(for: service.status))
                .font(.system(size: 19, weight: .bold))
                .foregroundStyle(QuotaVisuals.statusTint(for: service.status))
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

private struct QuotaWindowGrid: View {
    let service: QuotaService
    let compact: Bool

    var body: some View {
        let windows = [
            service.window(id: "5h") ?? QuotaWindow.placeholder(id: "5h", label: "5 小时"),
            service.window(id: "weekly") ?? QuotaWindow.placeholder(id: "weekly", label: "每周")
        ]

        HStack(spacing: 6) {
            ForEach(windows) { window in
                QuotaWindowTile(window: window, tint: QuotaVisuals.tint(for: service), compact: compact)
            }
        }
    }
}

private struct QuotaWindowTile: View {
    let window: QuotaWindow
    let tint: Color
    let compact: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: compact ? 3 : 4) {
            HStack(spacing: 4) {
                Text(window.label)
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
                Text("剩余")
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
            return "\(resetsAt.relativeResetText)重置"
        }
        return window.statusLabel
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
            Text(isRefreshing ? "正在获取最新额度" : ((primary?.isStale ?? true) ? "数据可能过期" : "刚刚同步"))
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
        if isRefreshing { return "请求中" }
        if primary?.isStale ?? true {
            return "查 \(summary.refreshedAt.watchTimeText)"
        }
        return primary?.fetchedAt.watchTimeText ?? summary.refreshedAt.watchTimeText
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
                            Text(QuotaVisuals.badgeText(for: service))
                                .font(.headline.weight(.heavy))
                                .foregroundStyle(QuotaVisuals.tint(for: service))
                                .frame(width: 30, height: 30)
                                .background(
                                    QuotaVisuals.tint(for: service).opacity(0.16),
                                    in: RoundedRectangle(cornerRadius: 9, style: .continuous)
                                )

                            VStack(alignment: .leading, spacing: 1) {
                                Text(service.serviceName)
                                    .font(.headline.weight(.bold))
                                    .lineLimit(1)
                                Text(service.statusLabel)
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
            .navigationTitle("关注")
        }
    }
}

private struct EmptyQuotaCard: View {
    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: "timer")
                .font(.title2.weight(.bold))
                .foregroundStyle(.orange)
            Text("等待额度数据")
                .font(.headline)
            Text("请先让本机 bridge 上报 Codex 或 Claude 的最新窗口")
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
        VStack(spacing: 12) {
            ProgressView()
            Text("正在读取额度")
                .font(.headline)
            Text("打开即刷新，不依赖表盘后台刷新")
                .font(.caption2)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
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
            Text("读取失败")
                .font(.headline)
            Text(message)
                .font(.caption2)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .lineLimit(4)
            Button("重试", action: refresh)
                .buttonStyle(.borderedProminent)
        }
        .padding(.horizontal, 4)
    }
}

private enum QuotaVisuals {
    static func tint(for service: QuotaService) -> Color {
        switch service.serviceId {
        case "codex":
            return .mint
        case "claude":
            return .orange
        default:
            return .cyan
        }
    }

    static func badgeText(for service: QuotaService) -> String {
        switch service.serviceId {
        case "codex":
            return "Cx"
        case "claude":
            return "Cl"
        default:
            return String(service.serviceName.prefix(2))
        }
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
}

private extension QuotaWindow {
    var remainingPercentText: String {
        guard let remainingPercent else { return "--" }
        return "\(Int(remainingPercent.rounded()))%"
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
            statusLabel: "待同步"
        )
    }
}

private extension Date {
    var watchTimeText: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm:ss"
        return formatter.string(from: self)
    }

    var relativeResetText: String {
        let seconds = timeIntervalSinceNow
        if seconds <= 0 { return "即将" }
        let minutes = Int(seconds / 60)
        if minutes < 60 { return "\(max(1, minutes)) 分钟后" }
        let hours = minutes / 60
        if hours < 24 { return "\(hours) 小时后" }
        return "\(hours / 24) 天后"
    }
}

#Preview {
    WatchContentView()
}
