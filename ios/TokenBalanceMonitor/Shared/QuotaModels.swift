import Foundation

struct QuotaSummary: Codable, Equatable, Sendable {
    let ok: Bool
    let refreshedAt: Date
    let staleSeconds: Int
    let warningRemainingPercent: Double
    let criticalRemainingPercent: Double
    let primaryServiceId: String
    let primaryService: QuotaService?
    let services: [QuotaService]

    var primary: QuotaService? {
        primaryService ?? services.first { $0.serviceId == primaryServiceId } ?? services.first
    }
}

struct QuotaService: Codable, Equatable, Identifiable, Sendable {
    let serviceId: String
    let serviceName: String
    let accountLabel: String?
    let planLabel: String?
    let quotaType: String?
    let source: String
    let fetchedAt: Date
    let ageSeconds: Int
    let isStale: Bool
    let status: String
    let statusLabel: String
    let windows: [QuotaWindow]

    var id: String { serviceId }
}

struct QuotaWindow: Codable, Equatable, Identifiable, Sendable {
    let id: String
    let label: String
    let usedPercent: Double?
    let remainingPercent: Double?
    let resetsAt: Date?
    let usedText: String?
    let remainingText: String?
    let limitText: String?
    let status: String
    let statusLabel: String
}

extension QuotaSummary {
    var quotaDisplayServices: [QuotaService] {
        var result: [QuotaService] = []

        if let codex = canonicalService(id: "codex") {
            result.append(codex.normalizedQuotaDisplay(serviceId: "codex", serviceName: "Codex"))
        } else {
            result.append(.pendingDisplay(
                serviceId: "codex",
                serviceName: "Codex",
                windows: [
                    .displayPlaceholder(id: "5h", label: "5 小时"),
                    .displayPlaceholder(id: "weekly", label: "每周")
                ]
            ))
        }

        if let claude = canonicalService(id: "claude") {
            result.append(claude.normalizedQuotaDisplay(serviceId: "claude", serviceName: "Claude"))
        } else {
            result.append(.pendingDisplay(
                serviceId: "claude",
                serviceName: "Claude",
                windows: [
                    .displayPlaceholder(id: "monthly", label: "本月")
                ]
            ))
        }

        let knownPrefixes = ["codex", "claude"]
        let extras = services.filter { service in
            !knownPrefixes.contains { prefix in
                service.serviceId == prefix || service.serviceId.hasPrefix("\(prefix)_")
            }
        }
        return result + extras
    }

    private func canonicalService(id: String) -> QuotaService? {
        services.first { $0.serviceId == id }
            ?? services.first { $0.serviceId.hasPrefix("\(id)_") }
    }
}

extension QuotaService {
    static func pendingDisplay(serviceId: String, serviceName: String, windows: [QuotaWindow]) -> QuotaService {
        QuotaService(
            serviceId: serviceId,
            serviceName: serviceName,
            accountLabel: nil,
            planLabel: "等待同步",
            quotaType: serviceId == "claude" ? "spend_limit" : "rate_window",
            source: "pending",
            fetchedAt: Date(),
            ageSeconds: 0,
            isStale: true,
            status: "stale",
            statusLabel: "等待同步",
            windows: windows
        )
    }

    func normalizedQuotaDisplay(serviceId: String, serviceName: String) -> QuotaService {
        QuotaService(
            serviceId: serviceId,
            serviceName: serviceName,
            accountLabel: accountLabel,
            planLabel: planLabel,
            quotaType: quotaType,
            source: source,
            fetchedAt: fetchedAt,
            ageSeconds: ageSeconds,
            isStale: isStale,
            status: status,
            statusLabel: statusLabel,
            windows: windows
        )
    }
}

extension QuotaWindow {
    static func displayPlaceholder(id: String, label: String) -> QuotaWindow {
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

extension QuotaSummary {
    static let preview = QuotaSummary(
        ok: true,
        refreshedAt: Date(),
        staleSeconds: 120,
        warningRemainingPercent: 20,
        criticalRemainingPercent: 8,
        primaryServiceId: "codex",
        primaryService: nil,
        services: [
            QuotaService(
                serviceId: "codex",
                serviceName: "Codex",
                accountLabel: "ChatGPT Pro",
                planLabel: nil,
                quotaType: "rate_window",
                source: "codex-status",
                fetchedAt: Date(),
                ageSeconds: 8,
                isStale: false,
                status: "warning",
                statusLabel: "偏低",
                windows: [
                    QuotaWindow(
                        id: "5h",
                        label: "5 小时",
                        usedPercent: 78,
                        remainingPercent: 22,
                        resetsAt: Date().addingTimeInterval(42 * 60),
                        usedText: nil,
                        remainingText: "约 22%",
                        limitText: nil,
                        status: "warning",
                        statusLabel: "偏低"
                    ),
                    QuotaWindow(
                        id: "weekly",
                        label: "每周",
                        usedPercent: 41,
                        remainingPercent: 59,
                        resetsAt: Date().addingTimeInterval(3 * 24 * 60 * 60),
                        usedText: nil,
                        remainingText: "约 59%",
                        limitText: nil,
                        status: "ok",
                        statusLabel: "充足"
                    )
                ]
            ),
            QuotaService(
                serviceId: "claude",
                serviceName: "Claude",
                accountLabel: "Max",
                planLabel: "Claude Code",
                quotaType: "rate_window",
                source: "claude-statusline",
                fetchedAt: Date().addingTimeInterval(-26),
                ageSeconds: 26,
                isStale: false,
                status: "ok",
                statusLabel: "充足",
                windows: [
                    QuotaWindow(
                        id: "5h",
                        label: "5 小时",
                        usedPercent: 36,
                        remainingPercent: 64,
                        resetsAt: Date().addingTimeInterval(92 * 60),
                        usedText: nil,
                        remainingText: "约 64%",
                        limitText: nil,
                        status: "ok",
                        statusLabel: "充足"
                    )
                ]
            )
        ]
    )
}
