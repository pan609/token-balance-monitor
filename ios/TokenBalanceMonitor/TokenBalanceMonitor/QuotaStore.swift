import Foundation
import WidgetKit

@MainActor
final class QuotaStore: ObservableObject {
    enum LoadState: Equatable {
        case idle
        case loading
        case loaded(QuotaSummary)
        case failed(String)
    }

    @Published private(set) var state: LoadState = .idle
    @Published private(set) var isRefreshing = false
    @Published var transientMessage: String?

    private let cacheKey = "ios.quota.lastSummary"

    init() {
        if let cachedSummary = Self.loadCachedSummary(key: cacheKey) {
            state = .loaded(cachedSummary)
        }
    }

    func refresh(forceLive: Bool = false, serviceId: String? = nil) async {
        guard !isRefreshing else { return }
        isRefreshing = true
        transientMessage = nil

        if !state.isLoaded {
            state = .loading
        }

        do {
            let summary = try await QuotaAPI.refreshSummary(force: forceLive, serviceId: serviceId)
            state = .loaded(summary)
            cache(summary)
            WidgetCenter.shared.reloadAllTimelines()
        } catch {
            let message = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
            if state.isLoaded {
                transientMessage = message
            } else {
                state = .failed(message)
            }
        }

        isRefreshing = false
    }

    func runAutoRefresh() async {
        await refresh(forceLive: true)

        while !Task.isCancelled {
            try? await Task.sleep(nanoseconds: 60 * 1_000_000_000)
            if Task.isCancelled { return }
            await refresh(forceLive: false)
        }
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

private extension QuotaStore.LoadState {
    var isLoaded: Bool {
        if case .loaded = self {
            return true
        }
        return false
    }
}
