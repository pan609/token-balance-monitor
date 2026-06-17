import SwiftUI

@MainActor
final class WatchBalanceStore: ObservableObject {
    @Published private(set) var state: WatchBalanceState = .idle
    @Published private(set) var isRefreshing = false
    @Published private(set) var isUpdatingPrimaryProvider = false
    @Published var transientMessage: String?

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
        } catch {
            let message = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
            if hasLoadedSummary {
                transientMessage = message
            } else {
                state = .failed(message)
            }
        }

        isRefreshing = false
    }

}

enum WatchBalanceState {
    case idle
    case loading
    case loaded(QuotaSummary)
    case failed(String)
}
