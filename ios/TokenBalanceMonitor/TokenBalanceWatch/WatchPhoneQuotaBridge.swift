import Foundation
import WatchConnectivity

@MainActor
final class WatchPhoneQuotaBridge: NSObject {
    static let shared = WatchPhoneQuotaBridge()

    private let session: WCSession? = WCSession.isSupported() ? .default : nil

    private override init() {
        super.init()
    }

    func activate() {
        guard let session else { return }
        session.delegate = self
        session.activate()
    }

    func refreshSummary(force: Bool, serviceId: String?) async throws -> QuotaSummary {
        guard let session else {
            throw TokenMonitorError.serverMessage("当前设备不支持 iPhone 中继")
        }

        if session.activationState == .notActivated {
            activate()
        }

        guard session.isReachable else {
            throw TokenMonitorError.serverMessage("iPhone 中继不可用，请确认 iPhone 在附近且已打开 AI Quota")
        }

        var message: [String: Any] = [
            QuotaBridgeCodec.messageTypeKey: QuotaBridgeCodec.refreshQuotaMessage,
            QuotaBridgeCodec.forceKey: force
        ]
        if let serviceId {
            message[QuotaBridgeCodec.serviceIdKey] = serviceId
        }

        return try await withCheckedThrowingContinuation { continuation in
            session.sendMessage(message, replyHandler: { reply in
                if let payload = reply[QuotaBridgeCodec.payloadKey] as? Data {
                    do {
                        continuation.resume(returning: try QuotaBridgeCodec.decode(payload))
                    } catch {
                        continuation.resume(throwing: error)
                    }
                    return
                }

                let errorMessage = reply[QuotaBridgeCodec.errorKey] as? String ?? "iPhone 中继返回异常"
                continuation.resume(throwing: TokenMonitorError.serverMessage(errorMessage))
            }, errorHandler: { error in
                continuation.resume(throwing: TokenMonitorError.serverMessage(error.localizedDescription))
            })
        }
    }
}

extension WatchPhoneQuotaBridge: WCSessionDelegate {
    nonisolated func session(
        _ session: WCSession,
        activationDidCompleteWith activationState: WCSessionActivationState,
        error: Error?
    ) {
        if let error {
            print("Watch quota bridge activation failed: \(error.localizedDescription)")
        }
    }

#if os(iOS)
    nonisolated func sessionDidBecomeInactive(_ session: WCSession) {}

    nonisolated func sessionDidDeactivate(_ session: WCSession) {
        session.activate()
    }
#endif
}
