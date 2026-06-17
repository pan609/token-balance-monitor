import Foundation

enum QuotaAPI {
    static func fetchSummary() async throws -> QuotaSummary {
        guard let url = URL(string: TokenMonitorConfig.quotaSummaryURL) else {
            throw TokenMonitorError.invalidURL
        }

        return try await requestSummary(url: url, method: "GET")
    }

    static func refreshSummary(force: Bool = false, serviceId: String? = nil) async throws -> QuotaSummary {
        guard let url = URL(string: TokenMonitorConfig.quotaRefreshURL) else {
            return try await fetchSummary()
        }

        do {
            let body = try JSONEncoder().encode(RefreshRequest(force: force, serviceId: serviceId))
            return try await requestSummary(
                url: url,
                method: "POST",
                body: body
            )
        } catch {
            return try await fetchSummary()
        }
    }

    private static func requestSummary(
        url: URL,
        method: String,
        body: Data? = nil
    ) async throws -> QuotaSummary {
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.timeoutInterval = 15
        request.cachePolicy = .reloadIgnoringLocalAndRemoteCacheData
        if !TokenMonitorConfig.quotaToken.isEmpty {
            request.setValue(TokenMonitorConfig.quotaToken, forHTTPHeaderField: "x-quota-token")
        }
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = body
        }

        let (data, response) = try await URLSession.shared.data(for: request)
        return try decodeSummary(data: data, response: response)
    }

    private static func decodeSummary(data: Data, response: URLResponse) throws -> QuotaSummary {
        guard let httpResponse = response as? HTTPURLResponse else {
            throw TokenMonitorError.invalidResponse
        }
        guard (200..<300).contains(httpResponse.statusCode) else {
            let apiMessage = try? JSONDecoder().decode(APIErrorResponse.self, from: data).message
            throw TokenMonitorError.serverMessage(apiMessage ?? "服务返回 HTTP \(httpResponse.statusCode)")
        }

        return try quotaDecoder.decode(QuotaSummary.self, from: data)
    }

    private static var quotaDecoder: JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let value = try container.decode(String.self)
            let formatter = ISO8601DateFormatter()
            formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let date = formatter.date(from: value) {
                return date
            }

            let fallback = ISO8601DateFormatter()
            fallback.formatOptions = [.withInternetDateTime]
            if let date = fallback.date(from: value) {
                return date
            }

            throw TokenMonitorError.invalidDate(value)
        }
        return decoder
    }
}

private struct APIErrorResponse: Decodable {
    let message: String?
}

private struct RefreshRequest: Encodable {
    let force: Bool
    let serviceId: String?
}
