import SwiftUI
import WidgetKit

@MainActor
final class WatchBalanceStore: ObservableObject {
    @Published private(set) var state: WatchBalanceState = .idle
    @Published private(set) var isRefreshing = false
    @Published private(set) var isUpdatingPrimaryProvider = false
    @Published var transientMessage: String?

    private let cacheKey = "watch.quota.lastSummary"

    init() {
        if let cachedSummary = Self.loadCachedSummary(key: cacheKey) {
            state = .loaded(cachedSummary)
        }
    }

    private var hasLoadedSummary: Bool {
        if case .loaded = state { return true }
        return false
    }

    func refresh(forceLive: Bool = false, serviceId: String? = nil) async {
        if isRefreshing { return }
        isRefreshing = true
        transientMessage = nil

        if !hasLoadedSummary {
            state = .loading
        }

        do {
            let summary = try await QuotaAPI.refreshSummary(force: forceLive, serviceId: serviceId)
            state = .loaded(summary)
            cache(summary)
            WidgetCenter.shared.reloadAllTimelines()
        } catch {
            let directMessage = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
            print("Watch direct quota refresh failed: \(directMessage)")

            do {
                let summary = try await WatchPhoneQuotaBridge.shared.refreshSummary(force: forceLive, serviceId: serviceId)
                state = .loaded(summary)
                cache(summary)
                transientMessage = "已通过 iPhone 同步"
                WidgetCenter.shared.reloadAllTimelines()
            } catch {
                let relayMessage = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
                let message = "手表直连失败：\(directMessage)\n\niPhone 中继失败：\(relayMessage)"
                print("Watch relayed quota refresh failed: \(relayMessage)")
                if hasLoadedSummary {
                    transientMessage = message
                } else {
                    state = .failed(message)
                }
            }
        }

        isRefreshing = false
    }

    private func cache(_ summary: QuotaSummary) {
        guard let data = try? QuotaBridgeCodec.encode(summary) else { return }
        UserDefaults.standard.set(data, forKey: cacheKey)
    }

    private static func loadCachedSummary(key: String) -> QuotaSummary? {
        guard let data = UserDefaults.standard.data(forKey: key) else { return nil }
        return try? QuotaBridgeCodec.decode(data)
    }
}

enum WatchBalanceState {
    case idle
    case loading
    case loaded(QuotaSummary)
    case failed(String)
}
