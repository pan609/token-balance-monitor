import Foundation

enum QuotaBridgeCodec {
    static let messageTypeKey = "type"
    static let refreshQuotaMessage = "quota.refresh"
    static let forceKey = "force"
    static let serviceIdKey = "serviceId"
    static let payloadKey = "payload"
    static let errorKey = "error"

    static func encode(_ summary: QuotaSummary) throws -> Data {
        try encoder.encode(summary)
    }

    static func decode(_ data: Data) throws -> QuotaSummary {
        try decoder.decode(QuotaSummary.self, from: data)
    }

    private static var encoder: JSONEncoder {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        return encoder
    }

    private static var decoder: JSONDecoder {
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
