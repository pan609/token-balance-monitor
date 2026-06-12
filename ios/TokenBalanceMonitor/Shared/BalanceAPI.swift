import Foundation

enum TokenMonitorAPI {
    static var dashboardURL: URL? {
        let summaryPath = "/api/mobile/summary"
        let base: String
        if TokenMonitorConfig.mobileSummaryURL.hasSuffix(summaryPath) {
            base = String(TokenMonitorConfig.mobileSummaryURL.dropLast(summaryPath.count))
        } else {
            base = TokenMonitorConfig.mobileSummaryURL
        }
        return URL(string: base + "#usage-dashboard")
    }

    static func fetchSummary() async throws -> MobileSummary {
        guard let url = URL(string: TokenMonitorConfig.mobileSummaryURL) else {
            throw TokenMonitorError.invalidURL
        }

        let request = authorizedRequest(url: url)
        let (data, response) = try await URLSession.shared.data(for: request)
        return try decodeSummary(data: data, response: response)
    }

    static func setPrimaryProvider(_ providerId: String) async throws -> MobileSummary {
        guard
            let summaryURL = URL(string: TokenMonitorConfig.mobileSummaryURL)
        else {
            throw TokenMonitorError.invalidURL
        }

        let url = summaryURL
            .deletingLastPathComponent()
            .appendingPathComponent("primary-provider")
        var request = authorizedRequest(url: url)
        request.httpMethod = "PUT"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(PrimaryProviderRequest(providerId: providerId))

        let (data, response) = try await URLSession.shared.data(for: request)
        return try decodeSummary(data: data, response: response)
    }

    private static func authorizedRequest(url: URL) -> URLRequest {
        var request = URLRequest(url: url)
        request.timeoutInterval = 15
        if !TokenMonitorConfig.mobileToken.isEmpty {
            request.setValue(TokenMonitorConfig.mobileToken, forHTTPHeaderField: "x-mobile-token")
        }
        return request
    }

    private static func decodeSummary(data: Data, response: URLResponse) throws -> MobileSummary {
        guard let httpResponse = response as? HTTPURLResponse else {
            throw TokenMonitorError.invalidResponse
        }
        guard (200..<300).contains(httpResponse.statusCode) else {
            let apiMessage = try? JSONDecoder().decode(APIErrorResponse.self, from: data).message
            throw TokenMonitorError.serverMessage(apiMessage ?? "服务返回 HTTP \(httpResponse.statusCode)")
        }

        return try summaryDecoder.decode(MobileSummary.self, from: data)
    }

    private static var summaryDecoder: JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let value = try container.decode(String.self)
            let formatter = ISO8601DateFormatter()
            formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let date = formatter.date(from: value) {
                return date
            }
            throw TokenMonitorError.invalidDate(value)
        }
        return decoder
    }
}

enum TokenMonitorError: LocalizedError {
    case invalidURL
    case invalidResponse
    case httpStatus(Int)
    case invalidDate(String)
    case serverMessage(String)

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "移动端 API 地址无效"
        case .invalidResponse:
            return "服务响应异常"
        case .httpStatus(let status):
            return "服务返回 HTTP \(status)"
        case .invalidDate:
            return "刷新时间格式无法识别"
        case .serverMessage(let message):
            return message
        }
    }
}

private struct PrimaryProviderRequest: Encodable {
    let providerId: String
}

private struct APIErrorResponse: Decodable {
    let message: String?
}

extension Double {
    func moneyText(currency: String = "CNY") -> String {
        let normalized = currency.uppercased()
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        formatter.minimumFractionDigits = 2
        formatter.maximumFractionDigits = 2
        let amount = formatter.string(from: NSNumber(value: self)) ?? String(format: "%.2f", self)

        switch normalized {
        case "CNY":
            return "¥" + amount
        case "USD":
            return "$" + amount
        default:
            return amount + " " + normalized
        }
    }

    var yuanText: String {
        moneyText(currency: "CNY")
    }
}

extension Date {
    var compactTimeText: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm"
        return formatter.string(from: self)
    }
}
