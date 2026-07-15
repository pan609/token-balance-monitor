import SwiftUI

@main
struct TokenBalanceMonitorApp: App {
    init() {
        PhoneQuotaBridge.shared.activate()
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}
