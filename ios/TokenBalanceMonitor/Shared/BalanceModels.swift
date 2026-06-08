import Foundation

struct MobileSummary: Decodable, Equatable, Sendable {
    let ok: Bool
    let refreshedAt: Date
    let totalCny: Double?
    let alertThresholdCny: Double
    let primaryProvider: String
    let primaryAmount: Double?
    let primaryCurrency: String
    let primaryIsBelowAlert: Bool
    let providers: [String: ProviderSummary]

    var orderedProviders: [ProviderSummary] {
        let preferredOrder = [
            "aliyun",
            "moonshot",
            "deepseek",
            "siliconflow",
            "volcengine",
            "openrouter"
        ]
        return preferredOrder.compactMap { providers[$0] } +
            providers.values
                .filter { !preferredOrder.contains($0.id) }
                .sorted { $0.name < $1.name }
    }

    var primary: ProviderSummary? {
        providers[primaryProvider]
    }
}

struct ProviderSummary: Decodable, Equatable, Identifiable, Sendable {
    let id: String
    let name: String
    let shortName: String
    let amount: Double?
    let currency: String
    let status: String
    let statusLabel: String
    let severity: String
    let message: String?
    let isBelowMobileAlert: Bool
}

extension MobileSummary {
    static let preview = MobileSummary(
        ok: true,
        refreshedAt: Date(),
        totalCny: 23.60,
        alertThresholdCny: 2,
        primaryProvider: "aliyun",
        primaryAmount: 6.47,
        primaryCurrency: "CNY",
        primaryIsBelowAlert: false,
        providers: [
            "aliyun": ProviderSummary(
                id: "aliyun",
                name: "阿里云",
                shortName: "阿",
                amount: 6.47,
                currency: "CNY",
                status: "ok",
                statusLabel: "正常",
                severity: "normal",
                message: nil,
                isBelowMobileAlert: false
            ),
            "deepseek": ProviderSummary(
                id: "deepseek",
                name: "DeepSeek",
                shortName: "D",
                amount: 7.13,
                currency: "CNY",
                status: "ok",
                statusLabel: "正常",
                severity: "normal",
                message: nil,
                isBelowMobileAlert: false
            ),
            "moonshot": ProviderSummary(
                id: "moonshot",
                name: "Kimi / Moonshot",
                shortName: "Kimi",
                amount: 18.40,
                currency: "CNY",
                status: "ok",
                statusLabel: "正常",
                severity: "normal",
                message: nil,
                isBelowMobileAlert: false
            ),
            "siliconflow": ProviderSummary(
                id: "siliconflow",
                name: "SiliconFlow / 硅基流动",
                shortName: "硅基流动",
                amount: 22.10,
                currency: "CNY",
                status: "ok",
                statusLabel: "正常",
                severity: "normal",
                message: nil,
                isBelowMobileAlert: false
            ),
            "volcengine": ProviderSummary(
                id: "volcengine",
                name: "豆包",
                shortName: "豆",
                amount: 10,
                currency: "CNY",
                status: "ok",
                statusLabel: "正常",
                severity: "normal",
                message: nil,
                isBelowMobileAlert: false
            ),
            "openrouter": ProviderSummary(
                id: "openrouter",
                name: "OpenRouter",
                shortName: "Router",
                amount: 5.28,
                currency: "USD",
                status: "ok",
                statusLabel: "正常",
                severity: "normal",
                message: nil,
                isBelowMobileAlert: false
            )
        ]
    )

    static let lowBalancePreview = MobileSummary(
        ok: true,
        refreshedAt: Date(),
        totalCny: 17.82,
        alertThresholdCny: 2,
        primaryProvider: "aliyun",
        primaryAmount: 1.42,
        primaryCurrency: "CNY",
        primaryIsBelowAlert: true,
        providers: [
            "aliyun": ProviderSummary(
                id: "aliyun",
                name: "阿里云",
                shortName: "阿",
                amount: 1.42,
                currency: "CNY",
                status: "warning",
                statusLabel: "偏低",
                severity: "warning",
                message: nil,
                isBelowMobileAlert: true
            )
        ]
    )
}
