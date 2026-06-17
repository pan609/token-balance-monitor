import Foundation

struct QuotaSummary: Decodable, Equatable, Sendable {
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

struct QuotaService: Decodable, Equatable, Identifiable, Sendable {
    let serviceId: String
    let serviceName: String
    let accountLabel: String?
    let planLabel: String?
    let source: String
    let fetchedAt: Date
    let ageSeconds: Int
    let isStale: Bool
    let status: String
    let statusLabel: String
    let windows: [QuotaWindow]

    var id: String { serviceId }
}

struct QuotaWindow: Decodable, Equatable, Identifiable, Sendable {
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
                planLabel: "GPT-5.1 Codex",
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
