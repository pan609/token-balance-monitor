import SwiftUI

@main
struct TokenBalanceWatchApp: App {
    init() {
        WatchPhoneQuotaBridge.shared.activate()
    }

    var body: some Scene {
        WindowGroup {
            WatchContentView()
        }
    }
}
