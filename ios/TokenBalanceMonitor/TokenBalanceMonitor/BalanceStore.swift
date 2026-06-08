import Foundation
import UserNotifications
import WidgetKit

@MainActor
final class BalanceStore: ObservableObject {
    enum LoadState: Equatable {
        case idle
        case loading
        case loaded(MobileSummary)
        case failed(String)
    }

    @Published private(set) var state: LoadState = .idle
    @Published private(set) var isUpdatingPrimaryProvider = false
    @Published var primaryUpdateErrorMessage: String?

    func refresh(showLoading: Bool = true) async {
        let shouldShowLoading = showLoading || state == .idle
        if shouldShowLoading {
            state = .loading
        }

        do {
            let summary = try await TokenMonitorAPI.fetchSummary()
            state = .loaded(summary)
            await LowBalanceNotifier.shared.notifyIfNeeded(summary)
        } catch {
            if shouldShowLoading || !state.isLoaded {
                state = .failed(error.localizedDescription)
            }
        }
    }

    func runAutoRefresh() async {
        await refresh()

        while !Task.isCancelled {
            try? await Task.sleep(nanoseconds: 60 * 1_000_000_000)
            if Task.isCancelled { return }
            await refresh(showLoading: false)
        }
    }

    func setPrimaryProvider(_ providerId: String) async {
        guard !isUpdatingPrimaryProvider else { return }

        isUpdatingPrimaryProvider = true
        primaryUpdateErrorMessage = nil
        defer {
            isUpdatingPrimaryProvider = false
        }

        do {
            let summary = try await TokenMonitorAPI.setPrimaryProvider(providerId)
            state = .loaded(summary)
            WidgetCenter.shared.reloadAllTimelines()
            await LowBalanceNotifier.shared.notifyIfNeeded(summary)
        } catch {
            primaryUpdateErrorMessage = error.localizedDescription
        }
    }
}

private extension BalanceStore.LoadState {
    var isLoaded: Bool {
        if case .loaded = self {
            return true
        }
        return false
    }
}

actor LowBalanceNotifier {
    static let shared = LowBalanceNotifier()

    func notifyIfNeeded(_ summary: MobileSummary) async {
        guard
            summary.primaryIsBelowAlert,
            let provider = summary.primary,
            let amount = provider.amount
        else { return }

        let now = Date()
        let lastNotificationKey = "lastLowBalanceNotificationAt-\(summary.primaryProvider)"
        let last = UserDefaults.standard.object(forKey: lastNotificationKey) as? Date
        if let last, now.timeIntervalSince(last) < 60 * 60 {
            return
        }

        let center = UNUserNotificationCenter.current()
        var settings = await center.notificationSettings()
        if settings.authorizationStatus == .notDetermined {
            _ = try? await center.requestAuthorization(options: [.alert, .sound, .badge])
            settings = await center.notificationSettings()
        }
        guard settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional else {
            return
        }

        let content = UNMutableNotificationContent()
        content.title = "\(provider.shortName)余额偏低"
        content.body = "当前余额 \(amount.moneyText(currency: provider.currency))，已低于 \(summary.alertThresholdCny.yuanText)。"
        content.sound = .default

        let request = UNNotificationRequest(
            identifier: "\(summary.primaryProvider)-low-balance",
            content: content,
            trigger: nil
        )
        try? await UNUserNotificationCenter.current().add(request)
        UserDefaults.standard.set(now, forKey: lastNotificationKey)
    }
}
