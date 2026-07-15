import Foundation
import WatchConnectivity

@MainActor
final class PhoneQuotaBridge: NSObject {
    static let shared = PhoneQuotaBridge()

    private let session: WCSession? = WCSession.isSupported() ? .default : nil

    private override init() {
        super.init()
    }

    func activate() {
        guard let session else { return }
        session.delegate = self
        session.activate()
    }
}

extension PhoneQuotaBridge: WCSessionDelegate {
    nonisolated func session(
        _ session: WCSession,
        activationDidCompleteWith activationState: WCSessionActivationState,
        error: Error?
    ) {
        if let error {
            print("Phone quota bridge activation failed: \(error.localizedDescription)")
        }
    }

    nonisolated func sessionDidBecomeInactive(_ session: WCSession) {}

    nonisolated func sessionDidDeactivate(_ session: WCSession) {
        session.activate()
    }

    nonisolated func session(
        _ session: WCSession,
        didReceiveMessage message: [String: Any],
        replyHandler: @escaping ([String: Any]) -> Void
    ) {
        guard message[QuotaBridgeCodec.messageTypeKey] as? String == QuotaBridgeCodec.refreshQuotaMessage else {
            replyHandler([QuotaBridgeCodec.errorKey: "未知请求"])
            return
        }

        let force = message[QuotaBridgeCodec.forceKey] as? Bool ?? false
        let serviceId = message[QuotaBridgeCodec.serviceIdKey] as? String

        nonisolated(unsafe) let reply = replyHandler

        Task {
            do {
                let summary = try await QuotaAPI.refreshSummary(force: force, serviceId: serviceId)
                let payload = try QuotaBridgeCodec.encode(summary)
                reply([QuotaBridgeCodec.payloadKey: payload])
            } catch {
                let message = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
                reply([QuotaBridgeCodec.errorKey: message])
            }
        }
    }
}
